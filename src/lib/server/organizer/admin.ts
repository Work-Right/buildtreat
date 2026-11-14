import type { D1Database } from '@cloudflare/workers-types';
import type { AvailabilityRange, InterestValue, TravelValue } from '$lib/content';
import { deadlineStatus } from '$lib/server/deadline';

/**
 * Organizer-only data access: full-response reads, allowlist management,
 * and the deadline overrides (global reopen + per-respondent late passes).
 * All queries are parameterized. Schema: migrations/0002_organizer.sql.
 */

function inDidList(list: string | undefined, did: string | null): boolean {
	if (!did || !list) return false;
	return list
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean)
		.includes(did);
}

/** Comma-separated DID list from the ORGANIZER_DIDS binding. */
export function isOrganizer(organizerDids: string | undefined, did: string | null): boolean {
	return inDidList(organizerDids, did);
}

/**
 * Comma-separated DID list from the DEVELOPER_DIDS binding. Developers edit
 * retreat content (/organizer/retreat) and see every visibility tier on `/`,
 * but never reach registrant data: the console, who's-coming curation,
 * per-attendee edits, CSVs and broadcasts all stay `isOrganizer`-only.
 */
export function isDeveloper(developerDids: string | undefined, did: string | null): boolean {
	return inDidList(developerDids, did);
}

export interface OrganizerResponse {
	did: string;
	handle: string | null;
	name: string;
	email: string;
	homeLocation: string;
	interest: InterestValue;
	travel: TravelValue | null;
	ranking: string[];
	ranges: AvailabilityRange[];
	submittedAt: string;
	updatedAt: string;
}

export async function getAllResponses(db: D1Database): Promise<OrganizerResponse[]> {
	const [rows, rangeRows] = await db.batch([
		db.prepare(
			`SELECT did, handle, name, email, home_location, interest, travel, location_ranking, submitted_at, updated_at
			 FROM responses ORDER BY updated_at DESC`
		),
		db.prepare(
			`SELECT did, start_date, end_date, start_portion, end_portion
			 FROM availability_ranges ORDER BY start_date`
		)
	]);

	const rangesByDid = new Map<string, AvailabilityRange[]>();
	for (const r of rangeRows.results as {
		did: string;
		start_date: string;
		end_date: string;
		start_portion: AvailabilityRange['startPortion'];
		end_portion: AvailabilityRange['endPortion'];
	}[]) {
		const list = rangesByDid.get(r.did) ?? [];
		list.push({ start: r.start_date, end: r.end_date, startPortion: r.start_portion, endPortion: r.end_portion });
		rangesByDid.set(r.did, list);
	}

	return (
		rows.results as {
			did: string;
			handle: string | null;
			name: string;
			email: string;
			home_location: string;
			interest: InterestValue;
			travel: TravelValue | null;
			location_ranking: string;
			submitted_at: string;
			updated_at: string;
		}[]
	).map((row) => {
		let ranking: string[] = [];
		try {
			const parsed = JSON.parse(row.location_ranking);
			if (Array.isArray(parsed)) ranking = parsed.filter((x): x is string => typeof x === 'string');
		} catch {
			// Corrupt ranking JSON — surface the respondent as unranked.
		}
		return {
			did: row.did,
			handle: row.handle,
			name: row.name,
			email: row.email,
			homeLocation: row.home_location,
			interest: row.interest,
			travel: row.travel,
			ranking,
			ranges: rangesByDid.get(row.did) ?? [],
			submittedAt: row.submitted_at,
			updatedAt: row.updated_at
		};
	});
}

/* ── allowlist management ── */

export interface AllowlistEntry {
	handle: string;
	did: string | null;
	responded: boolean;
}

export async function listAllowlist(db: D1Database): Promise<AllowlistEntry[]> {
	const rows = await db
		.prepare(
			`SELECT a.handle, a.did,
			        EXISTS(SELECT 1 FROM responses r WHERE r.did = a.did OR lower(r.handle) = lower(a.handle)) AS responded
			 FROM allowlist a ORDER BY lower(a.handle)`
		)
		.all<{ handle: string; did: string | null; responded: number }>();
	return rows.results.map((r) => ({ handle: r.handle, did: r.did, responded: r.responded === 1 }));
}

/** Same shape check the sign-in cookie uses: handles and DIDs only. */
const HANDLE_RE = /^[a-z0-9.:-]{1,253}$/i;

/**
 * Insert handles, ignoring duplicates. Returns how many were new.
 * Input is free text — one handle per line/comma/space, @ prefixes stripped.
 */
export async function addAllowlistHandles(db: D1Database, raw: string): Promise<{ added: number; skipped: string[] }> {
	const skipped: string[] = [];
	const handles = [
		...new Set(
			raw
				.split(/[\s,]+/)
				.map((h) => h.trim().replace(/^@/, '').toLowerCase())
				.filter(Boolean)
		)
	].filter((h) => {
		if (HANDLE_RE.test(h)) return true;
		skipped.push(h);
		return false;
	});
	if (handles.length === 0) return { added: 0, skipped };

	const results = await db.batch(
		handles.map((h) => db.prepare(`INSERT OR IGNORE INTO allowlist (handle) VALUES (?1)`).bind(h))
	);
	const added = results.reduce((n, r) => n + (r.meta.changes ?? 0), 0);
	return { added, skipped };
}

export async function removeAllowlistHandle(db: D1Database, handle: string): Promise<void> {
	await db.prepare(`DELETE FROM allowlist WHERE lower(handle) = lower(?1)`).bind(handle).run();
}

