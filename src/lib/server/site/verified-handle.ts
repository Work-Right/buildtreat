import { loadBskyProfiles } from '@svelte-atproto/oauth/bsky';
import type { KVNamespaceLike } from '@svelte-atproto/oauth/server/stores/cloudflare';
import { appviewProfileCache } from './appview-cache';

const HANDLE_RE = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;

/** A grammatical handle, lowercased; `handle.invalid` and junk → null. */
export const cleanHandle = (h: unknown): string | null =>
	typeof h === 'string' && h !== 'handle.invalid' && HANDLE_RE.test(h) ? h.toLowerCase() : null;

type ProfilesLoader = (
	dids: `did:${string}:${string}`[],
	options: { cache?: ReturnType<typeof appviewProfileCache> }
) => Promise<Record<string, { handle?: string } | undefined>>;

/**
 * The handle the public appview has verified for `did`, or null. This is the
 * ONLY handle that may match or pin an allowlist / late-pass row or decide a
 * viewer tier: `loadBskyProfile` falls back to the user's own PDS
 * (`describeRepo`) when the appview says `handle.invalid`, so its handle is a
 * claim anyone running a PDS can make. Appview-only batch call, `appview:`
 * cache namespace (never the PDS-fallback keys), short timeout, never throws.
 * Null means "match by DID only".
 */
export async function verifiedHandle(
	did: string,
	kv?: KVNamespaceLike,
	opts: { load?: ProfilesLoader; timeoutMs?: number } = {}
): Promise<string | null> {
	const load: ProfilesLoader = opts.load ?? loadBskyProfiles;
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const cache = kv ? appviewProfileCache(kv) : undefined;
		const lookup = load([did as `did:${string}:${string}`], { cache }).then((r) => cleanHandle(r[did]?.handle));
		const timeout = new Promise<null>((resolve) => {
			timer = setTimeout(() => resolve(null), opts.timeoutMs ?? 2500);
		});
		return await Promise.race([lookup, timeout]);
	} catch (e) {
		console.error('verified handle lookup failed', e);
		return null;
	} finally {
		clearTimeout(timer);
	}
}
