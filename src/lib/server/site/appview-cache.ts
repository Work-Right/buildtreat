import { cloudflareKV, type KVNamespaceLike } from '@svelte-atproto/oauth/server/stores/cloudflare';

/**
 * A view of a KV namespace with every key under `prefix`. Lets two caches
 * share one binding without reading each other's entries.
 */
export function prefixedKV(ns: KVNamespaceLike, prefix: string): KVNamespaceLike {
	return {
		get: (key, type) => ns.get(prefix + key, type),
		put: (key, value, options) => ns.put(prefix + key, value, options),
		delete: (key) => ns.delete(prefix + key),
		list: async (options) => {
			const page = await ns.list(options);
			return {
				...page,
				keys: page.keys.filter((k) => k.name.startsWith(prefix)).map((k) => ({ name: k.name.slice(prefix.length) }))
			};
		}
	};
}

export const APPVIEW_PREFIX = 'appview:';

/**
 * Profile cache for who's-coming cards. `loadBskyProfile` (the signed-in
 * visitor, the organizer avatar) can store a PDS describeRepo fallback under
 * the bare DID key in PROFILE_CACHE; a handle from there is unverified. The
 * attendee path reads and writes only `appview:`-prefixed keys, which only
 * `loadBskyProfiles` (public appview) ever fills.
 */
export function appviewProfileCache(ns: KVNamespaceLike, ttl = 3600) {
	return cloudflareKV(prefixedKV(ns, APPVIEW_PREFIX), { ttl });
}
