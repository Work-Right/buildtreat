import type { D1Database } from '@cloudflare/workers-types';
import { cleanHandle } from './verified-handle';

/**
 * Who's coming (migration 0011): organizer-curated confirmed registrants.
 * A confirmed registrant is status 'confirmed' with an agreement on file —
 * the same "complete registration" rule as the status strip. The public
 * list is shown = 1 AND still confirmed, so a later decline hides the card.
 * All SQL parameterized.
 */

export const BLURB_MAX = 140;

export interface ConsoleAttendee {
	did: string;
	handle: string | null;
	/** Registration name — organizer console only, never rendered publicly. */
	name: string;
	shown: boolean;
	blurb: string;
}

/** A console row plus its Bluesky avatar (null → the outline person glyph). */
export type ConsoleAttendeeView = ConsoleAttendee & { avatar: string | null };

export interface FeaturedAttendee {
	did: string;
	/** Registration handle — unverified; never rendered publicly (see hydrateAttendees). */
	handle: string | null;
	blurb: string;
}

export interface ProfileLite {
	handle?: string;
	displayName?: string;
	avatar?: string;
}

/** Injected so tests don't touch the network; production passes loadBskyProfiles. */
export type ProfileLoader = (dids: string[]) => Promise<Record<string, ProfileLite | undefined>>;

export interface AttendeeView {
	did: string;
	handle: string;
	displayName: string | null;
	avatar: string | null;
	blurb: string;
}

const CONFIRMED = `r.status = 'confirmed' AND r.agreed_at IS NOT NULL`;

export function validateBlurb(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
	if (typeof raw !== 'string') return { ok: false, error: 'The blurb must be text' };
	const value = raw.replace(/\s+/g, ' ').trim();
	if ([...value].length > BLURB_MAX) return { ok: false, error: `Blurbs max out at ${BLURB_MAX} characters` };
	return { ok: true, value };
}

export async function listConsoleAttendees(db: D1Database): Promise<ConsoleAttendee[]> {
	const { results } = await db
		.prepare(
			`SELECT r.did AS did, r.handle AS handle, r.name AS name,
			        COALESCE(f.blurb, '') AS blurb, COALESCE(f.shown, 0) AS shown
			 FROM registrations r LEFT JOIN site_featured f ON f.did = r.did
			 WHERE ${CONFIRMED}
			 ORDER BY COALESCE(f.shown, 0) DESC, CASE WHEN f.shown = 1 THEN f.position END, lower(r.name), r.did`
		)
		.all<{ did: string; handle: string | null; name: string; blurb: string; shown: number }>();
	return results.map((r) => ({ did: r.did, handle: r.handle, name: r.name, blurb: r.blurb, shown: r.shown === 1 }));
}

export async function shownAttendees(db: D1Database): Promise<FeaturedAttendee[]> {
	const { results } = await db
		.prepare(
			`SELECT f.did AS did, r.handle AS handle, f.blurb AS blurb
			 FROM site_featured f JOIN registrations r ON r.did = f.did
			 WHERE f.shown = 1 AND ${CONFIRMED}
			 ORDER BY f.position, f.did`
		)
		.all<FeaturedAttendee>();
	return results.map((r) => ({ did: r.did, handle: r.handle, blurb: r.blurb }));
}

/**
 * Patch one person's card. Omitted fields keep their value. Switching a card
 * on (or creating it) puts it at the end of the shown order.
 */
