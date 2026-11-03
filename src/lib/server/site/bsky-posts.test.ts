import { describe, expect, it } from 'vitest';
import { sqliteD1 } from '$lib/server/test/sqlite-d1';
import {
	addBskyPost,
	hydrateBskyPosts,
	listBskyPostUris,
	parsePostUrl,
	removeBskyPost,
	resolveDid,
	type FetchLike
} from './bsky-posts';

const DID = 'did:plc:abcdefghijklmnopqrstuvwx';
const uriFor = (rkey: string) => `at://${DID}/app.bsky.feed.post/${rkey}`;

function post(rkey: string, extra: Record<string, unknown> = {}, record: Record<string, unknown> = {}) {
	return {
		uri: uriFor(rkey),
		cid: 'bafyfake',
		author: { did: DID, handle: 'alice.test', displayName: 'Alice', avatar: 'https://cdn.bsky.app/img/avatar/plain/a@jpeg' },
		record: { $type: 'app.bsky.feed.post', text: 'hello', createdAt: '2026-10-10T17:00:00.000Z', ...record },
		indexedAt: '2026-10-10T17:00:01.000Z',
		...extra
	};
}

function fakeFetch(handler: (url: URL) => unknown) {
	const calls: URL[] = [];
	const fn: FetchLike = async (input) => {
		const url = new URL(input);
		calls.push(url);
		const body = handler(url);
		if (body instanceof Response) return body;
		return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
	};
	return { fn, calls };
}

function memoryKv() {
	const store = new Map<string, string>();
	return {
		store,
		kv: {
			get: async (k: string) => store.get(k) ?? null,
			put: async (k: string, v: string) => {
				store.set(k, v);
			}
		}
	};
}

describe('parsePostUrl', () => {
	it('accepts handle and DID forms', () => {
		expect(parsePostUrl('https://bsky.app/profile/alice.bsky.social/post/3l6oveex3ii2l')).toEqual({
			actor: 'alice.bsky.social',
			rkey: '3l6oveex3ii2l'
		});
		expect(parsePostUrl(` https://bsky.app/profile/${DID}/post/3l6oveex3ii2l/ `)).toEqual({ actor: DID, rkey: '3l6oveex3ii2l' });
		expect(parsePostUrl('https://bsky.app/profile/did%3Aplc%3Aabcdefghijklmnopqrstuvwx/post/3l6oveex3ii2l')).toEqual({
			actor: DID,
			rkey: '3l6oveex3ii2l'
		});
	});

	it('rejects everything else', () => {
		for (const bad of [
			'http://bsky.app/profile/alice.bsky.social/post/3l6oveex3ii2l',
			'https://bsky.app.evil.com/profile/alice.bsky.social/post/3l6oveex3ii2l',
			'https://evil.com/https://bsky.app/profile/alice.bsky.social/post/3l6oveex3ii2l',
			'https://x@bsky.app/profile/alice.bsky.social/post/3l6oveex3ii2l',
			'https://bsky.app:8443/profile/alice.bsky.social/post/3l6oveex3ii2l',
			'https://bsky.app/profile/alice.bsky.social/post/3l6oveex3ii2l?ref=x',
			'https://bsky.app/profile/alice.bsky.social/post/3l6oveex3ii2l#x',
			'https://bsky.app/profile/alice.bsky.social/post/3l6oveex3ii2l/extra',
			'https://bsky.app/profile/alice.bsky.social/feed/3l6oveex3ii2l',
			'https://bsky.app/profile/alice.bsky.social/post/..',
			'https://bsky.app/profile/alice.bsky.social/post/a%2Fb',
			'https://bsky.app/profile/localhost/post/3l6oveex3ii2l',
			'https://bsky.app/profile/did:example:123/post/3l6oveex3ii2l',
			'javascript:alert(1)',
			''
		]) {
			expect(parsePostUrl(bad), bad).toBeNull();
		}
	});
});

describe('resolveDid — fixed host', () => {
	it('resolves a handle through the fixed appview host only, lowercased', async () => {
		const { fn, calls } = fakeFetch(() => ({ did: DID }));
		expect(await resolveDid('Alice.bsky.social', fn)).toEqual({ did: DID });
		expect(calls).toHaveLength(1);
		expect(calls[0].origin).toBe('https://public.api.bsky.app');
		expect(calls[0].pathname).toBe('/xrpc/com.atproto.identity.resolveHandle');
		expect(calls[0].searchParams.get('handle')).toBe('alice.bsky.social');
	});

	it('uses a DID directly without fetching', async () => {
		const { fn, calls } = fakeFetch(() => ({}));
		expect(await resolveDid(DID, fn)).toEqual({ did: DID });
		expect(calls).toHaveLength(0);
	});
});

