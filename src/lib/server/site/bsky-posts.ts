import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

/**
 * Bluesky posts in the retreat posts stream (migration 0011).
 *
 * SSRF rule: the only host this module ever fetches is APPVIEW, with
 * organizer input reduced to validated identifiers and passed as encoded
 * query parameters. No URL derived from input is fetched. Every request has
 * a timeout; anything that doesn't resolve is omitted silently.
 */

export const APPVIEW = 'https://public.api.bsky.app';
const CACHE_TTL = 3600;
const CACHE_PREFIX = 'bskypost:v1:';
const BATCH = 25;

export type FetchLike = (input: string, init?: { signal?: AbortSignal }) => Promise<Response>;

/**
 * Global fetch, wrapped: Workers throw "Illegal invocation" when fetch is
 * called as a method of another object (`deps.fetch(...)`).
 */
export const appviewFetch: FetchLike = (input, init) => fetch(input, init);

export interface KvLike {
	get(key: string): Promise<string | null>;
	put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

/** Narrow the Workers KV binding to the two calls this module makes. */
export function kvLike(kv: KVNamespace | undefined): KvLike | undefined {
	if (!kv) return undefined;
	return { get: (key) => kv.get(key), put: (key, value, options) => kv.put(key, value, options) };
}

const HANDLE_RE = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const DID_SRC = 'did:(?:plc:[a-z2-7]{24}|web:[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?)';
const DID_RE = new RegExp(`^${DID_SRC}$`);
/** atproto record-key grammar; "." and ".." are excluded separately. */
const RKEY_SRC = '[A-Za-z0-9._:~-]{1,512}';
const RKEY_RE = new RegExp(`^${RKEY_SRC}$`);
const POST_URL_RE = /^https:\/\/bsky\.app\/profile\/([^/?#\s]+)\/post\/([^/?#\s]+)\/?$/;
const AT_URI_RE = new RegExp(`^at://(${DID_SRC})/app\\.bsky\\.feed\\.post/(${RKEY_SRC})$`);

const validRkey = (r: string) => RKEY_RE.test(r) && r !== '.' && r !== '..';

/** A stored post id: `at://<did>/app.bsky.feed.post/<rkey>`, nothing else. */
export const isPostUri = (v: string): boolean => v.length <= 2048 && AT_URI_RE.test(v);

/** Strictly `https://bsky.app/profile/<handle|did>/post/<rkey>` (optional trailing slash). */
export function parsePostUrl(input: string): { actor: string; rkey: string } | null {
	const trimmed = input.trim();
	if (trimmed.length > 800) return null;
	const m = POST_URL_RE.exec(trimmed);
	if (!m) return null;
	let actor: string;
	try {
		actor = decodeURIComponent(m[1]);
	} catch {
		return null;
	}
	const rkey = m[2];
	if (!validRkey(rkey)) return null;
	if (DID_RE.test(actor)) return { actor, rkey };
	if (HANDLE_RE.test(actor)) return { actor: actor.toLowerCase(), rkey };
	return null;
}

export type Resolved = { did: string } | 'not-found' | 'error';

/**
 * `actor` comes from parsePostUrl (a DID or a grammatical handle). DID
 * as-is; handle via the appview's resolveHandle. The appview answers 400
 * for a handle it can't resolve → 'not-found'; anything else that isn't a
 * valid DID (network, timeout, 5xx, junk body) → 'error'.
 */
export async function resolveDid(actor: string, fetchFn: FetchLike): Promise<Resolved> {
	if (DID_RE.test(actor)) return { did: actor };
	try {
		const url = new URL('/xrpc/com.atproto.identity.resolveHandle', APPVIEW);
		url.searchParams.set('handle', actor.toLowerCase());
		const res = await fetchFn(url.href, { signal: AbortSignal.timeout(3000) });
		if (res.status === 400) return 'not-found';
		if (!res.ok) return 'error';
		const data = (await res.json()) as { did?: unknown };
		return typeof data.did === 'string' && DID_RE.test(data.did) ? { did: data.did } : 'error';
	} catch {
		return 'error';
	}
}

export const postUri = (did: string, rkey: string) => `at://${did}/app.bsky.feed.post/${rkey}`;

export interface BskyPostView {
	uri: string;
	/** Web link, built from the DID and rkey — never from response text. */
	url: string;
	createdAt: string;
	author: { did: string; handle: string | null; displayName: string | null; avatar: string | null };
	/** Text split at link facets; render as text nodes, never {@html}. */
	segments: Array<{ text: string; href: string | null }>;
	/** Width/height from the appview's aspectRatio when present (reserves layout space). */
	images: Array<{ thumb: string; alt: string; width: number | null; height: number | null }>;
}

const obj = (v: unknown): Record<string, unknown> | null =>
	v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

function safeUrl(v: unknown, protocols: readonly string[]): string | null {
	if (typeof v !== 'string' || v.length > 2048) return null;
	try {
		const u = new URL(v);
		return protocols.includes(u.protocol) ? u.href : null;
	} catch {
		return null;
	}
}

/** Avatars and thumbnails come from the Bluesky CDN; any other host is dropped. */
const CDN = 'https://cdn.bsky.app/';
function cdnUrl(v: unknown): string | null {
	const href = safeUrl(v, ['https:']);
	return href && href.startsWith(CDN) ? href : null;
}

function isoOrNull(v: string | null): string | null {
	if (!v) return null;
	const t = Date.parse(v);
	return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function cleanName(v: unknown): string | null {
	const s = str(v)?.replace(/\s+/g, ' ').trim().slice(0, 64);
	return s || null;
}

/** Facet offsets are UTF-8 byte offsets into the text. */
function segmentsFrom(text: string, facets: unknown): BskyPostView['segments'] {
	const bytes = new TextEncoder().encode(text);
	const decoder = new TextDecoder();
	const links: Array<{ start: number; end: number; href: string }> = [];
	for (const f of Array.isArray(facets) ? facets : []) {
		const facet = obj(f);
		const index = obj(facet?.index);
		const start = index?.byteStart;
		const end = index?.byteEnd;
		if (typeof start !== 'number' || typeof end !== 'number' || !Number.isInteger(start) || !Number.isInteger(end)) continue;
		if (start < 0 || end > bytes.length || start >= end) continue;
		const features = Array.isArray(facet?.features) ? facet.features : [];
		const link = features.map(obj).find((x) => x?.$type === 'app.bsky.richtext.facet#link');
		const href = safeUrl(link?.uri, ['http:', 'https:']);
		if (href) links.push({ start, end, href });
	}
	links.sort((a, b) => a.start - b.start);
	const out: BskyPostView['segments'] = [];
	let at = 0;
	for (const l of links) {
		if (l.start < at) continue; // overlapping facet — keep the first
		if (l.start > at) out.push({ text: decoder.decode(bytes.slice(at, l.start)), href: null });
		out.push({ text: decoder.decode(bytes.slice(l.start, l.end)), href: l.href });
		at = l.end;
	}
	if (at < bytes.length) out.push({ text: decoder.decode(bytes.slice(at)), href: null });
	return out;
}

function imagesFrom(embed: unknown): BskyPostView['images'] {
	let e = obj(embed);
	if (e?.$type === 'app.bsky.embed.recordWithMedia#view') e = obj(e.media);
	if (!e || e.$type !== 'app.bsky.embed.images#view' || !Array.isArray(e.images)) return [];
	const out: BskyPostView['images'] = [];
	for (const raw of e.images.slice(0, 4)) {
		const img = obj(raw);
		const thumb = cdnUrl(img?.thumb);
		if (!thumb) continue;
		const ratio = obj(img?.aspectRatio);
		const w = ratio?.width;
		const h = ratio?.height;
		const sized = typeof w === 'number' && typeof h === 'number' && Number.isInteger(w) && Number.isInteger(h) && w > 0 && h > 0;
		out.push({ thumb, alt: (str(img?.alt) ?? '').slice(0, 2000), width: sized ? w : null, height: sized ? h : null });
	}
	return out;
}

function toView(raw: unknown): BskyPostView | null {
	const p = obj(raw);
	const uri = str(p?.uri);
	const m = uri ? AT_URI_RE.exec(uri) : null;
	const author = obj(p?.author);
	const record = obj(p?.record);
	if (!p || !uri || !m || !author || !record) return null;
	const did = str(author.did);
	if (did !== m[1]) return null;
	const createdAt = isoOrNull(str(record.createdAt)) ?? isoOrNull(str(p.indexedAt));
	if (!createdAt) return null;
	const handle = str(author.handle);
	return {
		uri,
		url: `https://bsky.app/profile/${did}/post/${m[2]}`,
		createdAt,
		author: {
			did,
			handle: handle && handle !== 'handle.invalid' && HANDLE_RE.test(handle) ? handle.toLowerCase() : null,
			displayName: cleanName(author.displayName),
			avatar: cdnUrl(author.avatar)
		},
		segments: segmentsFrom((str(record.text) ?? '').slice(0, 3000), record.facets),
		images: imagesFrom(p.embed)
	};
}

type Cached = BskyPostView | 'gone';

async function cacheGet(kv: KvLike | undefined, uri: string): Promise<Cached | null> {
	if (!kv) return null;
	try {
		const raw = await kv.get(CACHE_PREFIX + uri);
		if (!raw) return null;
		const v = JSON.parse(raw) as unknown;
		if (v === 'gone') return 'gone';
		return obj(v)?.uri === uri ? (v as BskyPostView) : null;
	} catch {
		return null;
	}
}

async function cachePut(kv: KvLike | undefined, uri: string, value: Cached): Promise<void> {
	if (!kv) return;
	try {
		await kv.put(CACHE_PREFIX + uri, JSON.stringify(value), { expirationTtl: CACHE_TTL });
	} catch (e) {
		console.error('bsky post cache write failed', e);
	}
}

/**
 * Hydrate stored post URIs into view models: KV first, then
 * app.bsky.feed.getPosts in batches of 25. Posts the appview doesn't return
 * are negative-cached; failed requests cache nothing. `fresh` skips the
 * cache read (still writes) — used when an organizer adds a post, so a
 * just-published post isn't held back by an earlier negative entry.
 */
export async function hydrateBskyPosts(
	uris: string[],
	deps: { fetch: FetchLike; kv?: KvLike; fresh?: boolean }
): Promise<Map<string, BskyPostView>> {
	const out = new Map<string, BskyPostView>();
	const valid = [...new Set(uris)].filter(isPostUri);
	const cached = deps.fresh ? valid.map(() => null) : await Promise.all(valid.map((u) => cacheGet(deps.kv, u)));
	const misses: string[] = [];
	valid.forEach((u, i) => {
		const hit = cached[i];
		if (hit === 'gone') return;
		if (hit) out.set(u, hit);
		else misses.push(u);
	});

	const batches: string[][] = [];
	for (let i = 0; i < misses.length; i += BATCH) batches.push(misses.slice(i, i + BATCH));
	// Batches run in parallel, each its own ≤ 25-URI request with its own timeout.
	await Promise.all(
		batches.map(async (batch) => {
			const url = new URL('/xrpc/app.bsky.feed.getPosts', APPVIEW);
			for (const u of batch) url.searchParams.append('uris', u);
			let posts: unknown[];
			try {
				const res = await deps.fetch(url.href, { signal: AbortSignal.timeout(4000) });
				if (!res.ok) return;
				const body = obj(await res.json());
				posts = Array.isArray(body?.posts) ? body.posts : [];
			} catch (e) {
				console.error('bsky getPosts failed', e);
				return;
			}
			for (const raw of posts) {
				const view = toView(raw);
				if (view && batch.includes(view.uri)) out.set(view.uri, view);
			}
			// The appview answered: anything it didn't return is gone (for an hour).
			await Promise.all(batch.map((u) => cachePut(deps.kv, u, out.get(u) ?? 'gone')));
		})
	);
	return out;
}

export async function listBskyPostUris(db: D1Database): Promise<string[]> {
	const { results } = await db.prepare(`SELECT uri FROM site_bsky_posts ORDER BY added_at DESC, uri`).all<{ uri: string }>();
	return results.map((r) => r.uri);
}

export async function addBskyPost(db: D1Database, uri: string, by: string): Promise<'added' | 'exists'> {
	const res = await db
		.prepare(`INSERT INTO site_bsky_posts (uri, added_at, added_by) VALUES (?1, ?2, ?3) ON CONFLICT(uri) DO NOTHING`)
		.bind(uri, new Date().toISOString(), by)
		.run();
	return (res.meta.changes ?? 0) > 0 ? 'added' : 'exists';
}

export async function removeBskyPost(db: D1Database, uri: string): Promise<boolean> {
	const res = await db.prepare(`DELETE FROM site_bsky_posts WHERE uri = ?1`).bind(uri).run();
	return (res.meta.changes ?? 0) > 0;
}

/** Console list row: unresolvable posts stay listed (so they can be removed). */
export interface BskyConsoleItem {
	uri: string;
	url: string | null;
	author: string | null;
	excerpt: string | null;
}

export function consoleItems(uris: string[], views: Map<string, BskyPostView>): BskyConsoleItem[] {
	return uris.map((uri) => {
		const v = views.get(uri);
		if (!v) return { uri, url: null, author: null, excerpt: null };
		return {
			uri,
			url: v.url,
			author: v.author.handle ? `@${v.author.handle}` : v.author.did,
			excerpt: v.segments
				.map((s) => s.text)
				.join('')
				.slice(0, 120)
		};
	});
}
