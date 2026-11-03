import { describe, expect, it, vi } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import { sqliteD1 } from '$lib/server/test/sqlite-d1';
import { event, type EventInit } from '$lib/server/test/event';
import { listConsoleAttendees, shownAttendees } from '$lib/server/site/featured';
import { actions, load } from './+page.server';

// The load fetches avatars from the public appview; keep tests offline.
vi.mock('@svelte-atproto/oauth/bsky', () => ({
	loadBskyProfiles: vi.fn(async () => ({ 'did:plc:a': { avatar: 'https://cdn.bsky.app/img/avatar/plain/a@jpeg' } }))
}));

/** Action-level tests for the Who's coming console, over the real schema. */

type ActionName = keyof typeof actions;
type ActionResult = { status?: number; data?: Record<string, unknown> } & Record<string, unknown>;

const run = async (name: ActionName, init: EventInit): Promise<ActionResult> => {
	const action = actions[name]!;
	return (await action(event<Parameters<typeof action>[0]>(init))) as ActionResult;
};
const runLoad = async (init: EventInit) =>
	(await load(event<Parameters<typeof load>[0]>({ ...init, path: '/organizer/retreat/attendees' }))) as Record<string, unknown>;

async function register(db: D1Database, did: string, name: string, opts: { status?: string; agreed?: boolean } = {}) {
	const at = '2026-09-01T00:00:00Z';
	await db
		.prepare(
			`INSERT INTO registrations (did, handle, name, email, status, agreed_at, created_at, updated_at)
			 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)`
		)
		.bind(
			did,
			`${name.toLowerCase()}.test`,
			name,
			`${name.toLowerCase()}@example.com`,
			opts.status ?? 'confirmed',
			opts.agreed === false ? null : at,
			at
		)
		.run();
}

async function seeded() {
	const db = sqliteD1();
	await register(db, 'did:plc:a', 'Ada');
	await register(db, 'did:plc:b', 'Bea');
	await register(db, 'did:plc:declined', 'Dee', { status: 'declined', agreed: false });
	await register(db, 'did:plc:incomplete', 'Ian', { agreed: false });
	return db;
}

describe('auth', () => {
	it('load: signed out → 303 to /organizer; non-organizer → 404', async () => {
		const db = await seeded();
		await expect(runLoad({ db, did: null })).rejects.toMatchObject({ status: 303, location: '/organizer' });
		await expect(runLoad({ db, did: 'did:plc:someone' })).rejects.toMatchObject({ status: 404 });
	});

	it.each(['toggle', 'blurb', 'move'] as ActionName[])('%s: signed out → 303; non-organizer → 404', async (name) => {
		const db = await seeded();
		const form = { did: 'did:plc:a', shown: '1', blurb: 'x', direction: 'up' };
		await expect(run(name, { db, did: null, form })).rejects.toMatchObject({ status: 303, location: '/organizer' });
		await expect(run(name, { db, did: 'did:plc:someone', form })).rejects.toMatchObject({ status: 404 });
		expect(await shownAttendees(db)).toEqual([]);
	});
});

describe('Who’s coming console', () => {
	it('load lists confirmed registrants only', async () => {
		const db = await seeded();
		const data = await runLoad({ db });
		expect((data.attendees as Array<{ did: string }>).map((a) => a.did)).toEqual(['did:plc:a', 'did:plc:b']);
		expect(data.blurbMax).toBe(140);
		expect((data.attendees as Array<{ avatar: string | null }>).map((a) => a.avatar)).toEqual([
			'https://cdn.bsky.app/img/avatar/plain/a@jpeg',
			null
		]);
	});

	it('toggle shows and hides a confirmed registrant', async () => {
		const db = await seeded();
		expect(await run('toggle', { db, form: { did: 'did:plc:a', shown: '1' } })).toMatchObject({ message: 'Shown on the retreat home' });
		expect((await shownAttendees(db)).map((a) => a.did)).toEqual(['did:plc:a']);
		expect(await run('toggle', { db, form: { did: 'did:plc:a', shown: '0' } })).toMatchObject({
			message: 'Hidden from the retreat home'
		});
		expect(await shownAttendees(db)).toEqual([]);
	});

	it('toggle refuses a non-confirmed registrant, a stranger, and a malformed did', async () => {
		const db = await seeded();
		for (const did of ['did:plc:declined', 'did:plc:incomplete', 'did:plc:nobody']) {
			expect(await run('toggle', { db, form: { did, shown: '1' } })).toMatchObject({
				status: 400,
				data: { message: 'Only confirmed registrants can appear on the site' }
			});
		}
		expect(await run('toggle', { db, form: { did: 'alice', shown: '1' } })).toMatchObject({ status: 400 });
		expect(await shownAttendees(db)).toEqual([]);
	});

	it('blurb: saved trimmed to one line; over 140 characters rejected', async () => {
		const db = await seeded();
		expect(await run('blurb', { db, form: { did: 'did:plc:a', blurb: '  building\n a   feed  ' } })).toMatchObject({
			message: 'Blurb saved'
		});
		const ada = () => listConsoleAttendees(db).then((l) => l.find((a) => a.did === 'did:plc:a')!);
		expect((await ada()).blurb).toBe('building a feed');
		expect(await run('blurb', { db, form: { did: 'did:plc:a', blurb: 'x'.repeat(141) } })).toMatchObject({
			status: 400,
			data: { message: 'Blurbs max out at 140 characters' }
		});
		expect((await ada()).blurb).toBe('building a feed');
	});

	it('move reorders the shown list', async () => {
		const db = await seeded();
		await run('toggle', { db, form: { did: 'did:plc:a', shown: '1' } });
		await run('toggle', { db, form: { did: 'did:plc:b', shown: '1' } });
		expect((await shownAttendees(db)).map((a) => a.did)).toEqual(['did:plc:a', 'did:plc:b']);
		await run('move', { db, form: { did: 'did:plc:b', direction: 'up' } });
		expect((await shownAttendees(db)).map((a) => a.did)).toEqual(['did:plc:b', 'did:plc:a']);
		expect(await run('move', { db, form: { did: 'did:plc:b', direction: 'left' } })).toMatchObject({ status: 400 });
	});
});
