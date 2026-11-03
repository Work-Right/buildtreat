import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import { sqliteD1 } from '$lib/server/test/sqlite-d1';
import { fakeR2 } from '$lib/server/test/fake-r2';
import { event, type EventInit } from '$lib/server/test/event';
import { getSection, listSections, listUpdates } from '$lib/server/site/sections';
import { photosFor } from '$lib/server/site/photos';
import { listBskyPostUris } from '$lib/server/site/bsky-posts';
import { loadSite } from '$lib/server/site/page';
import { actions, load } from './+page.server';

/**
 * Action-level tests: the real load and form actions, called with a
 * constructed event over the real schema (sqliteD1) and a Map-backed R2.
 */

type ActionName = keyof typeof actions;
type ActionResult = { status?: number; data?: Record<string, unknown> } & Record<string, unknown>;

const run = async (name: ActionName, init: EventInit): Promise<ActionResult> => {
	const action = actions[name]!;
	return (await action(event<Parameters<typeof action>[0]>(init))) as ActionResult;
};
const runLoad = async (init: EventInit) =>
	(await load(event<Parameters<typeof load>[0]>({ ...init, path: '/organizer/retreat' }))) as Record<string, unknown>;

const media = (name: string) => new Uint8Array(readFileSync(join(process.cwd(), 'static/media', name)));
const includes = (hay: Uint8Array, needle: string) => Buffer.from(hay).includes(Buffer.from(needle, 'latin1'));

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});
function crc32(bytes: Uint8Array): number {
	let c = 0xffffffff;
	for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}
/** A PNG chunk with a valid CRC (over type + data). */
function pngChunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
	const out = new Uint8Array(12 + data.length);
	const view = new DataView(out.buffer);
	view.setUint32(0, data.length);
	out.set(new TextEncoder().encode(type), 4);
	out.set(data, 8);
	view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
	return out;
}
/** The real PNG with an eXIf and a tEXt chunk spliced in before the first IDAT. */
function pngWithMetadata(png: Uint8Array): Uint8Array<ArrayBuffer> {
	const at = Buffer.from(png).indexOf(Buffer.from('IDAT', 'latin1')) - 4;
	const exif = pngChunk('eXIf', new Uint8Array([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00]));
	const text = pngChunk('tEXt', new TextEncoder().encode('Comment\0private note'));
	return new Uint8Array([...png.subarray(0, at), ...exif, ...text, ...png.subarray(at)]);
}

async function newSection(db: D1Database, kind?: 'update'): Promise<number> {
	const r = await run('create', { db, form: kind ? { kind } : {} });
	return r.sectionId as number;
}

describe('auth', () => {
	const names: ActionName[] = ['create', 'save', 'move', 'upload', 'bskyAdd', 'bskyRemove', 'delete', 'photoAlt', 'photoMove'];

	it('load: signed out → 303 to /organizer; non-organizer → 404', async () => {
		const db = sqliteD1();
		await expect(runLoad({ db, did: null })).rejects.toMatchObject({ status: 303, location: '/organizer' });
		await expect(runLoad({ db, did: 'did:plc:someone' })).rejects.toMatchObject({ status: 404 });
	});

	it.each(names)('%s: signed out → 303; non-organizer → 404; nothing written', async (name) => {
		const db = sqliteD1();
		const { bucket } = fakeR2();
		const before = await listSections(db);
		await expect(run(name, { db, media: bucket, did: null, form: { id: '1' } })).rejects.toMatchObject({
			status: 303,
			location: '/organizer'
		});
		await expect(run(name, { db, media: bucket, did: 'did:plc:someone', form: { id: '1' } })).rejects.toMatchObject({ status: 404 });
		expect(await listSections(db)).toEqual(before);
	});

	it('load for an organizer returns the console data', async () => {
		const db = sqliteD1();
		const seeded = (await listSections(db)).length;
		const id = await newSection(db);
		const data = await runLoad({ db });
		const sections = data.sections as Array<{ id: number; photos: unknown[] }>;
		expect(sections).toHaveLength(seeded + 1);
		expect(sections.at(-1)).toMatchObject({ id, photos: [] });
		expect(data.mediaConfigured).toBe(false);
		expect(data.preview).toBe(false);
	});
});

