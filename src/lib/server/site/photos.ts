import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import { canSee, isVisibility, type ViewerTier } from './tier';
import { deleteSectionRow } from './sections';

/**
 * Retreat-site photos: bytes in the private R2 bucket under the row id,
 * layout data in site_photos. Every read path checks the parent section's
 * visibility; photos without alt text are organizer-only until captioned.
 */

export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type PhotoType = (typeof PHOTO_TYPES)[number];
export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;
/** Per-request upload guard, checked before any file's bytes are read. */
export const UPLOAD_MAX_FILES = 6;
export const UPLOAD_MAX_TOTAL_BYTES = 24 * 1024 * 1024;
export const UPLOAD_LIMIT_MESSAGE = 'Upload at most 6 photos (24 MB) at a time';
export const ALT_MAX = 300;

export interface Photo {
	id: string;
	sectionId: number;
	alt: string;
	width: number;
	height: number;
	contentType: PhotoType;
	position: number;
}

interface PhotoRow {
	id: string;
	section_id: number;
	alt: string;
	width: number;
	height: number;
	content_type: string;
	position: number;
}

export const isPhotoType = (t: string): t is PhotoType => (PHOTO_TYPES as readonly string[]).includes(t);

function toPhoto(r: PhotoRow): Photo {
	return {
		id: r.id,
		sectionId: r.section_id,
		alt: r.alt,
		width: r.width,
		height: r.height,
		contentType: isPhotoType(r.content_type) ? r.content_type : 'image/jpeg',
		position: r.position
	};
}

function dimension(v: unknown): number | null {
	const n = typeof v === 'number' ? v : Number(String(v ?? ''));
	return Number.isInteger(n) && n > 0 && n <= 20_000 ? n : null;
}

export function validatePhoto(
	file: { type: string; size: number },
	width: unknown,
	height: unknown
): { ok: true; contentType: PhotoType; width: number; height: number } | { ok: false; error: string } {
	if (!isPhotoType(file.type)) return { ok: false, error: 'Photos must be JPEG, PNG or WebP' };
	if (file.size <= 0) return { ok: false, error: 'That file is empty' };
	if (file.size > PHOTO_MAX_BYTES) return { ok: false, error: 'Photos max out at 8 MB' };
	const w = dimension(width);
	const h = dimension(height);
	if (!w || !h) return { ok: false, error: 'Could not read the photo’s size — try again' };
	return { ok: true, contentType: file.type, width: w, height: h };
}

/** The target section is gone — a 404 for the caller, not a storage failure. */
export class UnknownSectionError extends Error {}

export async function addPhoto(
	db: D1Database,
	bucket: R2Bucket,
	sectionId: number,
	file: Blob,
	meta: { contentType: PhotoType; width: number; height: number }
): Promise<string> {
	const exists = await db.prepare(`SELECT 1 AS ok FROM site_sections WHERE id = ?1`).bind(sectionId).first();
	if (!exists) throw new UnknownSectionError('unknown section');
	const id = crypto.randomUUID();
	// DOM Blob vs workers-types Blob are structurally incompatible in types only.
	await bucket.put(id, file as unknown as Parameters<R2Bucket['put']>[1], { httpMetadata: { contentType: meta.contentType } });
	try {
		const res = await db
			.prepare(
				`INSERT INTO site_photos (id, section_id, alt, width, height, content_type, position, created_at)
				 SELECT ?1, s.id, '', ?3, ?4, ?5,
				        (SELECT COALESCE(MAX(position), 0) + 1 FROM site_photos WHERE section_id = ?2), ?6
				 FROM site_sections s WHERE s.id = ?2`
			)
			.bind(id, sectionId, meta.width, meta.height, meta.contentType, new Date().toISOString())
			.run();
		if ((res.meta.changes ?? 0) === 0) throw new UnknownSectionError('unknown section');
	} catch (e) {
		await bucket.delete(id).catch((err) => console.error('orphan photo cleanup failed', err));
		throw e;
	}
	return id;
}

