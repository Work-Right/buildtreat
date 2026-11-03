import { describe, expect, it } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import { sqliteD1 } from '$lib/server/test/sqlite-d1';
import { fakeR2 } from '$lib/server/test/fake-r2';
import { createSection, getSection } from './sections';
import {
	addPhoto,
	deletePhoto,
	deleteSection,
	deleteSectionWithoutMedia,
	UnknownSectionError,
	movePhoto,
	photosFor,
	servePhoto,
	setPhotoAlt,
	validatePhoto
} from './photos';

const JPEG = { contentType: 'image/jpeg' as const, width: 1200, height: 800 };
const blob = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });

async function setup(visibility: 'public' | 'invited' | 'hidden') {
	const db: D1Database = sqliteD1();
	const { bucket, objects } = fakeR2();
	const sectionId = await createSection(db, { title: 'S', body: '', visibility }, 'did:plc:org1');
	const id = await addPhoto(db, bucket, sectionId, blob(), JPEG);
	await setPhotoAlt(db, id, 'The pool');
	return { db, bucket, objects, sectionId, id };
}

describe('validatePhoto', () => {
	it('accepts jpeg/png/webp up to 8 MB with positive integer dimensions', () => {
		expect(validatePhoto({ type: 'image/webp', size: 10 }, '10', '20')).toEqual({
			ok: true,
			contentType: 'image/webp',
			width: 10,
			height: 20
		});
	});
	it('rejects other types, oversize files, and bad dimensions', () => {
		expect(validatePhoto({ type: 'image/gif', size: 10 }, 1, 1).ok).toBe(false);
		expect(validatePhoto({ type: 'image/jpeg', size: 8 * 1024 * 1024 + 1 }, 1, 1).ok).toBe(false);
		expect(validatePhoto({ type: 'image/jpeg', size: 10 }, '0', '5').ok).toBe(false);
		expect(validatePhoto({ type: 'image/jpeg', size: 10 }, 'abc', '5').ok).toBe(false);
	});
});

describe('photo storage', () => {
	it('writes R2 and the row; lists per section', async () => {
		const { db, objects, sectionId, id } = await setup('public');
		expect(objects.has(id)).toBe(true);
		const photos = (await photosFor(db, [sectionId])).get(sectionId)!;
		expect(photos).toHaveLength(1);
		expect(photos[0]).toMatchObject({ id, alt: 'The pool', width: 1200, height: 800 });
	});

	it('rejects an unknown section before any R2 put', async () => {
		const { bucket, objects } = fakeR2();
		await expect(addPhoto(sqliteD1(), bucket, 9999, blob(), JPEG)).rejects.toBeInstanceOf(UnknownSectionError);
		expect(objects.size).toBe(0);
	});

	it('reorders and deletes', async () => {
		const { db, bucket, objects, sectionId, id } = await setup('public');
		const second = await addPhoto(db, bucket, sectionId, blob(), JPEG);
		expect(await movePhoto(db, second, 'up')).toBe(true);
		expect((await photosFor(db, [sectionId])).get(sectionId)!.map((p) => p.id)).toEqual([second, id]);
		expect(await deletePhoto(db, bucket, id)).toBe(true);
		expect(objects.has(id)).toBe(false);
	});

	it('renumbers 1..n when moving after a delete left a gap', async () => {
		const { db, bucket, sectionId, id: first } = await setup('public');
		const second = await addPhoto(db, bucket, sectionId, blob(), JPEG);
		const third = await addPhoto(db, bucket, sectionId, blob(), JPEG);
		await deletePhoto(db, bucket, first);
		expect(await movePhoto(db, third, 'up')).toBe(true);
		expect((await photosFor(db, [sectionId])).get(sectionId)!.map((p) => p.id)).toEqual([third, second]);
		const rows = (
			await db
				.prepare(`SELECT position FROM site_photos WHERE section_id = ?1 ORDER BY position`)
				.bind(sectionId)
				.all<{ position: number }>()
		).results;
		expect(rows.map((r) => r.position)).toEqual([1, 2]);
		expect(await movePhoto(db, third, 'up')).toBe(false);
		expect(await movePhoto(db, 'nope', 'up')).toBe(false);
	});

	it('deleteSection removes photos from R2 and the section', async () => {
		const { db, bucket, objects, sectionId, id } = await setup('invited');
		expect(await deleteSection(db, bucket, sectionId)).toBe(true);
		expect(objects.has(id)).toBe(false);
		expect(await getSection(db, sectionId)).toBeNull();
	});
});

describe('servePhoto privacy matrix', () => {
	const cases: Array<['public' | 'invited' | 'hidden', 'public' | 'invited' | 'organizer', number]> = [
		['public', 'public', 200],
		['invited', 'public', 404],
		['invited', 'invited', 200],
		['hidden', 'invited', 404],
		['hidden', 'organizer', 200]
	];
	for (const [visibility, tier, status] of cases) {
		it(`${visibility} section, ${tier} viewer → ${status}`, async () => {
			const { db, bucket, id } = await setup(visibility);
			const res = await servePhoto(db, bucket, id, tier);
			expect(res.status).toBe(status);
			if (status === 200) {
				expect(res.headers.get('content-type')).toBe('image/jpeg');
				expect(res.headers.get('cache-control')).toBe('private, max-age=300');
				expect(res.headers.get('x-content-type-options')).toBe('nosniff');
			}
		});
	}
	it('unknown id and missing object → 404', async () => {
		const { db, bucket, objects, id } = await setup('public');
		expect((await servePhoto(db, bucket, 'nope', 'organizer')).status).toBe(404);
		objects.delete(id);
		expect((await servePhoto(db, bucket, id, 'public')).status).toBe(404);
	});
	it('photos without alt are not served to non-organizers', async () => {
		const { db, bucket, sectionId } = await setup('public');
		const bare = await addPhoto(db, bucket, sectionId, blob(), JPEG);
		expect((await servePhoto(db, bucket, bare, 'invited')).status).toBe(404);
		expect((await servePhoto(db, bucket, bare, 'organizer')).status).toBe(200);
	});

	it('deleteSectionWithoutMedia refuses sections that still have photos', async () => {
		const { db, sectionId } = await setup('public');
		expect(await deleteSectionWithoutMedia(db, sectionId)).toBe('has-photos');
		const empty = await createSection(db, { title: 'E', body: '', visibility: 'hidden' }, 'did:plc:org1');
		expect(await deleteSectionWithoutMedia(db, empty)).toBe(true);
	});
});
