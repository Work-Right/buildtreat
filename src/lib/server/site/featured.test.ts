import { describe, expect, it } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import { sqliteD1 } from '$lib/server/test/sqlite-d1';
import {
	consoleAvatars,
	hydrateAttendees,
	listConsoleAttendees,
	moveFeatured,
	setFeatured,
	shownAttendees,
	validateBlurb,
	type ProfileLoader
} from './featured';

async function register(
	db: D1Database,
	did: string,
	handle: string | null,
	opts: { status?: 'confirmed' | 'declined'; agreed?: boolean; name?: string } = {}
) {
	const at = '2026-09-01T00:00:00Z';
	await db
		.prepare(
			`INSERT INTO registrations (did, handle, name, email, status, agreed_at, created_at, updated_at)
			 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)`
		)
		.bind(did, handle, opts.name ?? `Name ${did}`, `${did.slice(8)}@example.com`, opts.status ?? 'confirmed', opts.agreed === false ? null : at, at)
		.run();
}

async function seeded() {
	const db = sqliteD1();
	await register(db, 'did:plc:a', 'a.test', { name: 'Ada' });
	await register(db, 'did:plc:b', 'b.test', { name: 'Bea' });
	await register(db, 'did:plc:c', 'c.test', { name: 'Cy' });
	await register(db, 'did:plc:declined', 'd.test', { status: 'declined', agreed: false });
	await register(db, 'did:plc:incomplete', 'i.test', { agreed: false });
	return db;
}

describe('validateBlurb', () => {
	it('trims, collapses whitespace to one line, and caps at 140 characters', () => {
		expect(validateBlurb('  building\n a   feed  ')).toEqual({ ok: true, value: 'building a feed' });
		expect(validateBlurb('x'.repeat(140)).ok).toBe(true);
		expect(validateBlurb('x'.repeat(141)).ok).toBe(false);
		expect(validateBlurb(42).ok).toBe(false);
	});
});

describe('featured attendees', () => {
	it('lists only complete confirmed registrations, none shown by default', async () => {
		const db = await seeded();
		const list = await listConsoleAttendees(db);
		expect(list.map((a) => a.did)).toEqual(['did:plc:a', 'did:plc:b', 'did:plc:c']);
		expect(list.every((a) => !a.shown && a.blurb === '')).toBe(true);
		expect(await shownAttendees(db)).toEqual([]);
	});

	it('refuses anyone who is not a confirmed registrant', async () => {
		const db = await seeded();
		expect((await setFeatured(db, 'did:plc:declined', { shown: true })).ok).toBe(false);
		expect((await setFeatured(db, 'did:plc:incomplete', { shown: true })).ok).toBe(false);
		expect((await setFeatured(db, 'did:plc:nobody', { shown: true })).ok).toBe(false);
	});

	it('toggles and blurbs independently; switching on appends to the end', async () => {
		const db = await seeded();
		expect(await setFeatured(db, 'did:plc:b', { blurb: ' feeds ' })).toEqual({ ok: true });
		expect(await setFeatured(db, 'did:plc:c', { shown: true })).toEqual({ ok: true });
		expect(await setFeatured(db, 'did:plc:b', { shown: true })).toEqual({ ok: true });
		expect(await shownAttendees(db)).toEqual([
			{ did: 'did:plc:c', handle: 'c.test', blurb: '' },
			{ did: 'did:plc:b', handle: 'b.test', blurb: 'feeds' }
		]);
		expect((await setFeatured(db, 'did:plc:b', { blurb: 'x'.repeat(141) })).ok).toBe(false);
		const rows = await listConsoleAttendees(db);
		expect(rows.map((a) => [a.did, a.shown])).toEqual([
			['did:plc:c', true],
			['did:plc:b', true],
			['did:plc:a', false]
		]);
	});

	it('hides a featured person whose registration is no longer confirmed', async () => {
		const db = await seeded();
		await setFeatured(db, 'did:plc:a', { shown: true, blurb: 'labelers' });
		await db.prepare(`UPDATE registrations SET status = 'declined' WHERE did = 'did:plc:a'`).run();
		expect(await shownAttendees(db)).toEqual([]);
		expect((await listConsoleAttendees(db)).some((a) => a.did === 'did:plc:a')).toBe(false);
	});

	it('moves within the shown list and renumbers 1..n', async () => {
		const db = await seeded();
		for (const did of ['did:plc:a', 'did:plc:b', 'did:plc:c']) await setFeatured(db, did, { shown: true });
		expect(await moveFeatured(db, 'did:plc:c', 'up')).toBe(true);
		expect((await shownAttendees(db)).map((a) => a.did)).toEqual(['did:plc:a', 'did:plc:c', 'did:plc:b']);
		expect(await moveFeatured(db, 'did:plc:a', 'up')).toBe(false);
		const { results } = await db.prepare(`SELECT position FROM site_featured ORDER BY position`).all<{ position: number }>();
		expect(results.map((r) => r.position)).toEqual([1, 2, 3]);
	});
});

describe('hydrateAttendees', () => {
	const rows = [
		{ did: 'did:plc:a', handle: 'a.test', blurb: 'feeds' },
		{ did: 'did:plc:b', handle: 'b.test', blurb: '' },
		{ did: 'did:plc:nohandle', handle: null, blurb: '' }
	];

	it('uses the appview profile for name, handle and an https avatar; omits anyone without an appview-verified handle', async () => {
		const load: ProfileLoader = async () => ({
			'did:plc:a': { handle: 'ada.example', displayName: ' Ada ', avatar: 'https://cdn.bsky.app/img/avatar/plain/a@jpeg' },
			'did:plc:b': { handle: 'handle.invalid', avatar: 'javascript:alert(1)' }
		});
		expect(await hydrateAttendees(rows, load)).toEqual([
			{ did: 'did:plc:a', handle: 'ada.example', displayName: 'Ada', avatar: 'https://cdn.bsky.app/img/avatar/plain/a@jpeg', blurb: 'feeds' }
		]);
	});

	it('fails closed: never shows a registration (unverified) handle when profiles fail, hang or are absent', async () => {
		expect(await hydrateAttendees(rows, async () => { throw new Error('appview down'); })).toEqual([]);
		expect(await hydrateAttendees(rows, () => new Promise(() => {}), 10)).toEqual([]);
		expect(await hydrateAttendees(rows, undefined)).toEqual([]);
		expect(await hydrateAttendees(rows, async () => ({}))).toEqual([]);
	});
});

describe('consoleAvatars', () => {
	const dids = ['did:plc:a', 'did:plc:b', 'did:plc:c'];
	it('maps DIDs to cdn.bsky.app avatars only', async () => {
		const out = await consoleAvatars(dids, async () => ({
			'did:plc:a': { avatar: 'https://cdn.bsky.app/img/avatar/plain/a@jpeg' },
			'did:plc:b': { avatar: 'https://evil.example/track.png' },
			'did:plc:c': {}
		}));
		expect(out).toEqual({ 'did:plc:a': 'https://cdn.bsky.app/img/avatar/plain/a@jpeg' });
	});
	it('degrades to no avatars on failure, timeout, or no loader', async () => {
		expect(await consoleAvatars(dids, async () => Promise.reject(new Error('down')))).toEqual({});
		expect(await consoleAvatars(dids, () => new Promise(() => {}), 10)).toEqual({});
		expect(await consoleAvatars(dids, undefined)).toEqual({});
		expect(await consoleAvatars([], async () => ({}))).toEqual({});
	});
});