describe('sections', () => {
	it('create → save changes the row; a stale updatedAt is a 409', async () => {
		const db = sqliteD1();
		const id = await newSection(db);
		const before = (await getSection(db, id))!;
		expect(before).toMatchObject({ title: 'New section', visibility: 'hidden', kind: 'section' });

		const form = {
			id: String(id),
			title: ' Getting there ',
			body: 'Fly into **PSP**.',
			visibility: 'invited',
			updatedAt: before.updatedAt
		};
		// updatedAt is millisecond ISO; make sure the save's timestamp differs.
		await new Promise((r) => setTimeout(r, 2));
		expect(await run('save', { db, form })).toMatchObject({ message: 'Saved', sectionId: id });
		expect(await getSection(db, id)).toMatchObject({ title: 'Getting there', body: 'Fly into **PSP**.', visibility: 'invited' });

		const second = await run('save', { db, form: { ...form, title: 'Overwrite' } });
		expect(second).toMatchObject({ status: 409, data: { message: 'Changed elsewhere — reload first' } });
		expect((await getSection(db, id))!.title).toBe('Getting there');
	});

	it('save rejects invalid input and a missing section', async () => {
		const db = sqliteD1();
		const id = await newSection(db);
		const { updatedAt } = (await getSection(db, id))!;
		expect(await run('save', { db, form: { id: String(id), title: '', body: '', visibility: 'public', updatedAt } })).toMatchObject({
			status: 400
		});
		expect(await run('save', { db, form: { id: String(id), title: 'x', body: '', visibility: 'everyone', updatedAt } })).toMatchObject({
			status: 400
		});
		expect(await run('save', { db, form: { id: '999', title: 'x', body: '', visibility: 'public', updatedAt } })).toMatchObject({
			status: 404
		});
	});

	it('move up/down reorders page sections', async () => {
		const db = sqliteD1();
		const [a, b, c] = [await newSection(db), await newSection(db), await newSection(db)];
		const tail = async () => (await listSections(db)).map((s) => s.id).slice(-3);
		await run('move', { db, form: { id: String(c), direction: 'up' } });
		expect(await tail()).toEqual([a, c, b]);
		await run('move', { db, form: { id: String(a), direction: 'down' } });
		expect(await tail()).toEqual([c, a, b]);
		expect(await run('move', { db, form: { id: String(a), direction: 'sideways' } })).toMatchObject({ status: 400 });
	});

	it('delete with R2 removes the photos’ rows and objects', async () => {
		const db = sqliteD1();
		const { bucket, objects } = fakeR2();
		const id = await newSection(db);
		const jpeg = new File([media('email-hero.jpg')], 'hero.jpg', { type: 'image/jpeg' });
		await run('upload', { db, media: bucket, form: { id: String(id), photo: jpeg } });
		expect(objects.size).toBe(1);
		expect(await run('delete', { db, media: bucket, form: { id: String(id) } })).toMatchObject({ message: 'Section deleted' });
		expect(objects.size).toBe(0);
		expect(await getSection(db, id)).toBeNull();
		expect((await photosFor(db, [id])).get(id)).toEqual([]);
		expect(await run('delete', { db, media: bucket, form: { id: String(id) } })).toMatchObject({ status: 404 });
	});

	it('delete without R2: a section with photos is a 503, one without is deleted', async () => {
		const db = sqliteD1();
		const { bucket } = fakeR2();
		const withPhotos = await newSection(db);
		const bare = await newSection(db);
		const jpeg = new File([media('email-hero.jpg')], 'hero.jpg', { type: 'image/jpeg' });
		await run('upload', { db, media: bucket, form: { id: String(withPhotos), photo: jpeg } });

		expect(await run('delete', { db, form: { id: String(withPhotos) } })).toMatchObject({ status: 503 });
		expect(await getSection(db, withPhotos)).not.toBeNull();
		expect(await run('delete', { db, form: { id: String(bare) } })).toMatchObject({ message: 'Section deleted' });
		expect(await getSection(db, bare)).toBeNull();
	});
});

