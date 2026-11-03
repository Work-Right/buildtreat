import { describe, expect, it } from 'vitest';
import { sqliteD1 } from '$lib/server/test/sqlite-d1';
import {
	createSection,
	deleteSectionRow,
	getSection,
	listSections,
	listUpdates,
	moveSection,
	retreatToday,
	updateSection,
	validateSection,
	visibleTo
} from './sections';

const BY = 'did:plc:org1';

describe('validateSection', () => {
	it('trims and accepts a valid section', () => {
		expect(validateSection({ title: '  Schedule ', body: 'Fri: arrive', visibility: 'invited' })).toEqual({
			ok: true,
			value: { title: 'Schedule', body: 'Fri: arrive', visibility: 'invited', kind: 'section', publishedAt: null }
		});
	});
	it('rejects empty or long titles, long bodies, unknown visibility, non-strings', () => {
		expect(validateSection({ title: ' ', body: '', visibility: 'public' }).ok).toBe(false);
		expect(validateSection({ title: 'x'.repeat(121), body: '', visibility: 'public' }).ok).toBe(false);
		expect(validateSection({ title: 'ok', body: 'x'.repeat(20_001), visibility: 'public' }).ok).toBe(false);
		expect(validateSection({ title: 'ok', body: '', visibility: 'everyone' }).ok).toBe(false);
		expect(validateSection({ title: null, body: '', visibility: 'public' }).ok).toBe(false);
	});
});

describe('sections in D1', () => {
	it('lists the seed in position order', async () => {
		const titles = (await listSections(sqliteD1())).map((s) => s.title);
		expect(titles.slice(0, 2)).toEqual(['The retreat', "Who's organizing"]);
		expect(titles).toHaveLength(6);
	});

	it('filters by tier', async () => {
		const all = await listSections(sqliteD1());
		expect(visibleTo(all, 'public').every((s) => s.visibility === 'public')).toBe(true);
		expect(visibleTo(all, 'invited').some((s) => s.visibility === 'hidden')).toBe(false);
		expect(visibleTo(all, 'organizer')).toHaveLength(6);
	});

	it('creates at the end and reads back', async () => {
		const db = sqliteD1();
		const id = await createSection(db, { title: 'FAQ', body: 'Q', visibility: 'public' }, BY);
		const list = await listSections(db);
		expect(list.at(-1)?.id).toBe(id);
		expect((await getSection(db, id))?.updatedBy).toBe(BY);
	});

	it('updates only when updated_at still matches', async () => {
		const db = sqliteD1();
		const s = (await listSections(db))[0];
		const input = { title: 'The retreat', body: 'New body', visibility: 'public' as const };
		expect(await updateSection(db, s.id, input, BY, 'stale')).toBe('conflict');
		expect(await updateSection(db, s.id, input, BY, s.updatedAt)).toBe('ok');
		expect((await getSection(db, s.id))?.body).toBe('New body');
		expect(await updateSection(db, 9999, input, BY, s.updatedAt)).toBe('missing');
	});

	it('moves up and down, no-ops at the ends', async () => {
		const db = sqliteD1();
		const [a, b] = await listSections(db);
		expect(await moveSection(db, b.id, 'up')).toBe(true);
		expect((await listSections(db)).slice(0, 2).map((s) => s.id)).toEqual([b.id, a.id]);
		expect(await moveSection(db, b.id, 'up')).toBe(false);
	});

	it('moves up after delete and normalizes positions', async () => {
		const db = sqliteD1();
		const list = await listSections(db);
		const [a, b] = list;
		// Delete first two sections, leaving gaps: positions 3,4,5,6 with ids 3,4,5,6
		await deleteSectionRow(db, a.id);
		await deleteSectionRow(db, b.id);
		const beforeMove = await listSections(db);
		expect(beforeMove).toHaveLength(4);
		// beforeMove = [id 3, id 4, id 5, id 6] at positions [3, 4, 5, 6]
		const lastId = beforeMove[3].id; // id 6
		// Move the last section up once (swap with id 5)
		expect(await moveSection(db, lastId, 'up')).toBe(true);
		const afterMove = await listSections(db);
		// After the move, order should be [id 3, id 4, id 6, id 5]
		expect(afterMove.map((s) => s.id)).toEqual([
			beforeMove[0].id, // id 3
			beforeMove[1].id, // id 4
			beforeMove[3].id, // id 6 (moved up)
			beforeMove[2].id  // id 5 (moved down)
		]);
		// Verify positions are exactly 1..4 (no gaps)
		const positions = (await db.prepare('SELECT position FROM site_sections ORDER BY position').all()).results as Array<{ position: number }>;
		expect(positions.map((p) => p.position)).toEqual([1, 2, 3, 4]);
	});

	it('moves down', async () => {
		const db = sqliteD1();
		const [a, b] = await listSections(db);
		expect(await moveSection(db, a.id, 'down')).toBe(true);
		expect((await listSections(db)).slice(0, 2).map((s) => s.id)).toEqual([b.id, a.id]);
	});

	it('returns false at ends and for missing id', async () => {
		const db = sqliteD1();
		const list = await listSections(db);
		const last = list[list.length - 1];
		expect(await moveSection(db, last.id, 'down')).toBe(false);
		expect(await moveSection(db, 9999, 'up')).toBe(false);
	});

	it('detects real staleness on re-save', async () => {
		const db = sqliteD1();
		const s = (await listSections(db))[0];
		const input = { title: 'The retreat', body: 'New body', visibility: 'public' as const };
		// First save succeeds
		expect(await updateSection(db, s.id, input, BY, s.updatedAt)).toBe('ok');
		const updated = await getSection(db, s.id);
		// Load the new state, then try to save again with the OLD updatedAt
		expect(await updateSection(db, s.id, input, BY, s.updatedAt)).toBe('conflict');
	});

	it('deletes a row', async () => {
		const db = sqliteD1();
		const [a] = await listSections(db);
		expect(await deleteSectionRow(db, a.id)).toBe(true);
		expect(await getSection(db, a.id)).toBeNull();
		expect(await deleteSectionRow(db, a.id)).toBe(false);
	});
});