describe('resolveDid', () => {
	it('tells an unknown handle (appview 400) from an unreachable appview', async () => {
		const ok = fakeFetch(() => ({ did: DID })).fn;
		expect(await resolveDid('alice.bsky.social', ok)).toEqual({ did: DID });
		expect(await resolveDid(DID, ok)).toEqual({ did: DID });
		const unknown = fakeFetch(() => new Response('{"error":"InvalidRequest"}', { status: 400 })).fn;
		expect(await resolveDid('nobody.bsky.social', unknown)).toBe('not-found');
		const down = fakeFetch(() => new Response('busy', { status: 503 })).fn;
		expect(await resolveDid('alice.bsky.social', down)).toBe('error');
		const throwing: FetchLike = async () => {
			throw new Error('timeout');
		};
		expect(await resolveDid('alice.bsky.social', throwing)).toBe('error');
		expect(await resolveDid('alice.bsky.social', fakeFetch(() => ({ did: 'junk' })).fn)).toBe('error');
	});
});

describe('hydrateBskyPosts', () => {
	it('maps to a safe view: http(s) link facets by byte offset, https thumbs, max 4', async () => {
		const images = Array.from({ length: 5 }, (_, i) => ({
			thumb: `https://cdn.bsky.app/img/feed_thumbnail/plain/x/${i}@jpeg`,
			fullsize: 'https://cdn.bsky.app/f',
			alt: `pic ${i}`
		}));
		images[1] = { ...images[1], thumb: 'http://insecure.example/x.jpg' };
		const store = new Map<string, unknown>([
			[
				uriFor('one'),
				post(
					'one',
					{ embed: { $type: 'app.bsky.embed.images#view', images } },
					{
						text: '👋 docs: example.com/x',
						facets: [
							{ index: { byteStart: 11, byteEnd: 24 }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'https://example.com/x' }] }
						]
					}
				)
			],
			[
				uriFor('two'),
				post(
					'two',
					{},
					{
						text: 'click me',
						facets: [
							{ index: { byteStart: 0, byteEnd: 5 }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'javascript:alert(1)' }] }
						]
					}
				)
			]
		]);
		const { fn } = fakeFetch((url) => ({
			posts: url.searchParams
				.getAll('uris')
				.map((u) => store.get(u))
				.filter(Boolean)
		}));
		const views = await hydrateBskyPosts([uriFor('one'), uriFor('two')], { fetch: fn });
		const one = views.get(uriFor('one'))!;
		expect(one.segments).toEqual([
			{ text: '👋 docs: ', href: null },
			{ text: 'example.com/x', href: 'https://example.com/x' }
		]);
		expect(one.images.map((i) => i.alt)).toEqual(['pic 0', 'pic 2', 'pic 3']);
		expect(one.url).toBe(`https://bsky.app/profile/${DID}/post/one`);
		expect(one.author).toEqual({
			did: DID,
			handle: 'alice.test',
			displayName: 'Alice',
			avatar: 'https://cdn.bsky.app/img/avatar/plain/a@jpeg'
		});
		expect(one.createdAt).toBe('2026-10-10T17:00:00.000Z');
		expect(views.get(uriFor('two'))!.segments).toEqual([{ text: 'click me', href: null }]);
	});

	it('batches at most 25 uris per request against the fixed host', async () => {
		const uris = Array.from({ length: 30 }, (_, i) => uriFor(`p${i}`));
		const { fn, calls } = fakeFetch((url) => ({ posts: url.searchParams.getAll('uris').map((u) => post(u.split('/').pop()!)) }));
		const views = await hydrateBskyPosts(uris, { fetch: fn });
		expect(views.size).toBe(30);
		expect(calls.map((c) => c.searchParams.getAll('uris').length)).toEqual([25, 5]);
		expect(calls.every((c) => c.origin === 'https://public.api.bsky.app' && c.pathname === '/xrpc/app.bsky.feed.getPosts')).toBe(true);
	});

	it('runs the batches in parallel; one failed batch keeps the others', async () => {
		const uris = Array.from({ length: 60 }, (_, i) => uriFor(`p${i}`));
		let inFlight = 0;
		let peak = 0;
		let n = 0;
		const fn: FetchLike = async (input) => {
			const batch = n++;
			inFlight++;
			peak = Math.max(peak, inFlight);
			await new Promise((r) => setTimeout(r, 5));
			inFlight--;
			if (batch === 1) return new Response('busy', { status: 503 });
			const posts = new URL(input).searchParams.getAll('uris').map((u) => post(u.split('/').pop()!));
			return new Response(JSON.stringify({ posts }), { status: 200 });
		};
		const views = await hydrateBskyPosts(uris, { fetch: fn });
		expect(n).toBe(3);
		expect(peak).toBe(3);
		expect(views.size).toBe(35);
		expect(views.has(uriFor('p30'))).toBe(false);
	});

	it('keeps avatars and thumbnails only from cdn.bsky.app', async () => {
		const raw = post('cdn', {
			author: { did: DID, handle: 'alice.test', avatar: 'https://tracker.example/a.jpg' },
			embed: {
				$type: 'app.bsky.embed.images#view',
				images: [
					{ thumb: 'https://cdn.bsky.app/img/feed_thumbnail/plain/x/1@jpeg', alt: 'kept' },
					{ thumb: 'https://cdn.bsky.app.evil.example/x.jpg', alt: 'lookalike' },
					{ thumb: 'https://example.com/x.jpg', alt: 'other host' }
				]
			}
		});
		const { fn } = fakeFetch(() => ({ posts: [raw] }));
		const view = (await hydrateBskyPosts([uriFor('cdn')], { fetch: fn })).get(uriFor('cdn'))!;
		expect(view.author.avatar).toBeNull();
		expect(view.images.map((i) => i.alt)).toEqual(['kept']);
	});

	it('caches hits and definitive misses for an hour; omits missing posts', async () => {
		const { store, kv } = memoryKv();
		const { fn, calls } = fakeFetch(() => ({ posts: [post('here')] }));
		const first = await hydrateBskyPosts([uriFor('here'), uriFor('gone')], { fetch: fn, kv });
		expect([...first.keys()]).toEqual([uriFor('here')]);
		expect(store.size).toBe(2);
		const second = await hydrateBskyPosts([uriFor('here'), uriFor('gone')], { fetch: fn, kv });
		expect([...second.keys()]).toEqual([uriFor('here')]);
		expect(calls).toHaveLength(1);
	});

	it('a failed request returns nothing and caches nothing', async () => {
		const { store, kv } = memoryKv();
		const failing: FetchLike = async () => {
			throw new Error('timeout');
		};
		expect((await hydrateBskyPosts([uriFor('x')], { fetch: failing, kv })).size).toBe(0);
		const http500 = fakeFetch(() => new Response('no', { status: 500 })).fn;
		expect((await hydrateBskyPosts([uriFor('x')], { fetch: http500, kv })).size).toBe(0);
		expect(store.size).toBe(0);
	});

	it('ignores stored uris that are not post at-uris', async () => {
		const { fn, calls } = fakeFetch(() => ({ posts: [] }));
		expect((await hydrateBskyPosts(['https://evil.example/x', `at://${DID}/app.bsky.actor.profile/self`], { fetch: fn })).size).toBe(0);
		expect(calls).toHaveLength(0);
	});
});

