import { describe, expect, it, vi } from 'vitest';
import { sqliteD1 } from '$lib/server/test/sqlite-d1';

/** Survey writes match the allowlist with an appview-verified handle only. */
const appview = vi.hoisted(() => ({ handle: undefined as string | undefined }));
vi.mock('@svelte-atproto/oauth/bsky', () => ({
	loadBskyProfiles: vi.fn(async (dids: string[]) =>
		Object.fromEntries(dids.map((d) => [d, appview.handle ? { did: d, handle: appview.handle } : undefined]))
	)
}));
const { PUT } = await import('./+server');

const HANDLE = 'victim.bsky.social';
const draft = { name: 'V', email: 'v@example.com', homeLocation: 'Somewhere', interest: 'no' };

async function put(did: string) {
	const db = sqliteD1();
	await db.prepare(`INSERT INTO allowlist (handle, did) VALUES (?1, NULL)`).bind(HANDLE).run();
	const ev = {
		locals: { did },
		platform: { env: { DB: db } },
		request: new Request('http://x/api/response', { method: 'PUT', body: JSON.stringify(draft) })
	} as unknown as Parameters<typeof PUT>[0];
	let status = 200;
	try {
		status = (await PUT(ev)).status;
	} catch (e) {
		status = (e as { status: number }).status;
	}
	const pinned = (await db.prepare(`SELECT did FROM allowlist WHERE handle = ?1`).bind(HANDLE).first<{ did: string | null }>())?.did;
	return { status, pinned };
}

describe('PUT /api/response — identity', () => {
	it('a handle the appview does not verify is refused and pins nothing', async () => {
		appview.handle = 'handle.invalid';
		expect(await put('did:plc:attacker')).toEqual({ status: 403, pinned: null });
	});
	it('an appview-verified handle saves and pins the DID', async () => {
		appview.handle = HANDLE;
		expect(await put('did:plc:victim')).toEqual({ status: 200, pinned: 'did:plc:victim' });
	});
});
