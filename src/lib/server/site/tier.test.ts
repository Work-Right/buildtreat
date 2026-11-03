import { describe, expect, it } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import { sqliteD1 } from '$lib/server/test/sqlite-d1';
import { canSee, isVisibility, pageTier, viewerTier } from './tier';

const ORGANIZERS = 'did:plc:org1,did:plc:org2';

async function seeded(): Promise<D1Database> {
	const db = sqliteD1();
	await db.prepare(`INSERT INTO allowlist (handle, did) VALUES (?1, ?2)`).bind('invited.test', 'did:plc:inv').run();
	await db.prepare(`INSERT INTO allowlist (handle, did) VALUES (?1, NULL)`).bind('byhandle.test').run();
	await db
		.prepare(`INSERT INTO late_passes (handle, did, granted_at) VALUES (?1, NULL, ?2)`)
		.bind('latepass.test', '2026-10-01T00:00:00Z')
		.run();
	return db;
}

describe('canSee', () => {
	it('public sees only public', () => {
		expect(canSee('public', 'public')).toBe(true);
		expect(canSee('public', 'invited')).toBe(false);
		expect(canSee('public', 'hidden')).toBe(false);
	});
	it('invited sees public and invited, never hidden', () => {
		expect(canSee('invited', 'public')).toBe(true);
		expect(canSee('invited', 'invited')).toBe(true);
		expect(canSee('invited', 'hidden')).toBe(false);
	});
	it('organizer sees everything', () => {
		expect(canSee('organizer', 'hidden')).toBe(true);
	});
});

describe('isVisibility', () => {
	it('accepts only the three values', () => {
		expect(isVisibility('invited')).toBe(true);
		expect(isVisibility('everyone')).toBe(false);
	});
});

describe('viewerTier', () => {
	it('signed out is public', async () => {
		expect(await viewerTier(await seeded(), ORGANIZERS, null)).toBe('public');
	});
	it('organizer DIDs are organizers even without D1', async () => {
		expect(await viewerTier(undefined, ORGANIZERS, { did: 'did:plc:org2', handle: null })).toBe('organizer');
	});
	it('allowlisted by DID or handle is invited', async () => {
		const db = await seeded();
		expect(await viewerTier(db, ORGANIZERS, { did: 'did:plc:inv', handle: null })).toBe('invited');
		expect(await viewerTier(db, ORGANIZERS, { did: 'did:plc:new', handle: 'ByHandle.test' })).toBe('invited');
	});
	it('a late pass alone is invited', async () => {
		expect(await viewerTier(await seeded(), ORGANIZERS, { did: 'did:plc:lp', handle: 'latepass.test' })).toBe('invited');
	});
	it('signed in but not invited is public', async () => {
		expect(await viewerTier(await seeded(), ORGANIZERS, { did: 'did:plc:x', handle: 'stranger.test' })).toBe('public');
	});
	it('empty allowlist means nobody is invited', async () => {
		const db = sqliteD1();
		expect(await viewerTier(db, ORGANIZERS, { did: 'did:plc:x', handle: 'stranger.test' })).toBe('public');
	});
	it('a row pinned to another DID does not match by handle', async () => {
		const db = await seeded();
		expect(await viewerTier(db, ORGANIZERS, { did: 'did:plc:other', handle: 'invited.test' })).toBe('public');
		expect(await viewerTier(db, ORGANIZERS, { did: 'did:plc:inv', handle: 'invited.test' })).toBe('invited');
	});
	it('a late pass pinned to another DID does not match by handle', async () => {
		const db = await seeded();
		await db
			.prepare(`INSERT INTO late_passes (handle, did, granted_at) VALUES ('lp2.test', 'did:plc:other', '2026-10-01T00:00:00Z')`)
			.run();
		expect(await viewerTier(db, ORGANIZERS, { did: 'did:plc:me', handle: 'lp2.test' })).toBe('public');
	});
	it('is read-only: an unpinned late pass is not pinned by a page view', async () => {
		const db = await seeded();
		expect(await viewerTier(db, ORGANIZERS, { did: 'did:plc:lp', handle: 'latepass.test' })).toBe('invited');
		const row = await db.prepare(`SELECT did FROM late_passes WHERE handle = 'latepass.test'`).first<{ did: string | null }>();
		expect(row?.did).toBeNull();
	});
	it('a throw only in the late-pass lookup is public', async () => {
		const stub = {
			prepare: (sql: string) => {
				const stmt = {
					bind: () => stmt,
					first: async () => {
						if (sql.includes('late_passes')) throw new Error('late_passes down');
						return null;
					}
				};
				return stmt;
			}
		} as unknown as D1Database;
		expect(await viewerTier(stub, ORGANIZERS, { did: 'did:plc:x', handle: 'x.test' })).toBe('public');
	});
	it('fails closed when D1 is missing or throws', async () => {
		expect(await viewerTier(undefined, ORGANIZERS, { did: 'did:plc:inv', handle: 'invited.test' })).toBe('public');
		const broken = { prepare: () => { throw new Error('d1 down'); } } as unknown as D1Database;
		expect(await viewerTier(broken, ORGANIZERS, { did: 'did:plc:inv', handle: 'invited.test' })).toBe('public');
	});
});

describe('pageTier', () => {
	it('non-organizers render as themselves and ignore ?as', () => {
		expect(pageTier('public', 'invited')).toBe('public');
		expect(pageTier('invited', 'public')).toBe('invited');
	});
	it('organizers render as invited unless ?as=public', () => {
		expect(pageTier('organizer', null)).toBe('invited');
		expect(pageTier('organizer', 'public')).toBe('public');
		expect(pageTier('organizer', 'invited')).toBe('invited');
		expect(pageTier('organizer', 'hidden')).toBe('invited');
	});
});