describe('site_bsky_posts', () => {
	it('adds once, lists newest first, removes', async () => {
		const db = sqliteD1();
		expect(await addBskyPost(db, uriFor('a'), 'did:plc:org1')).toBe('added');
		await new Promise((r) => setTimeout(r, 5));
		expect(await addBskyPost(db, uriFor('b'), 'did:plc:org1')).toBe('added');
		expect(await addBskyPost(db, uriFor('a'), 'did:plc:org1')).toBe('exists');
		expect(await listBskyPostUris(db)).toEqual([uriFor('b'), uriFor('a')]);
		expect(await removeBskyPost(db, uriFor('a'))).toBe(true);
		expect(await removeBskyPost(db, uriFor('a'))).toBe(false);
	});
});

describe('hydrateBskyPosts fresh', () => {
	it('skips a negative cache entry but still writes the result', async () => {
		const { store, kv } = memoryKv();
		store.set(`bskypost:v1:${uriFor('new')}`, JSON.stringify('gone'));
		const { fn, calls } = fakeFetch(() => ({ posts: [post('new')] }));
		expect((await hydrateBskyPosts([uriFor('new')], { fetch: fn, kv })).size).toBe(0);
		expect(calls).toHaveLength(0);
		expect((await hydrateBskyPosts([uriFor('new')], { fetch: fn, kv, fresh: true })).size).toBe(1);
		expect(JSON.parse(store.get(`bskypost:v1:${uriFor('new')}`)!)).toMatchObject({ uri: uriFor('new') });
	});
});

describe('image aspect ratio', () => {
	it('keeps a positive integer aspectRatio, else null', async () => {
		const images = [
			{ thumb: 'https://cdn.bsky.app/t/1@jpeg', alt: '', aspectRatio: { width: 1200, height: 800 } },
			{ thumb: 'https://cdn.bsky.app/t/2@jpeg', alt: 'x', aspectRatio: { width: -1, height: '8' } }
		];
		const { fn } = fakeFetch(() => ({ posts: [post('img', { embed: { $type: 'app.bsky.embed.images#view', images } })] }));
		const view = (await hydrateBskyPosts([uriFor('img')], { fetch: fn })).get(uriFor('img'))!;
		expect(view.images).toEqual([
			{ thumb: 'https://cdn.bsky.app/t/1@jpeg', alt: '', width: 1200, height: 800 },
			{ thumb: 'https://cdn.bsky.app/t/2@jpeg', alt: 'x', width: null, height: null }
		]);
	});
});
