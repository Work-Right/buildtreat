import { afterEach, describe, expect, it, vi } from 'vitest';
import { sqliteD1 } from '$lib/server/test/sqlite-d1';
import { fakeR2 } from '$lib/server/test/fake-r2';
import { event } from '$lib/server/test/event';
import { createSection } from '$lib/server/site/sections';
import { addPhoto, setPhotoAlt } from '$lib/server/site/photos';
import { photoTier } from '$lib/server/site/tier';

const JPEG = { contentType: 'image/jpeg' as const, width: 1200, height: 800 };

async function invitedPhoto() {
	const db = sqliteD1();
	const { bucket } = fakeR2();
	const sectionId = await createSection(db, { title: 'S', body: '', visibility: 'invited' }, 'did:plc:org1');
	const id = await addPhoto(db, bucket, sectionId, new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }), JPEG);
	await setPhotoAlt(db, id, 'A photo');
	return { db, bucket, id };
}

async function get(dev: boolean, path: (id: string) => string) {
	vi.resetModules();
	vi.doMock('$app/environment', () => ({ dev, browser: false, building: false, version: 'test' }));
	const { GET } = await import('./+server');
	const { db, bucket, id } = await invitedPhoto();
	const ev = event<Parameters<typeof GET>[0]>({ did: null, db, media: bucket, path: path(id) });
	(ev as unknown as { params: { id: string } }).params = { id };
	return GET(ev);
}

afterEach(() => vi.doUnmock('$app/environment'));

describe('GET /media/site/[id] — dev ?preview', () => {
	it('outside dev, ?preview is ignored: a signed-out visitor gets 404 for an invited photo', async () => {
		expect((await get(false, (id) => `/media/site/${id}?preview`)).status).toBe(404);
	});
	it('in dev, ?preview serves invited photos for the preview home', async () => {
		expect((await get(true, (id) => `/media/site/${id}?preview`)).status).toBe(200);
	});
	it('in dev without ?preview, a signed-out visitor still gets 404', async () => {
		expect((await get(true, (id) => `/media/site/${id}`)).status).toBe(404);
	});
});

describe('photoTier', () => {
	it('only lifts public to invited when both dev and preview hold', () => {
		expect(photoTier('public', { dev: false, preview: true })).toBe('public');
		expect(photoTier('public', { dev: true, preview: false })).toBe('public');
		expect(photoTier('public', { dev: true, preview: true })).toBe('invited');
		expect(photoTier('organizer', { dev: true, preview: true })).toBe('organizer');
	});
});

describe('GET /media/site/[id] — identity', () => {
	const VICTIM_HANDLE = 'victim.bsky.social';
	async function getAs(did: string, appviewHandle: string | undefined) {
		vi.resetModules();
		vi.doMock('$app/environment', () => ({ dev: false, browser: false, building: false, version: 'test' }));
		// The display loader returns whatever the account's PDS claims; only
		// the appview batch loader may verify a handle.
		vi.doMock('@svelte-atproto/oauth/bsky', () => ({
			loadBskyProfile: async () => ({ did, handle: VICTIM_HANDLE }),
			loadBskyProfiles: async (dids: string[]) =>
				Object.fromEntries(dids.map((d) => [d, appviewHandle ? { did: d, handle: appviewHandle } : undefined]))
		}));
		const { GET } = await import('./+server');
		const { db, bucket, id } = await invitedPhoto();
		await db.prepare(`INSERT INTO allowlist (handle, did) VALUES (?1, NULL)`).bind(VICTIM_HANDLE).run();
		const ev = event<Parameters<typeof GET>[0]>({ did, db, media: bucket, path: `/media/site/${id}` });
		(ev as unknown as { params: { id: string } }).params = { id };
		return GET(ev);
	}
	afterEach(() => vi.doUnmock('@svelte-atproto/oauth/bsky'));

	it('a PDS-claimed handle (appview: handle.invalid) does not unlock an invited photo', async () => {
		expect((await getAs('did:plc:attacker', 'handle.invalid')).status).toBe(404);
	});
	it('an appview-verified handle on the allowlist does', async () => {
		expect((await getAs('did:plc:victim', VICTIM_HANDLE)).status).toBe(200);
	});
});