describe('photo upload (real image bytes)', () => {
	it('stores metadata-free bytes with server-derived sizes; then alt, move, delete', async () => {
		const db = sqliteD1();
		const { bucket, objects } = fakeR2();
		const id = await newSection(db);
		const jpegBytes = media('email-hero.jpg'); // 1100×696, carries an APP1 Exif segment
		const pngBytes = pngWithMetadata(media('item-travel.png')); // 1024×1536 + eXIf + tEXt
		expect(includes(jpegBytes, 'Exif')).toBe(true);
		expect(includes(pngBytes, 'eXIf') && includes(pngBytes, 'tEXt')).toBe(true);
		expect(jpegBytes.length + pngBytes.length).toBeLessThan(8 * 1024 * 1024);

		const result = await run('upload', {
			db,
			media: bucket,
			form: {
				id: String(id),
				photo: [new File([jpegBytes], 'hero.jpg', { type: 'image/jpeg' }), new File([pngBytes], 'travel.png', { type: 'image/png' })]
			}
		});
		expect(result).toMatchObject({ message: 'Added 2 photos — add alt text to show them', sectionId: id });

		const photos = (await photosFor(db, [id])).get(id)!;
		expect(photos.map((p) => [p.contentType, p.width, p.height])).toEqual([
			['image/jpeg', 1100, 696],
			['image/png', 1024, 1536]
		]);
		const [jpg, png] = photos;
		const storedJpeg = objects.get(jpg.id)!;
		expect(storedJpeg.type).toBe('image/jpeg');
		expect(includes(storedJpeg.bytes, 'Exif')).toBe(false);
		expect([storedJpeg.bytes[0], storedJpeg.bytes[1]]).toEqual([0xff, 0xd8]);
		const storedPng = objects.get(png.id)!.bytes;
		expect(includes(storedPng, 'eXIf')).toBe(false);
		expect(includes(storedPng, 'tEXt')).toBe(false);
		expect(includes(storedPng, 'IDAT')).toBe(true);

		// Alt text, reorder, delete.
		expect(await run('photoAlt', { db, form: { id: String(id), photo: jpg.id, alt: '  The pool at dusk ' } })).toMatchObject({
			message: 'Alt text saved'
		});
		expect((await photosFor(db, [id])).get(id)![0].alt).toBe('The pool at dusk');
		expect(await run('photoAlt', { db, form: { photo: 'nope', alt: 'x' } })).toMatchObject({ status: 404 });

		await run('photoMove', { db, form: { id: String(id), photo: png.id, direction: 'up' } });
		expect((await photosFor(db, [id])).get(id)!.map((p) => p.id)).toEqual([png.id, jpg.id]);

		expect(await run('photoDelete', { db, media: bucket, form: { id: String(id), photo: jpg.id } })).toMatchObject({
			message: 'Photo deleted'
		});
		expect((await photosFor(db, [id])).get(id)!.map((p) => p.id)).toEqual([png.id]);
		expect(objects.has(jpg.id)).toBe(false);
		expect(objects.has(png.id)).toBe(true);
	});

	it('rejects an unknown section, oversize and unsupported files; needs R2', async () => {
		const db = sqliteD1();
		const { bucket, objects } = fakeR2();
		const jpeg = () => new File([media('email-hero.jpg')], 'hero.jpg', { type: 'image/jpeg' });

		expect(await run('upload', { db, media: bucket, form: { id: '999', photo: jpeg() } })).toMatchObject({ status: 404 });
		expect(objects.size).toBe(0);

		const id = String(await newSection(db));
		const big = new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' });
		expect(await run('upload', { db, media: bucket, form: { id, photo: big } })).toMatchObject({
			status: 400,
			data: { message: 'big.jpg: Photos max out at 8 MB' }
		});
		const gif = new File([new TextEncoder().encode('GIF89a')], 'x.gif', { type: 'image/gif' });
		expect(await run('upload', { db, media: bucket, form: { id, photo: gif } })).toMatchObject({
			status: 400,
			data: { message: 'x.gif: Photos must be JPEG, PNG or WebP' }
		});
		const fake = new File([new TextEncoder().encode('not a jpeg')], 'fake.jpg', { type: 'image/jpeg' });
		expect(await run('upload', { db, media: bucket, form: { id, photo: fake } })).toMatchObject({ status: 400 });
		expect(objects.size).toBe(0);

		expect(await run('upload', { db, form: { id, photo: jpeg() } })).toMatchObject({ status: 503 });
	});

	it('caps a request at 6 photos / 24 MB before reading any bytes', async () => {
		const db = sqliteD1();
		const { bucket, objects } = fakeR2();
		const id = String(await newSection(db));
		const read = vi.spyOn(File.prototype, 'arrayBuffer');
		try {
			const small = (n: number) => new File([media('email-hero.jpg')], `p${n}.jpg`, { type: 'image/jpeg' });
			const seven = Array.from({ length: 7 }, (_, n) => small(n));
			expect(await run('upload', { db, media: bucket, form: { id, photo: seven } })).toMatchObject({
				status: 400,
				data: { message: 'Upload at most 6 photos (24 MB) at a time', sectionId: Number(id) }
			});
			// Four files each under the 8 MB per-photo limit, 28 MB together.
			const heavy = Array.from({ length: 4 }, (_, n) => new File([new Uint8Array(7 * 1024 * 1024)], `h${n}.jpg`, { type: 'image/jpeg' }));
			expect(await run('upload', { db, media: bucket, form: { id, photo: heavy } })).toMatchObject({
				status: 400,
				data: { message: 'Upload at most 6 photos (24 MB) at a time' }
			});
			expect(read).not.toHaveBeenCalled();
			expect(objects.size).toBe(0);
		} finally {
			read.mockRestore();
		}
	});
});

