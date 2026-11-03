import type { D1Database } from '@cloudflare/workers-types';
import { isOrganizer } from '$lib/server/organizer/admin';

export const VISIBILITIES = ['public', 'invited', 'hidden'] as const;
export type Visibility = (typeof VISIBILITIES)[number];
export type ViewerTier = 'public' | 'invited' | 'organizer';

export function isVisibility(value: string): value is Visibility {
	return (VISIBILITIES as readonly string[]).includes(value);
}

/** The single visibility rule. Hidden is organizer-only, everywhere. */
export function canSee(tier: ViewerTier, visibility: Visibility): boolean {
	if (visibility === 'public') return true;
	if (visibility === 'invited') return tier !== 'public';
	return tier === 'organizer';
}

/**
 * Strict, read-only membership: a row matches by DID, or by handle only while
 * the row is not yet pinned to a DID (a row pinned to a different DID never
 * matches by handle, so a reclaimed handle inherits nothing). `table` is a
 * fixed literal, never user input.
 */
async function isMember(
	db: D1Database,
	table: 'allowlist' | 'late_passes',
	who: { did: string; handle: string | null }
): Promise<boolean> {
	const row = await db
		.prepare(
			`SELECT 1 FROM ${table} WHERE did = ?1 OR (did IS NULL AND lower(handle) = lower(?2)) LIMIT 1`
		)
		.bind(who.did, who.handle)
		.first();
	return row != null;
}

/**
 * Who is looking. Organizers come from ORGANIZER_DIDS; "invited" means strict
 * membership of the allowlist or late passes: an empty allowlist invites
 * nobody, and a handle only matches rows not yet pinned to a DID. Lookups are
 * read-only (no DID pinning on a page view). Unlike the courtesy gate on `/`,
 * this fails CLOSED: the invited tier unlocks the address, so any lookup error
 * means public.
 */
export async function viewerTier(
	db: D1Database | undefined,
	organizerDids: string | undefined,
	who: { did: string; handle: string | null } | null
): Promise<ViewerTier> {
	if (!who) return 'public';
	if (isOrganizer(organizerDids, who.did)) return 'organizer';
	if (!db) return 'public';
	try {
		if (await isMember(db, 'allowlist', who)) return 'invited';
		if (await isMember(db, 'late_passes', who)) return 'invited';
	} catch (e) {
		console.error('viewerTier lookup failed; treating as public', e);
	}
	return 'public';
}

/**
 * What `/` renders as. Organizers see the invited view by default (drafts
 * stay in the console) and may preview `?as=public` / `?as=invited`;
 * everyone else renders as their real tier and `?as` is ignored.
 */
export function pageTier(actual: ViewerTier, asParam: string | null): 'public' | 'invited' {
	if (actual !== 'organizer') return actual;
	return asParam === 'public' ? 'public' : 'invited';
}

/**
 * Dev-only capture aid for the photo route: the dev `?preview` home has no
 * real session, so its invited photos ask for `/media/site/{id}?preview`.
 * Callers pass compile-time `dev` from `$app/environment`; in production it
 * is false and `?preview` is ignored.
 */
export function photoTier(actual: ViewerTier, opts: { dev: boolean; preview: boolean }): ViewerTier {
	return opts.dev && opts.preview && actual === 'public' ? 'invited' : actual;
}
