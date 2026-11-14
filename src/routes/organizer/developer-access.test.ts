import { describe, expect, it } from 'vitest';
import { sqliteD1 } from '$lib/server/test/sqlite-d1';
import { DEVELOPER, ORGANIZER, event, type EventInit } from '$lib/server/test/event';
import { actions as consoleActions, load as consoleLoad } from './+page.server';
import { actions as regActions, load as regLoad } from './registrations/[did]/+page.server';
import { GET as registrationsCsv } from './registrations.csv/+server';
import { GET as responsesCsv } from './responses.csv/+server';
import { GET as availabilityCsv } from './availability.csv/+server';

/**
 * A developer (DEVELOPER_DIDS) edits retreat content only. Every surface that
 * holds registrant data — the console, its actions (allowlist, late passes,
 * waitlist, broadcasts…), the CSVs and per-attendee edits — must refuse them
 * exactly like a stranger. The editor itself is covered in retreat/actions.test.ts.
 */

type Handler = (e: never) => unknown;
const call = (fn: Handler, init: EventInit) => fn(event<never>(init));

describe('developer access to organizer-only surfaces', () => {
	it('the console sends a developer to the retreat editor, a stranger to 404', async () => {
		const db = sqliteD1();
		const init = { db, method: 'GET' as const, path: '/organizer' };
		await expect(call(consoleLoad as Handler, { ...init, did: DEVELOPER })).rejects.toMatchObject({
			status: 303,
			location: '/organizer/retreat'
		});
		await expect(call(consoleLoad as Handler, { ...init, did: 'did:plc:someone' })).rejects.toMatchObject({ status: 404 });
	});

	it.each(Object.keys(consoleActions))('console action %s: developer → 404', async (name) => {
		const db = sqliteD1();
		const action = consoleActions[name as keyof typeof consoleActions] as Handler;
		await expect(call(action, { db, did: DEVELOPER, form: { handles: 'x.test', handle: 'x.test' } })).rejects.toMatchObject({
			status: 404
		});
	});

	it.each([
		['registrations.csv', registrationsCsv],
		['responses.csv', responsesCsv],
		['availability.csv', availabilityCsv]
	] as Array<[string, Handler]>)('%s: developer → 404', async (_name, get) => {
		await expect(call(get, { db: sqliteD1(), did: DEVELOPER, method: 'GET' })).rejects.toMatchObject({ status: 404 });
	});

	it('the same CSV route still serves an organizer', async () => {
		const res = (await call(registrationsCsv as Handler, { db: sqliteD1(), did: ORGANIZER, method: 'GET' })) as Response;
		expect(res.headers.get('content-type')).toContain('text/csv');
	});

	it('per-attendee registration page and save: developer → 404', async () => {
		const db = sqliteD1();
		const withParams = (init: EventInit) => ({ ...event<Record<string, unknown>>(init), params: { did: 'did:plc:a' } }) as never;
		await expect((regLoad as Handler)(withParams({ db, did: DEVELOPER, method: 'GET' }))).rejects.toMatchObject({ status: 404 });
		await expect((regActions.save as Handler)(withParams({ db, did: DEVELOPER, form: { name: 'x' } }))).rejects.toMatchObject({
			status: 404
		});
	});
});