export async function photosFor(db: D1Database, sectionIds: number[]): Promise<Map<number, Photo[]>> {
	const out = new Map<number, Photo[]>(sectionIds.map((id) => [id, []]));
	if (!sectionIds.length) return out;
	const { results } = await db
		.prepare(
			`SELECT id, section_id, alt, width, height, content_type, position FROM site_photos
			 WHERE section_id IN (SELECT value FROM json_each(?1)) ORDER BY section_id, position, created_at`
		)
		.bind(JSON.stringify(sectionIds))
		.all<PhotoRow>();
	for (const r of results) out.get(r.section_id)?.push(toPhoto(r));
	return out;
}

export async function setPhotoAlt(db: D1Database, id: string, alt: string): Promise<boolean> {
	const res = await db.prepare(`UPDATE site_photos SET alt = ?1 WHERE id = ?2`).bind(alt.trim().slice(0, ALT_MAX), id).run();
	return (res.meta.changes ?? 0) > 0;
}

export async function movePhoto(db: D1Database, id: string, direction: 'up' | 'down'): Promise<boolean> {
	const row = await db.prepare(`SELECT section_id FROM site_photos WHERE id = ?1`).bind(id).first<{ section_id: number }>();
	if (!row) return false;
	const list = (await photosFor(db, [row.section_id])).get(row.section_id) ?? [];
	const i = list.findIndex((p) => p.id === id);
	const j = direction === 'up' ? i - 1 : i + 1;
	if (i < 0 || j < 0 || j >= list.length) return false;
	// Renumber the whole section 1..n so gaps left by deletes can't misorder it.
	const next = [...list];
	[next[i], next[j]] = [next[j], next[i]];
	const updates = next
		.map((p, idx) => ({ p, position: idx + 1 }))
		.filter(({ p, position }) => p.position !== position)
		.map(({ p, position }) => db.prepare(`UPDATE site_photos SET position = ?1 WHERE id = ?2`).bind(position, p.id));
	if (updates.length) await db.batch(updates);
	return true;
}

export async function deletePhoto(db: D1Database, bucket: R2Bucket, id: string): Promise<boolean> {
	const res = await db.prepare(`DELETE FROM site_photos WHERE id = ?1`).bind(id).run();
	if ((res.meta.changes ?? 0) === 0) return false;
	await bucket.delete(id).catch((e) => console.error('photo object delete failed', e));
	return true;
}

/** Photos first (rows + objects), then the section — no reliance on CASCADE. */
export async function deleteSection(db: D1Database, bucket: R2Bucket, sectionId: number): Promise<boolean> {
	const { results } = await db
		.prepare(`SELECT id FROM site_photos WHERE section_id = ?1`)
		.bind(sectionId)
		.all<{ id: string }>();
	await db.prepare(`DELETE FROM site_photos WHERE section_id = ?1`).bind(sectionId).run();
	if (results.length) {
		await bucket.delete(results.map((r) => r.id)).catch((e) => console.error('section photo delete failed', e));
	}
	return deleteSectionRow(db, sectionId);
}

/** For when R2 is unbound: only photo-less sections can be deleted. */
export async function deleteSectionWithoutMedia(db: D1Database, sectionId: number): Promise<boolean | 'has-photos'> {
	const n = await db.prepare(`SELECT COUNT(*) AS n FROM site_photos WHERE section_id = ?1`).bind(sectionId).first<{ n: number }>();
	if ((n?.n ?? 0) > 0) return 'has-photos';
	return deleteSectionRow(db, sectionId);
}

const NOT_FOUND = () => new Response('Not found', { status: 404 });

/** The only way photo bytes leave R2. 404 for anything the viewer can't see. */
export async function servePhoto(db: D1Database, bucket: R2Bucket, id: string, tier: ViewerTier): Promise<Response> {
	const row = await db
		.prepare(
			`SELECT p.content_type, p.alt, s.visibility FROM site_photos p
			 JOIN site_sections s ON s.id = p.section_id WHERE p.id = ?1`
		)
		.bind(id)
		.first<{ content_type: string; alt: string; visibility: string }>();
	if (!row || !isVisibility(row.visibility) || !canSee(tier, row.visibility)) return NOT_FOUND();
	if (!row.alt && tier !== 'organizer') return NOT_FOUND();
	const object = await bucket.get(id);
	if (!object) return NOT_FOUND();
	return new Response(object.body as unknown as ReadableStream, {
		headers: {
			'content-type': isPhotoType(row.content_type) ? row.content_type : 'application/octet-stream',
			'cache-control': 'private, max-age=300',
			'x-content-type-options': 'nosniff'
		}
	});
}