/* ── settings: the global reopen switch ── */

export async function isReopened(db: D1Database): Promise<boolean> {
	const row = await db.prepare(`SELECT value FROM settings WHERE key = 'reopen'`).first<{ value: string }>();
	return row?.value === '1';
}

export async function setReopened(db: D1Database, on: boolean): Promise<void> {
	await db
		.prepare(
			`INSERT INTO settings (key, value, updated_at) VALUES ('reopen', ?1, ?2)
			 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
		)
		.bind(on ? '1' : '0', new Date().toISOString())
		.run();
}

/* ── late passes ── */

export interface LatePass {
	handle: string;
	did: string | null;
	grantedAt: string;
}

export async function listLatePasses(db: D1Database): Promise<LatePass[]> {
	const rows = await db
		.prepare(`SELECT handle, did, granted_at FROM late_passes ORDER BY granted_at DESC`)
		.all<{ handle: string; did: string | null; granted_at: string }>();
	return rows.results.map((r) => ({ handle: r.handle, did: r.did, grantedAt: r.granted_at }));
}

export async function grantLatePass(db: D1Database, handle: string): Promise<boolean> {
	const clean = handle.trim().replace(/^@/, '').toLowerCase();
	if (!HANDLE_RE.test(clean)) return false;
	await db
		.prepare(`INSERT OR IGNORE INTO late_passes (handle, granted_at) VALUES (?1, ?2)`)
		.bind(clean, new Date().toISOString())
		.run();
	return true;
}

export async function revokeLatePass(db: D1Database, handle: string): Promise<void> {
	await db.prepare(`DELETE FROM late_passes WHERE lower(handle) = lower(?1)`).bind(handle).run();
}

/** Handle-or-DID match with DID pinning, mirroring checkAllowlist's policy. */
export async function hasLatePass(db: D1Database, who: { did: string; handle: string | null }): Promise<boolean> {
	const row = await db
		.prepare(`SELECT handle FROM late_passes WHERE did = ?1 OR lower(handle) = lower(?2) LIMIT 1`)
		.bind(who.did, who.handle)
		.first<{ handle: string }>();
	if (!row) return false;
	await db
		.prepare(`UPDATE late_passes SET did = ?1 WHERE lower(handle) = lower(?2) AND did IS NULL`)
		.bind(who.did, row.handle)
		.run();
	return true;
}

/* ── scenario anchors ── */

/** Anchored respondent DIDs, oldest first. Global across organizers. */
export async function listAnchors(db: D1Database): Promise<string[]> {
	const rows = await db.prepare(`SELECT did FROM anchors ORDER BY created_at`).all<{ did: string }>();
	return rows.results.map((r) => r.did);
}

/** Idempotent both directions: re-anchoring or re-clearing a DID is a no-op. */
export async function setAnchor(db: D1Database, did: string, on: boolean): Promise<void> {
	if (on) {
		await db
			.prepare(`INSERT OR IGNORE INTO anchors (did, created_at) VALUES (?1, ?2)`)
			.bind(did, new Date().toISOString())
			.run();
	} else {
		await db.prepare(`DELETE FROM anchors WHERE did = ?1`).bind(did).run();
	}
}

export async function clearAllAnchors(db: D1Database): Promise<void> {
	await db.prepare(`DELETE FROM anchors`).run();
}

/* ── the effective deadline, overrides applied ── */

export interface SurveyGate {
	/** Closed for THIS caller, overrides applied. */
	closed: boolean;
	deadline: string | null;
	display: string | null;
	reopened: boolean;
	latePass: boolean;
}

/**
 * One place decides whether the survey accepts a write. The DEADLINE env is
 * the base; the organizer's reopen switch overrides it for everyone; a late
 * pass overrides it for one respondent. Storage being unavailable fails open
 * on overrides only when the base deadline hasn't passed (a passed deadline
 * with an unreachable DB stays closed — overrides can't be confirmed).
 */
export async function surveyGate(
	db: D1Database | undefined,
	deadlineRaw: string | undefined,
	who: { did: string; handle: string | null } | null
): Promise<SurveyGate> {
	const base = deadlineStatus(deadlineRaw);
	if (!base.closed || !db) {
		return { closed: base.closed, deadline: base.deadline, display: base.display, reopened: false, latePass: false };
	}
	const reopened = await isReopened(db).catch(() => false);
	if (reopened) {
		return { closed: false, deadline: base.deadline, display: base.display, reopened: true, latePass: false };
	}
	const latePass = who ? await hasLatePass(db, who).catch(() => false) : false;
	return { closed: !latePass, deadline: base.deadline, display: base.display, reopened: false, latePass };
}

/**
 * Registration's gate: REG_DEADLINE is the base and a late pass lifts it for
 * one person. The survey's reopen switch is deliberately not consulted — it
 * reopens the questionnaire, not sign-ups. Same fail-open shape as surveyGate.
 */
export async function registrationGate(
	db: D1Database | undefined,
	deadlineRaw: string | undefined,
	who: { did: string; handle: string | null } | null
): Promise<{ closed: boolean; deadline: string | null; display: string | null; latePass: boolean }> {
	const base = deadlineStatus(deadlineRaw);
	if (!base.closed || !db || !who) {
		return { closed: base.closed, deadline: base.deadline, display: base.display, latePass: false };
	}
	const latePass = await hasLatePass(db, who).catch(() => false);
	return { closed: !latePass, deadline: base.deadline, display: base.display, latePass };
}