describe('updates (kind = update)', () => {
	it('validates kind and publish date', () => {
		const base = { title: 'News', body: 'b', visibility: 'public' };
		expect(validateSection({ ...base, kind: 'update', publishedAt: '2026-11-01' })).toEqual({
			ok: true,
			value: { title: 'News', body: 'b', visibility: 'public', kind: 'update', publishedAt: '2026-11-01' }
		});
		expect(validateSection({ ...base, kind: null, publishedAt: '2026-11-01' })).toMatchObject({
			ok: true,
			value: { kind: 'section', publishedAt: null }
		});
		expect(validateSection({ ...base, kind: 'update', publishedAt: '' }).ok).toBe(false);
		expect(validateSection({ ...base, kind: 'update', publishedAt: '2026-02-30' }).ok).toBe(false);
		expect(validateSection({ ...base, kind: 'post', publishedAt: '2026-11-01' }).ok).toBe(false);
	});

	it('keeps updates out of listSections and lists them newest first', async () => {
		const db = sqliteD1();
		const older = await createSection(db, { title: 'Old', body: '', visibility: 'public', kind: 'update', publishedAt: '2026-10-01' }, BY);
		const newer = await createSection(db, { title: 'New', body: '', visibility: 'invited', kind: 'update', publishedAt: '2026-10-20' }, BY);
		expect((await listSections(db)).some((s) => s.kind === 'update')).toBe(false);
		expect(await listSections(db)).toHaveLength(6);
		expect((await listUpdates(db)).map((u) => u.id)).toEqual([newer, older]);
		expect(await moveSection(db, older, 'up')).toBe(false);
	});

	it('update without kind keeps it; with kind converts (to the end of the page)', async () => {
		const db = sqliteD1();
		const id = await createSection(db, { title: 'U', body: '', visibility: 'public', kind: 'update', publishedAt: '2026-10-01' }, BY);
		// A section created after the update must not end up below the converted update's stale position.
		const later = await createSection(db, { title: 'Later', body: '', visibility: 'public' }, BY);
		const u = (await getSection(db, id))!;
		expect(await updateSection(db, id, { title: 'U2', body: '', visibility: 'public' }, BY, u.updatedAt)).toBe('ok');
		const kept = (await getSection(db, id))!;
		expect([kept.kind, kept.publishedAt]).toEqual(['update', '2026-10-01']);
		expect(await updateSection(db, id, { title: 'U2', body: '', visibility: 'public', kind: 'section', publishedAt: null }, BY, kept.updatedAt)).toBe('ok');
		const converted = (await getSection(db, id))!;
		expect([converted.kind, converted.publishedAt]).toEqual(['section', null]);
		expect((await listSections(db)).slice(-2).map((s) => s.id)).toEqual([later, id]);
	});

	it('retreatToday is the Pacific calendar date', () => {
		expect(retreatToday(new Date('2026-11-02T03:00:00Z'))).toBe('2026-11-01');
		expect(retreatToday(new Date('2026-11-02T09:00:00Z'))).toBe('2026-11-02');
	});
});
