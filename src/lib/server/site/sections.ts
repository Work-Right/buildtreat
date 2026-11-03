import type { D1Database } from '@cloudflare/workers-types';
import { canSee, isVisibility, type ViewerTier, type Visibility } from './tier';

/**
 * Retreat-site sections (migrations 0010, 0011). A row is either a page
 * section (kind 'section', ordered by position) or an update (kind
 * 'update', dated by published_at, rendered in the posts stream). All SQL
 * parameterized.
 */

export const KINDS = ['section', 'update'] as const;
export type SectionKind = (typeof KINDS)[number];

export function isKind(value: string): value is SectionKind {
	return (KINDS as readonly string[]).includes(value);
}

export interface Section {
	id: number;
	title: string;
	body: string;
	visibility: Visibility;
	position: number;
	updatedAt: string;
	updatedBy: string;
	kind: SectionKind;
	/** YYYY-MM-DD for updates; null for sections. */
	publishedAt: string | null;
}

export interface SectionInput {
	title: string;
	body: string;
	visibility: Visibility;
	/** Omitted on create → 'section'; omitted on update → unchanged. */
	kind?: SectionKind;
	publishedAt?: string | null;
}

export const TITLE_MAX = 120;
export const BODY_MAX = 20_000;

interface SectionRow {
	id: number;
	title: string;
	body: string;
	visibility: string;
	position: number;
	updated_at: string;
	updated_by: string;
	kind: string;
	published_at: string | null;
}