describe('updates', () => {
	it('a saved update lists by date; the public tier sees only public updates', async () => {
		const db = sqliteD1();
		const pub = await newSection(db, 'update');
		const inv = await newSection(db, 'update');
		const hid = await newSection(db, 'update');
		for (const [id, visibility, day] of [
			[pub, 'public', '2026-10-15'],
			[inv, 'invited', '2026-10-20'],
			[hid, 'hidden', '2026-10-25']
		] as const) {
			const { updatedAt } = (await getSection(db, id))!;
			const r = await run('save', {
				db,
				form: { id: String(id), title: `${visibility} news`, body: 'Hi', visibility, kind: 'update', publishedAt: day, updatedAt }
			});
			expect(r).toMatchObject({ message: 'Saved' });
		}
		// An update without a date is refused.
		const { updatedAt } = (await getSection(db, pub))!;
		expect(
			await run('save', { db, form: { id: String(pub), title: 'x', body: '', visibility: 'public', kind: 'update', updatedAt } })
		).toMatchObject({ status: 400, data: { message: 'Pick a publish date for the update' } });

		expect((await listUpdates(db)).map((u) => [u.id, u.publishedAt])).toEqual([
			[hid, '2026-10-25'],
			[inv, '2026-10-20'],
			[pub, '2026-10-15']
		]);
		const pageIds = (await listSections(db)).map((s) => s.id);
		expect(pageIds).not.toContain(pub);

		const site = await loadSite({ db, organizerDids: 'did:plc:org1', origin: 'http://x', who: null, asParam: null });
		expect(site.tier).toBe('public');
		expect(site.posts.map((p) => p.key)).toEqual([`u:${pub}`]);
		// An invited (allowlisted, non-organizer) builder sees invited + public, never hidden.
		await db.prepare(`INSERT INTO allowlist (handle, did) VALUES (?1, ?2)`).bind('friend.test', 'did:plc:friend').run();
		const who = { did: 'did:plc:friend', handle: 'friend.test' };
		const invited = await loadSite({ db, organizerDids: 'did:plc:org1', origin: 'http://x', who, asParam: null });
		expect(invited.tier).toBe('invited');
		expect(invited.organizer).toBe(false);
		expect(invited.posts.map((p) => p.key)).toEqual([`u:${inv}`, `u:${pub}`]);
		// A signed-in stranger is public.
		const stranger = await loadSite({
			db,
			organizerDids: 'did:plc:org1',
			origin: 'http://x',
			who: { did: 'did:plc:nobody', handle: 'nobody.test' },
			asParam: null
		});
		expect(stranger.posts.map((p) => p.key)).toEqual([`u:${pub}`]);
		// The organizer's default view is the invited one too.
		const org = await loadSite({
			db,
			organizerDids: 'did:plc:org1',
			origin: 'http://x',
			who: { did: 'did:plc:org1', handle: null },
			asParam: null
		});
		expect(org.posts.map((p) => p.key)).toEqual([`u:${inv}`, `u:${pub}`]);
	});
});