export async function setFeatured(
	db: D1Database,
	did: string,
	patch: { shown?: boolean; blurb?: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
	const confirmed = await db
		.prepare(`SELECT 1 AS ok FROM registrations r WHERE r.did = ?1 AND ${CONFIRMED}`)
		.bind(did)
		.first();
	if (!confirmed) return { ok: false, error: 'Only confirmed registrants can appear on the site' };

	let blurb: string | undefined;
	if (patch.blurb !== undefined) {
		const checked = validateBlurb(patch.blurb);
		if (!checked.ok) return checked;
		blurb = checked.value;
	}

	const existing = await db
		.prepare(`SELECT blurb, shown FROM site_featured WHERE did = ?1`)
		.bind(did)
		.first<{ blurb: string; shown: number }>();
	const now = new Date().toISOString();
	const shown = patch.shown ?? existing?.shown === 1;
	const nextBlurb = blurb ?? existing?.blurb ?? '';

	if (!existing || (shown && existing.shown !== 1)) {
		await db
			.prepare(
				`INSERT INTO site_featured (did, blurb, shown, position, updated_at)
				 VALUES (?1, ?2, ?3, (SELECT COALESCE(MAX(position), 0) + 1 FROM site_featured), ?4)
				 ON CONFLICT(did) DO UPDATE SET blurb = excluded.blurb, shown = excluded.shown,
				   position = excluded.position, updated_at = excluded.updated_at`
			)
			.bind(did, nextBlurb, shown ? 1 : 0, now)
			.run();
	} else {
		await db
			.prepare(`UPDATE site_featured SET blurb = ?1, shown = ?2, updated_at = ?3 WHERE did = ?4`)
			.bind(nextBlurb, shown ? 1 : 0, now, did)
			.run();
	}
	return { ok: true };
}

/** Swap with the neighbour in the shown list, then renumber that list 1..n. */
export async function moveFeatured(db: D1Database, did: string, direction: 'up' | 'down'): Promise<boolean> {
	const list = await shownAttendees(db);
	const i = list.findIndex((a) => a.did === did);
	const j = direction === 'up' ? i - 1 : i + 1;
	if (i < 0 || j < 0 || j >= list.length) return false;
	const order = [...list];
	[order[i], order[j]] = [order[j], order[i]];
	await db.batch(
		order.map((a, idx) => db.prepare(`UPDATE site_featured SET position = ?1 WHERE did = ?2`).bind(idx + 1, a.did))
	);
	return true;
}

const httpsUrl = (u: unknown): string | null => {
	if (typeof u !== 'string' || u.length > 1024) return null;
	try {
		const url = new URL(u);
		return url.protocol === 'https:' ? url.href : null;
	} catch {
		return null;
	}
};

const cleanName = (n: unknown): string | null => {
	if (typeof n !== 'string') return null;
	const v = n.replace(/\s+/g, ' ').trim().slice(0, 64);
	return v || null;
};

/**
 * Attach live Bluesky profile data from the public appview. Fails closed:
 * only an appview-verified handle is ever shown. `registrations.handle` was
 * captured at sign-in and may be a PDS-claimed, unverified handle, so it is
 * never a fallback — a person with no valid appview handle (profile missing,
 * loader failure or timeout, no loader) is left out of the public list.
 */
export async function hydrateAttendees(
	rows: FeaturedAttendee[],
	load: ProfileLoader | undefined,
	timeoutMs = 3000
): Promise<AttendeeView[]> {
	if (!rows.length || !load) return [];
	let profiles: Record<string, ProfileLite | undefined>;
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		profiles = await Promise.race([
			load(rows.map((r) => r.did)),
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error('profile load timed out')), timeoutMs);
			})
		]);
	} catch (e) {
		console.error('attendee profiles unavailable; omitting attendee cards', e);
		return [];
	} finally {
		clearTimeout(timer);
	}
	const out: AttendeeView[] = [];
	for (const row of rows) {
		const p = profiles[row.did];
		const handle = cleanHandle(p?.handle);
		if (!handle) continue;
		out.push({
			did: row.did,
			handle,
			displayName: cleanName(p?.displayName),
			avatar: httpsUrl(p?.avatar),
			blurb: row.blurb
		});
	}
	return out;
}

const AVATAR_CDN = 'https://cdn.bsky.app/';

/**
 * Avatars for the organizer's who's-coming ledger, from the same public
 * appview loader (and `appview:` cache) as the public cards. Only
 * cdn.bsky.app URLs are kept. Any failure or timeout degrades to no avatars
 * — the ledger shows the glyph — and never blocks the page.
 */
export async function consoleAvatars(
	dids: string[],
	load: ProfileLoader | undefined,
	timeoutMs = 3000
): Promise<Record<string, string>> {
	if (!dids.length || !load) return {};
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const profiles = await Promise.race([
			load(dids),
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error('profile load timed out')), timeoutMs);
			})
		]);
		const out: Record<string, string> = {};
		for (const did of dids) {
			const url = httpsUrl(profiles[did]?.avatar);
			if (url && url.startsWith(AVATAR_CDN)) out[did] = url;
		}
		return out;
	} catch (e) {
		console.error('console avatars unavailable', e);
		return {};
	} finally {
		clearTimeout(timer);
	}
}