function toSection(r: SectionRow): Section {
	return {
		id: r.id,
		title: r.title,
		body: r.body,
		// The CHECK constraint guarantees the enum; fall back to the most
		// restrictive value rather than trusting an unexpected string.
		visibility: isVisibility(r.visibility) ? r.visibility : 'hidden',
		position: r.position,
		updatedAt: r.updated_at,
		updatedBy: r.updated_by,
		kind: isKind(r.kind) ? r.kind : 'section',
		publishedAt: r.published_at
	};
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(v: string): boolean {
	if (!DATE_RE.test(v)) return false;
	const d = new Date(`${v}T00:00:00Z`);
	return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Today's date at the retreat (Pacific), YYYY-MM-DD — the default publish date. */
export function retreatToday(now: Date = new Date()): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: 'America/Los_Angeles',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(now);
}

export function validateSection(raw: {
	title: unknown;
	body: unknown;
	visibility: unknown;
	kind?: unknown;
	publishedAt?: unknown;
}): { ok: true; value: SectionInput & { kind: SectionKind; publishedAt: string | null } } | { ok: false; error: string } {
	if (typeof raw.title !== 'string' || typeof raw.body !== 'string' || typeof raw.visibility !== 'string') {
		return { ok: false, error: 'Title, body and visibility are required' };
	}
	const title = raw.title.trim();
	const body = raw.body.replace(/\r\n/g, '\n').trimEnd();
	if (!title) return { ok: false, error: 'Give the section a title' };
	if (title.length > TITLE_MAX) return { ok: false, error: `Titles max out at ${TITLE_MAX} characters` };
	if (body.length > BODY_MAX) return { ok: false, error: `The body maxes out at ${BODY_MAX} characters` };
	if (!isVisibility(raw.visibility)) return { ok: false, error: 'Pick who can see this section' };
	// An unchecked "Post as update" box sends nothing: absent/empty = section.
	const kindRaw = raw.kind == null || raw.kind === '' ? 'section' : raw.kind;
	if (typeof kindRaw !== 'string' || !isKind(kindRaw)) return { ok: false, error: 'Unknown kind of entry' };
	let publishedAt: string | null = null;
	if (kindRaw === 'update') {
		if (typeof raw.publishedAt !== 'string' || !isCalendarDate(raw.publishedAt)) {
			return { ok: false, error: 'Pick a publish date for the update' };
		}
		publishedAt = raw.publishedAt;
	}
	return { ok: true, value: { title, body, visibility: raw.visibility, kind: kindRaw, publishedAt } };
}

const COLUMNS = `id, title, body, visibility, position, updated_at, updated_by, kind, published_at`;

/** Page sections only (kind 'section'), in position order. */
export async function listSections(db: D1Database): Promise<Section[]> {
	const { results } = await db
		.prepare(`SELECT ${COLUMNS} FROM site_sections WHERE kind = 'section' ORDER BY position, id`)
		.all<SectionRow>();
	return results.map(toSection);
}

/** Updates (kind 'update'), newest publish date first. */
export async function listUpdates(db: D1Database): Promise<Section[]> {
	const { results } = await db
		.prepare(`SELECT ${COLUMNS} FROM site_sections WHERE kind = 'update' ORDER BY published_at DESC, id DESC`)
		.all<SectionRow>();
	return results.map(toSection);
}

export function visibleTo(sections: Section[], tier: ViewerTier): Section[] {
	return sections.filter((s) => canSee(tier, s.visibility));
}

export async function getSection(db: D1Database, id: number): Promise<Section | null> {
	const row = await db.prepare(`SELECT ${COLUMNS} FROM site_sections WHERE id = ?1`).bind(id).first<SectionRow>();
	return row ? toSection(row) : null;
}

export async function createSection(db: D1Database, input: SectionInput, by: string): Promise<number> {
	const now = new Date().toISOString();
	const kind = input.kind ?? 'section';
	const row = await db
		.prepare(
			`INSERT INTO site_sections (title, body, visibility, position, updated_at, updated_by, kind, published_at)
			 VALUES (?1, ?2, ?3, (SELECT COALESCE(MAX(position), 0) + 1 FROM site_sections), ?4, ?5, ?6, ?7)
			 RETURNING id`
		)
		.bind(input.title, input.body, input.visibility, now, by, kind, kind === 'update' ? (input.publishedAt ?? null) : null)
		.first<{ id: number }>();
	if (!row) throw new Error('section insert returned no id');
	return row.id;
}

/**
 * Optimistic concurrency: the write only lands if `updated_at` is still what
 * the editor loaded. A miss is a conflict when the row exists, else missing.
 * `kind`/`publishedAt` omitted → left as they are. An update turned back
 * into a section moves to the end of the page (its old position is stale).
 */
export async function updateSection(
	db: D1Database,
	id: number,
	input: SectionInput,
	by: string,
	expectedUpdatedAt: string
): Promise<'ok' | 'conflict' | 'missing'> {
	const now = new Date().toISOString();
	const kind = input.kind ?? null;
	const publishedAt = kind === 'update' ? (input.publishedAt ?? null) : null;
	const res = await db
		.prepare(
			`UPDATE site_sections SET title = ?1, body = ?2, visibility = ?3, updated_at = ?4, updated_by = ?5,
			   position = CASE WHEN ?8 = 'section' AND kind = 'update'
			     THEN (SELECT COALESCE(MAX(position), 0) + 1 FROM site_sections) ELSE position END,
			   kind = COALESCE(?8, kind),
			   published_at = CASE WHEN ?8 IS NULL THEN published_at ELSE ?9 END
			 WHERE id = ?6 AND updated_at = ?7`
		)
		.bind(input.title, input.body, input.visibility, now, by, id, expectedUpdatedAt, kind, publishedAt)
		.run();
	if ((res.meta.changes ?? 0) > 0) return 'ok';
	return (await getSection(db, id)) ? 'conflict' : 'missing';
}

/**
 * Swap with the neighbour above/below, then renumber all page sections to
 * 1..n. Updates are not in this list (they're ordered by date), so moving
 * one returns false. False at either end or if missing.
 */
export async function moveSection(db: D1Database, id: number, direction: 'up' | 'down'): Promise<boolean> {
	const list = await listSections(db);
	const i = list.findIndex((s) => s.id === id);
	const j = direction === 'up' ? i - 1 : i + 1;
	if (i < 0 || j < 0 || j >= list.length) return false;

	// Build the new order by swapping items at indices i and j
	const newOrder = [...list];
	[newOrder[i], newOrder[j]] = [newOrder[j], newOrder[i]];

	// Update only rows whose position changed, normalizing all to 1..n
	const updates = [];
	for (let idx = 0; idx < newOrder.length; idx++) {
		const newPosition = idx + 1;
		if (newOrder[idx].position !== newPosition) {
			updates.push(
				db.prepare(`UPDATE site_sections SET position = ?1 WHERE id = ?2`).bind(newPosition, newOrder[idx].id)
			);
		}
	}

	// Issue all updates in a single transaction
	if (updates.length > 0) {
		await db.batch(updates);
	}
	return true;
}

export async function deleteSectionRow(db: D1Database, id: number): Promise<boolean> {
	const res = await db.prepare(`DELETE FROM site_sections WHERE id = ?1`).bind(id).run();
	return (res.meta.changes ?? 0) > 0;
}