describe('Bluesky posts', () => {
	const DID = 'did:plc:abcdefghijklmnopqrstuvwx';
	const URI = `at://${DID}/app.bsky.feed.post/3kabc`;
	const calls: string[] = [];

	function stubAppview(opts: { down?: boolean } = {}) {
		calls.length = 0;
		vi.stubGlobal('fetch', async (input: string) => {
			calls.push(input);
			const url = new URL(input);
			if (url.origin !== 'https://public.api.bsky.app') throw new Error(`unexpected host ${url.origin}`);
			if (opts.down) return new Response('busy', { status: 503 });
			if (url.pathname === '/xrpc/com.atproto.identity.resolveHandle') {
				return Response.json(url.searchParams.get('handle') === 'alice.bsky.social' ? { did: DID } : {}, {
					status: url.searchParams.get('handle') === 'alice.bsky.social' ? 200 : 400
				});
			}
			if (url.pathname === '/xrpc/app.bsky.feed.getPosts') {
				const wanted = url.searchParams.getAll('uris');
				const posts = wanted.includes(URI)
					? [
							{
								uri: URI,
								author: { did: DID, handle: 'alice.bsky.social', displayName: 'Alice' },
								record: { text: 'Hello retreat', createdAt: '2026-10-01T18:00:00Z' },
								indexedAt: '2026-10-01T18:00:01Z'
							}
						]
					: [];
				return Response.json({ posts });
			}
			return new Response('not found', { status: 404 });
		});
	}

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('adds a post by its bsky.app link, lists it in the console, then removes it', async () => {
		stubAppview();
		const db = sqliteD1();
		const added = await run('bskyAdd', { db, form: { url: 'https://bsky.app/profile/alice.bsky.social/post/3kabc' } });
		expect(added).toMatchObject({ message: 'Post added to the stream', bsky: true });
		expect(await listBskyPostUris(db)).toEqual([URI]);
		expect(calls.every((c) => c.startsWith('https://public.api.bsky.app/xrpc/'))).toBe(true);

		const again = await run('bskyAdd', { db, form: { url: 'https://bsky.app/profile/alice.bsky.social/post/3kabc' } });
		expect(again).toMatchObject({ message: 'That post is already in the stream' });

		const data = await runLoad({ db });
		expect(data.bskyPosts).toEqual([
			{ uri: URI, url: `https://bsky.app/profile/${DID}/post/3kabc`, author: '@alice.bsky.social', excerpt: 'Hello retreat' }
		]);

		expect(await run('bskyRemove', { db, form: { uri: URI } })).toMatchObject({ message: 'Post removed from the stream' });
		expect(await listBskyPostUris(db)).toEqual([]);
		expect(await run('bskyRemove', { db, form: { uri: URI } })).toMatchObject({ status: 404 });
	});

	it('a malformed link never fetches; an appview outage says so', async () => {
		stubAppview();
		const db = sqliteD1();
		const bad = await run('bskyAdd', { db, form: { url: 'https://evil.example/profile/alice.bsky.social/post/3kabc' } });
		expect(bad).toMatchObject({ status: 400 });
		expect((bad.data as { message: string }).message).toMatch(/^Paste a post link like https:\/\/bsky\.app\/profile\//);
		expect(calls).toEqual([]);

		stubAppview({ down: true });
		const down = await run('bskyAdd', { db, form: { url: 'https://bsky.app/profile/alice.bsky.social/post/3kabc' } });
		expect(down).toMatchObject({ status: 502, data: { message: 'Couldn’t reach Bluesky — try again in a minute' } });
		expect(await listBskyPostUris(db)).toEqual([]);
	});

	it('an unknown handle says so; a post that doesn’t load is a 404', async () => {
		stubAppview();
		const db = sqliteD1();
		const unknown = await run('bskyAdd', { db, form: { url: 'https://bsky.app/profile/nobody.bsky.social/post/3kabc' } });
		expect(unknown).toMatchObject({ status: 400, data: { message: 'No Bluesky account with that handle — check the link' } });
		const missing = await run('bskyAdd', { db, form: { url: 'https://bsky.app/profile/alice.bsky.social/post/3kgone' } });
		expect(missing).toMatchObject({
			status: 404,
			data: { message: 'Couldn’t load that post from Bluesky — check the link, or try again in a minute' }
		});
		expect(await listBskyPostUris(db)).toEqual([]);
	});

	it('bskyRemove rejects a uri that is not a post AT-URI', async () => {
		const db = sqliteD1();
		expect(await run('bskyRemove', { db, form: { uri: 'https://bsky.app/x' } })).toMatchObject({ status: 400 });
		expect(await run('bskyRemove', { db, form: { uri: '' } })).toMatchObject({ status: 400 });
	});
});
