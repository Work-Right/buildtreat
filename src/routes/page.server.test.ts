import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import { sqliteD1 } from '$lib/server/test/sqlite-d1';
import { event, type EventInit } from '$lib/server/test/event';
import { getRegistration } from '$lib/server/registration';

/**
 * Route-level identity tests for `/`: invite checks must only ever see an
 * appview-verified handle. `loadBskyProfile` (display) is stubbed to return
 * a PDS-fallback-shaped profile, i.e. whatever handle the account's own PDS
 * claims; `loadBskyProfiles` (appview) decides what is verified.
 */

const bsky = vi.hoisted(() => ({
	/** Display profile: may be a PDS describeRepo claim. */
	display: undefined as { did: string; handle: string; displayName?: string } | undefined,
	/** What the public appview says for the DID. */
	appview: undefined as { did: string; handle: string } | undefined
}));

vi.mock('$app/environment', () => ({ dev: false, browser: false, building: false, version: 'test' }));
vi.mock('@svelte-atproto/oauth/bsky', () => ({
	loadBskyProfile: vi.fn(async () => bsky.display),
	loadBskyProfiles: vi.fn(async (dids: string[]) =>
		Object.fromEntries(dids.map((d) => [d, bsky.appview && bsky.appview.did === d ? bsky.appview : undefined]))
	)
}));
vi.mock('@svelte-atproto/oauth/helper', async (orig) => ({
	...(await orig<typeof import('@svelte-atproto/oauth/helper')>()),
	actorToDid: vi.fn(async () => null)
}));

const { actions, load } = await import('./+page.server');

const VICTIM_HANDLE = 'victim.bsky.social';
const VICTIM = 'did:plc:victim';
const ATTACKER = 'did:plc:attacker';
const PAST = '2020-01-01T00:00:00Z';

type Env = Record<string, unknown>;
const withEnv = <T>(ev: T, env: Env): T => {
	Object.assign((ev as unknown as { platform: { env: Env } }).platform.env, env);
	return ev;
};

const runLoad = async (init: EventInit, env: Env = {}) =>
	(await load(withEnv(event<Parameters<typeof load>[0]>({ method: 'GET', ...init }), env))) as Record<string, unknown> & {
		site: { tier: string };
		allowed: boolean;
		regClosed: boolean;
	};
type ActionName = keyof typeof actions;
const run = async (name: ActionName, init: EventInit, env: Env = {}) => {
	const action = actions[name]!;
	return (await action(withEnv(event<Parameters<typeof action>[0]>(init), env))) as {
		status?: number;
		data?: Record<string, unknown>;
	} & Record<string, unknown>;
};

const validForm = {
	name: 'Victim Person',
	email: 'v@example.com',
	emergencyName: 'Friend',
	emergencyPhone: '555-0100',
	agreeWaiver: 'on',
	agreeCoc: 'on',
	supportNeed: 'none'
};

async function seed(): Promise<D1Database> {
	const db = sqliteD1();
	// An invitee who has never signed in: the row is not pinned to a DID yet.
	await db.prepare(`INSERT INTO allowlist (handle, did) VALUES (?1, NULL)`).bind(VICTIM_HANDLE).run();
	await db.prepare(`INSERT INTO allowlist (handle, did) VALUES ('someone.else', 'did:plc:else')`).run();
	return db;
}
const pinnedTo = async (db: D1Database, table: 'allowlist' | 'late_passes') =>
	(await db.prepare(`SELECT did FROM ${table} WHERE handle = ?1`).bind(VICTIM_HANDLE).first<{ did: string | null }>())?.did ??
	null;

