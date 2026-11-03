import type { D1Database } from '@cloudflare/workers-types';
import { EMAIL_RE } from './db';

/**
 * D1 access for the waitlist — uninvited-but-interested visitors who signed
 * in but aren't on the allowlist. All queries are parameterized.
 * Schema: migrations/0003_waitlist.sql. Design spec:
 * docs/superpowers/specs/2026-08-11-waitlist-design.md.
 */

export interface WaitlistEntry {
	did: string;
	handle: string | null;
	email: string;
	createdAt: string;
	promotedAt: string | null;
}

/** 'none' = not on the list; 'member' = waiting (or already promoted). */
export type WaitlistState = 'none' | 'member';

export { EMAIL_RE };

/**
 * Add (or update) a waitlist entry. Idempotent on DID: re-signing-in and
 * re-submitting updates the email/handle rather than duplicating. The handle
 * is authoritative (resolved from the caller's DID), never client-supplied,
 * so promotion can safely allowlist it.
 */
export async function joinWaitlist(
	db: D1Database,
	who: { did: string; handle: string | null; email: string }
): Promise<void> {
	const now = new Date().toISOString();
	await db
		.prepare(
			`INSERT INTO waitlist (did, handle, email, created_at)
			 VALUES (?1, ?2, ?3, ?4)
			 ON CONFLICT(did) DO UPDATE SET handle = excluded.handle, email = excluded.email`
		)
		.bind(who.did, who.handle, who.email, now)
		.run();
}

/**
 * Self-heal a stored handle from the caller's freshly-resolved one. A
 * transient profile-lookup failure at join time stores handle = null; a
 * later handle change makes it stale. Backfilling on every authenticated
 * load keeps the row promotable without any user action — no refresh
 * button, no dead-end. Only writes when the value actually changed.
 */
export async function backfillWaitlistHandle(db: D1Database, did: string, handle: string): Promise<void> {
	await db
		.prepare(`UPDATE waitlist SET handle = ?1 WHERE did = ?2 AND (handle IS NULL OR handle != ?1)`)
		.bind(handle, did)
		.run();
}

/** The visitor's own waitlist row, for the confirmation state. */
export async function getWaitlistEntry(db: D1Database, did: string): Promise<WaitlistEntry | null> {
	const row = await db
		.prepare(`SELECT did, handle, email, created_at, promoted_at FROM waitlist WHERE did = ?1`)
		.bind(did)
		.first<{ did: string; handle: string | null; email: string; created_at: string; promoted_at: string | null }>();
	if (!row) return null;
	return { did: row.did, handle: row.handle, email: row.email, createdAt: row.created_at, promotedAt: row.promoted_at };
}

/** Full list for the organizer, oldest first. */
export async function listWaitlist(db: D1Database): Promise<WaitlistEntry[]> {
	const rows = await db
		.prepare(`SELECT did, handle, email, created_at, promoted_at FROM waitlist ORDER BY created_at`)
		.all<{ did: string; handle: string | null; email: string; created_at: string; promoted_at: string | null }>();
	return rows.results.map((r) => ({
		did: r.did,
		handle: r.handle,
		email: r.email,
		createdAt: r.created_at,
		promotedAt: r.promoted_at
	}));
}

export type PromoteResult =
	| { ok: true; handle: string }
	| { ok: false; reason: 'no-handle' | 'unverified' | 'pinned-elsewhere'; handle: string | null };

/**
 * Promote a waitlist entry into the allowlist, pinned to the waitlister's
 * DID, and stamp promoted_at. The stored handle is only a hint: rows saved
 * before join-time verification may hold a PDS-claimed handle, so `verify`
 * (production: `verifiedHandle`, appview-only) must confirm the same handle
 * now, or nothing is written. An allowlist row for that handle already
 * pinned to a different DID is refused rather than silently kept.
 */
export async function promoteFromWaitlist(
	db: D1Database,
	did: string,
	verify: (did: string) => Promise<string | null>
): Promise<PromoteResult> {
	const entry = await getWaitlistEntry(db, did);
	if (!entry || !entry.handle) return { ok: false, reason: 'no-handle', handle: null };
	const stored = entry.handle.replace(/^@/, '').toLowerCase();
	const verified = (await verify(entry.did))?.replace(/^@/, '').toLowerCase() ?? null;
	if (!verified || verified !== stored) return { ok: false, reason: 'unverified', handle: stored };
	const existing = await db
		.prepare(`SELECT did FROM allowlist WHERE lower(handle) = ?1 LIMIT 1`)
		.bind(verified)
		.first<{ did: string | null }>();
	if (existing?.did && existing.did !== entry.did) {
		console.error('waitlist promote refused: allowlist handle pinned to another DID', `${entry.did.slice(0, 14)}…`);
		return { ok: false, reason: 'pinned-elsewhere', handle: verified };
	}
	const now = new Date().toISOString();
	await db.batch([
		// Pin the DID (the row is new, unpinned, or already this DID's).
		db
			.prepare(
				`INSERT INTO allowlist (handle, did) VALUES (?1, ?2)
				 ON CONFLICT(handle) DO UPDATE SET did = COALESCE(allowlist.did, excluded.did)`
			)
			.bind(verified, entry.did),
		// COALESCE: a re-promote (retry / double-click) keeps the first
		// timestamp, so promoted_at stays an accurate audit of when they
		// were first admitted.
		db.prepare(`UPDATE waitlist SET promoted_at = COALESCE(promoted_at, ?1) WHERE did = ?2`).bind(now, did)
	]);
	return { ok: true, handle: verified };
}

/** Validate a submitted waitlist email. Mirrors the survey's rule. */
export function isValidWaitlistEmail(email: string): boolean {
	return EMAIL_RE.test(email);
}
