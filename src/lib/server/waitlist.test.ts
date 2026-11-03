import { describe, expect, it, vi } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import { sqliteD1 } from '$lib/server/test/sqlite-d1';
import { joinWaitlist, promoteFromWaitlist } from './waitlist';

const WAITER = 'did:plc:waiter';
const HANDLE = 'victim.bsky.social';

async function seed(stored: string | null): Promise<D1Database> {
	const db = sqliteD1();
	// A row saved before handles were verified may hold a PDS-claimed handle.
	await joinWaitlist(db, { did: WAITER, handle: stored, email: 'w@example.com' });
	return db;
}
const allowRow = (db: D1Database) =>
	db.prepare(`SELECT handle, did FROM allowlist WHERE handle = ?1`).bind(HANDLE).first<{ handle: string; did: string | null }>();
const promotedAt = async (db: D1Database) =>
	(await db.prepare(`SELECT promoted_at FROM waitlist WHERE did = ?1`).bind(WAITER).first<{ promoted_at: string | null }>())
		?.promoted_at ?? null;

describe('promoteFromWaitlist re-verifies the handle', () => {
	it('an unverifiable stored handle is refused and the allowlist is untouched', async () => {
		const db = await seed(HANDLE);
		await db.prepare(`INSERT INTO allowlist (handle, did) VALUES (?1, NULL)`).bind(HANDLE).run();
		const verify = vi.fn(async () => null);
		expect(await promoteFromWaitlist(db, WAITER, verify)).toEqual({ ok: false, reason: 'unverified', handle: HANDLE });
		expect(verify).toHaveBeenCalledWith(WAITER);
		expect(await allowRow(db)).toEqual({ handle: HANDLE, did: null });
		expect(await promotedAt(db)).toBeNull();
	});

	it('a verified handle that differs from the stored one is refused', async () => {
		const db = await seed(HANDLE);
		const result = await promoteFromWaitlist(db, WAITER, async () => 'someone.else.social');
		expect(result).toMatchObject({ ok: false, reason: 'unverified' });
		expect(await allowRow(db)).toBeNull();
	});

	it('a matching verified handle promotes and pins the waitlister’s DID (case/@ normalized)', async () => {
		const db = await seed('@Victim.Bsky.Social');
		await db.prepare(`INSERT INTO allowlist (handle, did) VALUES (?1, NULL)`).bind(HANDLE).run();
		expect(await promoteFromWaitlist(db, WAITER, async () => HANDLE)).toEqual({ ok: true, handle: HANDLE });
		expect(await allowRow(db)).toEqual({ handle: HANDLE, did: WAITER });
		expect(await promotedAt(db)).not.toBeNull();
	});

	it('a fresh handle is inserted pinned', async () => {
		const db = await seed(HANDLE);
		expect(await promoteFromWaitlist(db, WAITER, async () => HANDLE)).toEqual({ ok: true, handle: HANDLE });
		expect(await allowRow(db)).toEqual({ handle: HANDLE, did: WAITER });
	});

	it('an allowlist row pinned to a different DID is refused, not silently kept', async () => {
		const db = await seed(HANDLE);
		await db.prepare(`INSERT INTO allowlist (handle, did) VALUES (?1, 'did:plc:other')`).bind(HANDLE).run();
		expect(await promoteFromWaitlist(db, WAITER, async () => HANDLE)).toEqual({ ok: false, reason: 'pinned-elsewhere', handle: HANDLE });
		expect(await allowRow(db)).toEqual({ handle: HANDLE, did: 'did:plc:other' });
		expect(await promotedAt(db)).toBeNull();
	});

	it('a missing or handleless entry is refused without calling the resolver', async () => {
		const db = await seed(null);
		const verify = vi.fn(async () => HANDLE);
		expect(await promoteFromWaitlist(db, WAITER, verify)).toEqual({ ok: false, reason: 'no-handle', handle: null });
		expect(await promoteFromWaitlist(db, 'did:plc:nobody', verify)).toEqual({ ok: false, reason: 'no-handle', handle: null });
		expect(verify).not.toHaveBeenCalled();
	});
});