describe('`/` with a PDS-claimed (unverified) handle', () => {
	let db: D1Database;
	beforeEach(async () => {
		db = await seed();
		// The attacker's PDS claims the victim's handle; the appview says invalid.
		bsky.display = { did: ATTACKER, handle: VICTIM_HANDLE };
		bsky.appview = { did: ATTACKER, handle: 'handle.invalid' };
	});

	it('load: tier stays public, not allowed, and the allowlist row is NOT pinned', async () => {
		const data = await runLoad({ did: ATTACKER, db });
		expect(data.site.tier).toBe('public');
		expect(data.allowed).toBe(false);
		expect(await pinnedTo(db, 'allowlist')).toBeNull();
	});

	it('load: an appview that does not know the DID is treated the same', async () => {
		bsky.appview = undefined;
		const data = await runLoad({ did: ATTACKER, db });
		expect(data.site.tier).toBe('public');
		expect(data.allowed).toBe(false);
		expect(await pinnedTo(db, 'allowlist')).toBeNull();
	});

	it('load: a late pass for the claimed handle neither lifts the gate nor pins', async () => {
		await db.prepare(`INSERT INTO late_passes (handle, did, granted_at) VALUES (?1, NULL, ?2)`).bind(VICTIM_HANDLE, PAST).run();
		const data = await runLoad({ did: ATTACKER, db }, { REG_DEADLINE: PAST, DEADLINE: PAST });
		expect(data.regClosed).toBe(true);
		expect(data.closed).toBe(true);
		expect(await pinnedTo(db, 'late_passes')).toBeNull();
	});

	it('register is refused and writes nothing', async () => {
		const res = await run('register', { did: ATTACKER, db, form: validForm });
		expect(res.status).toBe(403);
		expect(await getRegistration(db, ATTACKER)).toBeNull();
		expect(await pinnedTo(db, 'allowlist')).toBeNull();
	});

	it('decline is refused', async () => {
		const res = await run('decline', { did: ATTACKER, db });
		expect(res.status).toBe(403);
		expect(await pinnedTo(db, 'allowlist')).toBeNull();
	});

	it('joinWaitlist stores no handle, so a promotion cannot pin the claimed handle', async () => {
		await run('joinWaitlist', { did: ATTACKER, db, form: { email: 'a@example.com' } });
		const row = await db.prepare(`SELECT handle FROM waitlist WHERE did = ?1`).bind(ATTACKER).first<{ handle: string | null }>();
		expect(row?.handle).toBeNull();
	});
});

describe('`/` with an appview-verified handle', () => {
	let db: D1Database;
	beforeEach(async () => {
		db = await seed();
		bsky.display = { did: VICTIM, handle: VICTIM_HANDLE, displayName: 'Victim' };
		bsky.appview = { did: VICTIM, handle: VICTIM_HANDLE };
	});

	it('load: invited, allowed, pinned, and the response is private/no-store', async () => {
		const headers: Record<string, string> = {};
		const data = await runLoad({ did: VICTIM, db, headers });
		expect(data.site.tier).toBe('invited');
		expect(data.allowed).toBe(true);
		expect(await pinnedTo(db, 'allowlist')).toBe(VICTIM);
		expect(headers['cache-control']).toBe('private, no-store');
	});

	it('load: a late pass lifts the registration gate and pins', async () => {
		await db.prepare(`INSERT INTO late_passes (handle, did, granted_at) VALUES (?1, NULL, ?2)`).bind(VICTIM_HANDLE, PAST).run();
		const data = await runLoad({ did: VICTIM, db }, { REG_DEADLINE: PAST });
		expect(data.regClosed).toBe(false);
		expect(await pinnedTo(db, 'late_passes')).toBe(VICTIM);
	});

	it('register succeeds and stores the verified handle', async () => {
		const res = await run('register', { did: VICTIM, db, form: validForm });
		expect(res).toEqual({ registered: true });
		expect((await getRegistration(db, VICTIM))?.handle).toBe(VICTIM_HANDLE);
	});

	it('a signed-out visitor is public, also private/no-store', async () => {
		const headers: Record<string, string> = {};
		const data = await runLoad({ did: null, db, headers });
		expect(data.site.tier).toBe('public');
		expect(headers['cache-control']).toBe('private, no-store');
	});
});

describe('no-JS registration posts', () => {
	it('a plain POST to ?register&/register with errors keeps the registration flow', async () => {
		const db = await seed();
		bsky.display = { did: VICTIM, handle: VICTIM_HANDLE };
		bsky.appview = { did: VICTIM, handle: VICTIM_HANDLE };
		const path = '/?register&/register';
		const res = await run('register', { did: VICTIM, db, form: { name: '' }, path });
		expect(res.status).toBe(400);
		// SvelteKit re-runs load on the same URL after a no-JS action POST.
		const data = await runLoad({ did: VICTIM, db, path });
		expect(data.registerMode).toBe(true);
		expect(data.registrationMode).toBe(true);
	});
});
