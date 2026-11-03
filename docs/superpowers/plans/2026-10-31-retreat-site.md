# Retreat Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/` into the retreat home — organizer-edited sections (public / invited / hidden) with photos — plus a console page at `/organizer/retreat` to edit them, per `docs/superpowers/specs/2026-10-31-retreat-site-design.md`.

**Architecture:** Sections live in D1 (`site_sections`, `site_photos`), photo bytes in a private R2 bucket (`SITE_MEDIA`). One server function decides the viewer's tier; every section and photo read goes through it, and filtering happens on the server before render. Markdown is rendered with markdown-it (web only). The existing registration flow moves behind `/?register` on the same route.

**Tech Stack:** SvelteKit 2 / Svelte 5 runes, Cloudflare Workers (adapter-cloudflare), D1, R2, markdown-it 15, vitest 5 (tests run real migration SQL on `node:sqlite`).

> **Execution order:** 6 → 7 → 8 → 9 → 9a → 9b → 10 → 11 (Tasks 1–5 are done). Tasks 9a/9b implement the spec's *Amendment — 2026-11-01* (two views on `/`, Who's coming, Posts stream).

## Global Constraints

- Branch: `feat/retreat-site`. Conventional commits; stage files by name (never `git add -A/./*`). Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Package manager: **pnpm** only; commit `pnpm-lock.yaml` with any `package.json` change.
- `pnpm check` must stay at **0 errors, 0 warnings**; `pnpm test` and `pnpm build` green at every commit.
- All D1 SQL parameterized (`?1`, `?2` … with `.bind`). No string-built SQL.
- `$lib/server/*` is never imported as a value from client code; `import type` is fine.
- Svelte 5 runes only; **no `bind:` on component props** (breaks the page `<title>` in SSR) — pass a value + callback.
- Files stay under ~450 lines; split by responsibility.
- Visibility enum: exactly `'public' | 'invited' | 'hidden'`. Tier enum: exactly `'public' | 'invited' | 'organizer'`.
- **Invited tier fails closed**: any lookup error → `'public'`. (Unlike the existing `allowed` courtesy gate on `/`, which fails open.)
- Public surfaces never name the town, address, or house: public location wording is "near Palm Springs".
- Photo limits: types `image/jpeg`, `image/png`, `image/webp`; max **8 MB** server-side; browser downscale to **2400 px** longest edge, JPEG quality **0.85**.
- Section limits: title 1–120 chars; body ≤ 20 000 chars.
- Hidden photos/sections are visible only to organizers; unknown or not-visible photo → **404**; photo responses `Cache-Control: private, max-age=300` and `X-Content-Type-Options: nosniff`.
- Production writes (R2 bucket creation, migrations 0010 and 0011 on prod D1) only after Bryan's explicit OK.
- Who's coming shows only organizer-curated, still-confirmed registrants; Bluesky data is fetched only from https://public.api.bsky.app.

## File Structure

| Path | New/Mod | Responsibility |
|---|---|---|
| `package.json`, `pnpm-lock.yaml` | Mod | add `markdown-it@^15.0.3`, dev `@types/node` |
| `src/lib/markdown/render.ts` (+ `.test.ts`) | New | configured markdown-it; `renderMarkdown(src)` — client-importable |
| `src/lib/markdown/AGENTS.md`, `CLAUDE.md` | New | folder guide + shim |
| `migrations/0010_site_content.sql` | New | tables + seed sections |
| `src/lib/server/test/sqlite-d1.ts` | New | test-only D1 adapter over `node:sqlite` running real migrations |
| `src/lib/server/site/tier.ts` (+ test) | New | `viewerTier`, `canSee`, `pageTier`, visibility guards |
| `src/lib/server/site/sections.ts` (+ test) | New | section CRUD, validation, ordering, conflict check |
| `src/lib/server/site/photos.ts` (+ test) | New | photo validation, R2 writes/deletes, `servePhoto` |
| `src/lib/server/site/page.ts` (+ test) | New | `loadSite` → data for `/` (rendered sections, link preview) |
| `src/lib/server/site/AGENTS.md`, `CLAUDE.md` | New | folder guide + shim |
| `src/routes/media/site/[id]/+server.ts` | New | photo GET, thin over `servePhoto` |
| `src/app.d.ts`, `wrangler.jsonc` | Mod | `SITE_MEDIA: R2Bucket` binding |
| `src/lib/content.ts` | Mod | public location wording, home copy |
| `src/routes/+page.server.ts` | Mod | add `site` to every load return; `?register` mode |
| `src/routes/+page.svelte` | Mod | render `RetreatHome` or `RegistrationFlow`; drop survey feed |
| `src/lib/site/RetreatHome.svelte`, `StatusStrip.svelte`, `SiteSection.svelte`, `PhotoGallery.svelte` | New | the home page |
| `src/lib/site/AGENTS.md`, `CLAUDE.md` | New | folder guide + shim |
| `src/lib/registration/RegistrationFlow.svelte` | Mod | "← Retreat home" link; no survey link |
| `src/routes/organizer/retreat/+page.server.ts`, `+page.svelte` | New | console route |
| `src/lib/site/console/SectionList.svelte`, `SectionEditor.svelte`, `PhotoManager.svelte`, `downscale.ts` | New | console UI |
| `src/lib/organizer/OrganizerRail.svelte` | Mod | link to `/organizer/retreat` |
| `migrations/0011_site_featured_posts.sql` | New | `site_featured`, `site_bsky_posts`; `site_sections.kind` + `published_at` (Task 9a) |
| `src/lib/server/site/featured.ts` (+ test) | New | Who's coming: curation, ordering, profile hydration with injected loader (Task 9a) |
| `src/lib/server/site/bsky-posts.ts` (+ test) | New | strict post-URL parser, fixed-host resolve/hydrate, KV cache, safe view model (Task 9b) |
| `src/lib/server/site/sections.ts`, `page.ts` | Mod | `kind`/`published_at`, `listUpdates`; `loadSite` gains `attendees` + `posts` (Tasks 9a/9b) |
| `src/routes/organizer/retreat/attendees/+page.server.ts`, `+page.svelte` | New | Who's coming console (Task 9a) |
| `src/lib/site/WhosComing.svelte`, `PostsStream.svelte`, `BskyPost.svelte` | New | home: Who's coming + Posts stream (Tasks 9a/9b) |
| `src/lib/site/console/BskyPostsManager.svelte` | New | add/remove Bluesky posts in the console (Task 9b) |
| `src/AGENTS.md`, `src/lib/AGENTS.md`, `src/routes/AGENTS.md`, `src/lib/server/AGENTS.md` | Mod | docs |

---

### Task 1: markdown renderer

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`
- Create: `src/lib/markdown/render.ts`, `src/lib/markdown/render.test.ts`, `src/lib/markdown/AGENTS.md`, `src/lib/markdown/CLAUDE.md`

**Interfaces:**
- Produces: `renderMarkdown(src: string): string` — safe HTML (no raw HTML, no `javascript:`/`data:` links, no images, headings clamped to h2/h3, soft breaks → `<br>`, bare `http(s)` URLs linked, links get `rel="noopener noreferrer"`).

- [ ] **Step 1: Add the dependency**

Run: `pnpm add markdown-it@^15.0.3`
Expected: `package.json` gains `"markdown-it": "^15.0.3"` under dependencies; lockfile updated. Confirm types ship: `ls node_modules/markdown-it/dist/*.d.*` lists `markdown-it.d.cts` (or `.d.mts`).

- [ ] **Step 2: Write the failing test** — `src/lib/markdown/render.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './render';

describe('renderMarkdown', () => {
	it('renders paragraphs, emphasis, and lists', () => {
		const html = renderMarkdown('Hello **there** and _you_.\n\n- one\n- two');
		expect(html).toContain('<p>Hello <strong>there</strong> and <em>you</em>.</p>');
		expect(html).toContain('<ul>\n<li>one</li>\n<li>two</li>\n</ul>');
	});

	it('turns single newlines into line breaks', () => {
		expect(renderMarkdown('line one\nline two')).toContain('line one<br>\nline two');
	});

	it('escapes raw html instead of rendering it', () => {
		const html = renderMarkdown('<script>alert(1)</script> <b>bold</b>');
		expect(html).not.toContain('<script>');
		expect(html).not.toContain('<b>');
		expect(html).toContain('&lt;script&gt;');
	});

	it('refuses javascript: and data: links', () => {
		const html = renderMarkdown('[x](javascript:alert(1)) [y](data:text/html,hi)');
		expect(html).not.toContain('href="javascript:');
		expect(html).not.toContain('href="data:');
	});

	it('links bare https urls but not scheme-less domains', () => {
		const html = renderMarkdown('See https://buildersretre.at and example.com');
		expect(html).toContain('<a href="https://buildersretre.at" rel="noopener noreferrer">https://buildersretre.at</a>');
		expect(html).not.toContain('href="http://example.com"');
	});

	it('adds rel to labelled links', () => {
		expect(renderMarkdown('[site](https://buildersretre.at)')).toContain(
			'<a href="https://buildersretre.at" rel="noopener noreferrer">site</a>'
		);
	});

	it('clamps headings to h2 and h3', () => {
		const html = renderMarkdown('# Top\n\n## Mid\n\n#### Deep');
		expect(html).toContain('<h2>Top</h2>');
		expect(html).toContain('<h2>Mid</h2>');
		expect(html).toContain('<h3>Deep</h3>');
		expect(html).not.toMatch(/<h[1456]/);
	});

	it('does not render markdown images', () => {
		const html = renderMarkdown('![alt](https://example.test/x.png)');
		expect(html).not.toContain('<img');
	});
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm vitest run src/lib/markdown/render.test.ts`
Expected: FAIL — `Failed to resolve import "./render"`.

- [ ] **Step 4: Implement** — `src/lib/markdown/render.ts`

```ts
import MarkdownIt from 'markdown-it';

/**
 * Markdown for organizer-written retreat sections, shared by the server
 * render of `/` and the console's live preview. markdown-it's defaults do
 * the safety work: `html: false` escapes raw HTML and `validateLink`
 * rejects javascript:/vbscript:/file:/data: hrefs. On top of that: no
 * images (photos come from the section's photo list), headings clamped to
 * h2/h3 so a section can't out-rank the page title, and only explicit
 * http(s) URLs auto-link.
 */
const md = new MarkdownIt({ html: false, linkify: true, breaks: true, typographer: false });
md.disable(['image']);
md.linkify.set({ fuzzyLink: false, fuzzyEmail: false });

md.core.ruler.push('clamp_headings', (state) => {
	for (const token of state.tokens) {
		if (token.type === 'heading_open' || token.type === 'heading_close') {
			const level = Number(token.tag.slice(1));
			token.tag = level <= 2 ? 'h2' : 'h3';
		}
	}
});

const defaultLinkOpen =
	md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
	tokens[idx].attrSet('rel', 'noopener noreferrer');
	return defaultLinkOpen(tokens, idx, options, env, self);
};

export function renderMarkdown(src: string): string {
	return md.render(src);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run src/lib/markdown/render.test.ts`
Expected: PASS (8 tests). If the `<br>` test fails on whitespace, check the actual string with `console.log` and match markdown-it's exact output (`<br>\n`) — do not change config.

- [ ] **Step 6: Folder docs**

`src/lib/markdown/CLAUDE.md`:
```
@AGENTS.md
```
`src/lib/markdown/AGENTS.md`:
```markdown
# src/lib/markdown — section markdown

`render.ts` exports `renderMarkdown(src)`: markdown-it configured for
organizer-written retreat sections. Client-importable (the console's live
preview) and used server-side to render `/`.

## Boundaries

- Safety comes from markdown-it defaults — `html: false` and its
  `validateLink`. Never enable `html`, never override `validateLink`.
- Images are disabled; section photos come from `site_photos`.
- Headings clamp to h2/h3. Bare links only for explicit `http(s)://`.
- **Broadcast emails do not use this.** `server/messaging/email-template.ts`
  keeps its own renderer, whose tests pin non-CommonMark behavior.

## Verify

`pnpm test src/lib/markdown`.
```

- [ ] **Step 7: Verify and commit**

Run: `pnpm check && pnpm test`
Expected: 0 errors / 0 warnings; all tests pass.

```bash
git add package.json pnpm-lock.yaml src/lib/markdown/render.ts src/lib/markdown/render.test.ts src/lib/markdown/AGENTS.md src/lib/markdown/CLAUDE.md
git commit -m "feat(markdown): markdown-it renderer for retreat sections"
```

---

### Task 2: schema, test database, viewer tier

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml` (dev `@types/node`)
- Create: `migrations/0010_site_content.sql`, `src/lib/server/test/sqlite-d1.ts`, `src/lib/server/site/tier.ts`, `src/lib/server/site/tier.test.ts`

**Interfaces:**
- Consumes: `peekAllowlist(db, { did, handle })` from `$lib/server/db`; `hasLatePass(db, { did, handle })`, `isOrganizer(organizerDids, did)` from `$lib/server/organizer/admin`.
- Produces:
  - `type Visibility = 'public' | 'invited' | 'hidden'`, `VISIBILITIES`, `isVisibility(v: string): v is Visibility`
  - `type ViewerTier = 'public' | 'invited' | 'organizer'`
  - `canSee(tier: ViewerTier, visibility: Visibility): boolean`
  - `viewerTier(db: D1Database | undefined, organizerDids: string | undefined, who: { did: string; handle: string | null } | null): Promise<ViewerTier>`
  - `pageTier(actual: ViewerTier, asParam: string | null): 'public' | 'invited'` — what `/` renders as (organizers default to invited; `?as=public|invited` honored only for organizers)
  - test helper `sqliteD1(): D1Database` — in-memory DB with every `migrations/*.sql` applied in order.

- [ ] **Step 1: Add Node types for the test helper**

Run: `pnpm add -D @types/node`
Expected: devDependency added; lockfile updated.

- [ ] **Step 2: Write the migration** — `migrations/0010_site_content.sql`

```sql
-- the Atmospheric Builders' Retreat — retreat site content

-- `/` becomes the retreat home: organizer-written sections, each public,
-- invited-only, or hidden (a draft). Photos are stored in the private R2
-- bucket SITE_MEDIA under their `id`; rows here carry what the page needs
-- to lay them out. An empty `alt` means the photo isn't shown yet.
CREATE TABLE site_sections (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  visibility  TEXT NOT NULL DEFAULT 'hidden'
              CHECK (visibility IN ('public', 'invited', 'hidden')),
  position    INTEGER NOT NULL,
  updated_at  TEXT NOT NULL,
  updated_by  TEXT NOT NULL
);

CREATE TABLE site_photos (
  id            TEXT PRIMARY KEY,
  section_id    INTEGER NOT NULL REFERENCES site_sections(id) ON DELETE CASCADE,
  alt           TEXT NOT NULL DEFAULT '',
  width         INTEGER NOT NULL,
  height        INTEGER NOT NULL,
  content_type  TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  position      INTEGER NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE INDEX site_photos_section ON site_photos(section_id, position);

-- Seed: public facts the site already states (PRODUCT.md / content.ts),
-- plus empty hidden drafts for the invited sections Bryan will write.
INSERT INTO site_sections (title, body, visibility, position, updated_at, updated_by) VALUES
  ('The retreat',
   'Three nights and two full days with the builders of the Atmosphere — December 4–7, 2026, near Palm Springs, California.' || char(10) || char(10) ||
   'Lodging and food are covered. You cover your travel; if that''s a stretch, registration asks how we can help.',
   'public', 1, '2026-10-31T00:00:00Z', 'seed'),
  ('Who''s organizing',
   'Organized by Bryan Guffey ([@chaosgreml.in](https://aturi.to/profile/did:plc:h3wpawnrlptr4534chevddo6)) in partnership with Bluesky PBC.',
   'public', 2, '2026-10-31T00:00:00Z', 'seed'),
  ('Where we''re staying', '', 'hidden', 3, '2026-10-31T00:00:00Z', 'seed'),
  ('Schedule', '', 'hidden', 4, '2026-10-31T00:00:00Z', 'seed'),
  ('Getting there', '', 'hidden', 5, '2026-10-31T00:00:00Z', 'seed'),
  ('What to bring', '', 'hidden', 6, '2026-10-31T00:00:00Z', 'seed');
```

- [ ] **Step 3: Write the test helper** — `src/lib/server/test/sqlite-d1.ts`

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { D1Database } from '@cloudflare/workers-types';

/**
 * Test-only: a D1-shaped wrapper over an in-memory node:sqlite database with
 * every migration in /migrations applied in filename order, so server tests
 * exercise the real schema and SQL. Supports the subset this app uses:
 * prepare().bind(...).first/all/run, and batch().
 */
export function sqliteD1(): D1Database {
	const db = new DatabaseSync(':memory:');
	db.exec('PRAGMA foreign_keys = ON');
	const dir = join(process.cwd(), 'migrations');
	for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
		db.exec(readFileSync(join(dir, file), 'utf8'));
	}
	type Arg = string | number | null;
	const statement = (sql: string, args: Arg[] = []) => ({
		bind: (...next: unknown[]) => statement(sql, next as Arg[]),
		first: async <T>(column?: string): Promise<T | null> => {
			const row = db.prepare(sql).get(...args) as Record<string, unknown> | undefined;
			if (!row) return null;
			return (column ? row[column] : { ...row }) as T;
		},
		all: async <T>() => ({
			results: (db.prepare(sql).all(...args) as Record<string, unknown>[]).map((r) => ({ ...r })) as T[],
			success: true,
			meta: {}
		}),
		run: async () => {
			const r = db.prepare(sql).run(...args);
			return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
		}
	});
	return {
		prepare: (sql: string) => statement(sql),
		batch: async (stmts: Array<{ run: () => Promise<unknown> }>) => {
			db.exec('BEGIN');
			try {
				const out = [];
				for (const s of stmts) out.push(await s.run());
				db.exec('COMMIT');
				return out;
			} catch (e) {
				db.exec('ROLLBACK');
				throw e;
			}
		}
	} as unknown as D1Database;
}
```

- [ ] **Step 4: Write the failing tier test** — `src/lib/server/site/tier.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import { sqliteD1 } from '$lib/server/test/sqlite-d1';
import { canSee, isVisibility, pageTier, viewerTier } from './tier';

const ORGANIZERS = 'did:plc:org1,did:plc:org2';

async function seeded(): Promise<D1Database> {
	const db = sqliteD1();
	await db.prepare(`INSERT INTO allowlist (handle, did) VALUES (?1, ?2)`).bind('invited.test', 'did:plc:inv').run();
	await db.prepare(`INSERT INTO allowlist (handle, did) VALUES (?1, NULL)`).bind('byhandle.test').run();
	await db
		.prepare(`INSERT INTO late_passes (handle, did, granted_at) VALUES (?1, NULL, ?2)`)
		.bind('latepass.test', '2026-10-01T00:00:00Z')
		.run();
	return db;
}

describe('canSee', () => {
	it('public sees only public', () => {
		expect(canSee('public', 'public')).toBe(true);
		expect(canSee('public', 'invited')).toBe(false);
		expect(canSee('public', 'hidden')).toBe(false);
	});
	it('invited sees public and invited, never hidden', () => {
		expect(canSee('invited', 'public')).toBe(true);
		expect(canSee('invited', 'invited')).toBe(true);
		expect(canSee('invited', 'hidden')).toBe(false);
	});
	it('organizer sees everything', () => {
		expect(canSee('organizer', 'hidden')).toBe(true);
	});
});

describe('isVisibility', () => {
	it('accepts only the three values', () => {
		expect(isVisibility('invited')).toBe(true);
		expect(isVisibility('everyone')).toBe(false);
	});
});

describe('viewerTier', () => {
	it('signed out is public', async () => {
		expect(await viewerTier(await seeded(), ORGANIZERS, null)).toBe('public');
	});
	it('organizer DIDs are organizers even without D1', async () => {
		expect(await viewerTier(undefined, ORGANIZERS, { did: 'did:plc:org2', handle: null })).toBe('organizer');
	});
	it('allowlisted by DID or handle is invited', async () => {
		const db = await seeded();
		expect(await viewerTier(db, ORGANIZERS, { did: 'did:plc:inv', handle: null })).toBe('invited');
		expect(await viewerTier(db, ORGANIZERS, { did: 'did:plc:new', handle: 'ByHandle.test' })).toBe('invited');
	});
	it('a late pass alone is invited', async () => {
		expect(await viewerTier(await seeded(), ORGANIZERS, { did: 'did:plc:lp', handle: 'latepass.test' })).toBe('invited');
	});
	it('signed in but not invited is public', async () => {
		expect(await viewerTier(await seeded(), ORGANIZERS, { did: 'did:plc:x', handle: 'stranger.test' })).toBe('public');
	});
	it('fails closed when D1 is missing or throws', async () => {
		expect(await viewerTier(undefined, ORGANIZERS, { did: 'did:plc:inv', handle: 'invited.test' })).toBe('public');
		const broken = { prepare: () => { throw new Error('d1 down'); } } as unknown as D1Database;
		expect(await viewerTier(broken, ORGANIZERS, { did: 'did:plc:inv', handle: 'invited.test' })).toBe('public');
	});
});

describe('pageTier', () => {
	it('non-organizers render as themselves and ignore ?as', () => {
		expect(pageTier('public', 'invited')).toBe('public');
		expect(pageTier('invited', 'public')).toBe('invited');
	});
	it('organizers render as invited unless ?as=public', () => {
		expect(pageTier('organizer', null)).toBe('invited');
		expect(pageTier('organizer', 'public')).toBe('public');
		expect(pageTier('organizer', 'invited')).toBe('invited');
		expect(pageTier('organizer', 'hidden')).toBe('invited');
	});
});
```

Before running: confirm the column names used above against the real schema — `grep -n "CREATE TABLE allowlist\|CREATE TABLE late_passes" -A8 migrations/*.sql`. If `late_passes` has no `granted_at` or different columns, adjust only the test's INSERT to match.

- [ ] **Step 5: Run it to verify it fails**

Run: `pnpm vitest run src/lib/server/site/tier.test.ts`
Expected: FAIL — cannot resolve `./tier`.

- [ ] **Step 6: Implement** — `src/lib/server/site/tier.ts`

```ts
import type { D1Database } from '@cloudflare/workers-types';
import { peekAllowlist } from '$lib/server/db';
import { hasLatePass, isOrganizer } from '$lib/server/organizer/admin';

export const VISIBILITIES = ['public', 'invited', 'hidden'] as const;
export type Visibility = (typeof VISIBILITIES)[number];
export type ViewerTier = 'public' | 'invited' | 'organizer';

export function isVisibility(value: string): value is Visibility {
	return (VISIBILITIES as readonly string[]).includes(value);
}

/** The single visibility rule. Hidden is organizer-only, everywhere. */
export function canSee(tier: ViewerTier, visibility: Visibility): boolean {
	if (visibility === 'public') return true;
	if (visibility === 'invited') return tier !== 'public';
	return tier === 'organizer';
}

/**
 * Who is looking. Organizers come from ORGANIZER_DIDS; "invited" means on
 * the allowlist (read-only peek — no DID pinning on a page view) or holding
 * a late pass. Unlike the courtesy gate on `/`, this fails CLOSED: the
 * invited tier unlocks the address, so any lookup error means public.
 */
export async function viewerTier(
	db: D1Database | undefined,
	organizerDids: string | undefined,
	who: { did: string; handle: string | null } | null
): Promise<ViewerTier> {
	if (!who) return 'public';
	if (isOrganizer(organizerDids, who.did)) return 'organizer';
	if (!db) return 'public';
	try {
		if (await peekAllowlist(db, who)) return 'invited';
		if (await hasLatePass(db, who)) return 'invited';
	} catch (e) {
		console.error('viewerTier lookup failed; treating as public', e);
	}
	return 'public';
}

/**
 * What `/` renders as. Organizers see the invited view by default (drafts
 * stay in the console) and may preview `?as=public` / `?as=invited`;
 * everyone else renders as their real tier and `?as` is ignored.
 */
export function pageTier(actual: ViewerTier, asParam: string | null): 'public' | 'invited' {
	if (actual !== 'organizer') return actual;
	return asParam === 'public' ? 'public' : 'invited';
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm vitest run src/lib/server/site/tier.test.ts`
Expected: PASS. If `peekAllowlist` returns true for the stranger, the allowlist table is empty in the test — the seed INSERTs failed; fix the INSERT columns (Step 4 note).

- [ ] **Step 8: Verify and commit**

Run: `pnpm check && pnpm test`

```bash
git add package.json pnpm-lock.yaml migrations/0010_site_content.sql src/lib/server/test/sqlite-d1.ts src/lib/server/site/tier.ts src/lib/server/site/tier.test.ts
git commit -m "feat(site): site content schema and fail-closed viewer tier"
```

---

### Task 3: sections

**Files:**
- Create: `src/lib/server/site/sections.ts`, `src/lib/server/site/sections.test.ts`

**Interfaces:**
- Consumes: `Visibility`, `isVisibility`, `canSee`, `ViewerTier` (Task 2); `sqliteD1` (Task 2, tests).
- Produces:
  - `interface Section { id: number; title: string; body: string; visibility: Visibility; position: number; updatedAt: string; updatedBy: string }`
  - `interface SectionInput { title: string; body: string; visibility: Visibility }`
  - `validateSection(raw: { title: unknown; body: unknown; visibility: unknown }): { ok: true; value: SectionInput } | { ok: false; error: string }`
  - `listSections(db): Promise<Section[]>` (position order)
  - `visibleTo(sections: Section[], tier: ViewerTier): Section[]`
  - `getSection(db, id: number): Promise<Section | null>`
  - `createSection(db, input: SectionInput, by: string): Promise<number>` (appended last)
  - `updateSection(db, id, input, by, expectedUpdatedAt: string): Promise<'ok' | 'conflict' | 'missing'>`
  - `moveSection(db, id, direction: 'up' | 'down'): Promise<boolean>`
  - `deleteSectionRow(db, id): Promise<boolean>` (photo rows/R2 handled by Task 4's `deleteSection`)

- [ ] **Step 1: Write the failing test** — `src/lib/server/site/sections.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { sqliteD1 } from '$lib/server/test/sqlite-d1';
import {
	createSection,
	deleteSectionRow,
	getSection,
	listSections,
	moveSection,
	updateSection,
	validateSection,
	visibleTo
} from './sections';

const BY = 'did:plc:org1';

describe('validateSection', () => {
	it('trims and accepts a valid section', () => {
		expect(validateSection({ title: '  Schedule ', body: 'Fri: arrive', visibility: 'invited' })).toEqual({
			ok: true,
			value: { title: 'Schedule', body: 'Fri: arrive', visibility: 'invited' }
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

	it('deletes a row', async () => {
		const db = sqliteD1();
		const [a] = await listSections(db);
		expect(await deleteSectionRow(db, a.id)).toBe(true);
		expect(await getSection(db, a.id)).toBeNull();
		expect(await deleteSectionRow(db, a.id)).toBe(false);
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/lib/server/site/sections.test.ts`
Expected: FAIL — cannot resolve `./sections`.

- [ ] **Step 3: Implement** — `src/lib/server/site/sections.ts`

```ts
import type { D1Database } from '@cloudflare/workers-types';
import { canSee, isVisibility, type ViewerTier, type Visibility } from './tier';

/** Retreat-site sections (migration 0010). All SQL parameterized. */

export interface Section {
	id: number;
	title: string;
	body: string;
	visibility: Visibility;
	position: number;
	updatedAt: string;
	updatedBy: string;
}

export interface SectionInput {
	title: string;
	body: string;
	visibility: Visibility;
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
		updatedBy: r.updated_by
	};
}

export function validateSection(raw: {
	title: unknown;
	body: unknown;
	visibility: unknown;
}): { ok: true; value: SectionInput } | { ok: false; error: string } {
	if (typeof raw.title !== 'string' || typeof raw.body !== 'string' || typeof raw.visibility !== 'string') {
		return { ok: false, error: 'Title, body and visibility are required' };
	}
	const title = raw.title.trim();
	const body = raw.body.replace(/\r\n/g, '\n').trimEnd();
	if (!title) return { ok: false, error: 'Give the section a title' };
	if (title.length > TITLE_MAX) return { ok: false, error: `Titles max out at ${TITLE_MAX} characters` };
	if (body.length > BODY_MAX) return { ok: false, error: `The body maxes out at ${BODY_MAX} characters` };
	if (!isVisibility(raw.visibility)) return { ok: false, error: 'Pick who can see this section' };
	return { ok: true, value: { title, body, visibility: raw.visibility } };
}

const COLUMNS = `id, title, body, visibility, position, updated_at, updated_by`;

export async function listSections(db: D1Database): Promise<Section[]> {
	const { results } = await db
		.prepare(`SELECT ${COLUMNS} FROM site_sections ORDER BY position, id`)
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
	const row = await db
		.prepare(
			`INSERT INTO site_sections (title, body, visibility, position, updated_at, updated_by)
			 VALUES (?1, ?2, ?3, (SELECT COALESCE(MAX(position), 0) + 1 FROM site_sections), ?4, ?5)
			 RETURNING id`
		)
		.bind(input.title, input.body, input.visibility, now, by)
		.first<{ id: number }>();
	if (!row) throw new Error('section insert returned no id');
	return row.id;
}

/**
 * Optimistic concurrency: the write only lands if `updated_at` is still what
 * the editor loaded. A miss is a conflict when the row exists, else missing.
 */
export async function updateSection(
	db: D1Database,
	id: number,
	input: SectionInput,
	by: string,
	expectedUpdatedAt: string
): Promise<'ok' | 'conflict' | 'missing'> {
	const now = new Date().toISOString();
	const res = await db
		.prepare(
			`UPDATE site_sections SET title = ?1, body = ?2, visibility = ?3, updated_at = ?4, updated_by = ?5
			 WHERE id = ?6 AND updated_at = ?7`
		)
		.bind(input.title, input.body, input.visibility, now, by, id, expectedUpdatedAt)
		.run();
	if ((res.meta.changes ?? 0) > 0) return 'ok';
	return (await getSection(db, id)) ? 'conflict' : 'missing';
}

/** Swap with the neighbour above/below. False at either end or if missing. */
export async function moveSection(db: D1Database, id: number, direction: 'up' | 'down'): Promise<boolean> {
	const list = await listSections(db);
	const i = list.findIndex((s) => s.id === id);
	const j = direction === 'up' ? i - 1 : i + 1;
	if (i < 0 || j < 0 || j >= list.length) return false;
	const a = list[i];
	const b = list[j];
	// Positions may collide after manual edits; renumber the pair by index.
	await db.batch([
		db.prepare(`UPDATE site_sections SET position = ?1 WHERE id = ?2`).bind(j + 1, a.id),
		db.prepare(`UPDATE site_sections SET position = ?1 WHERE id = ?2`).bind(i + 1, b.id)
	]);
	return true;
}

export async function deleteSectionRow(db: D1Database, id: number): Promise<boolean> {
	const res = await db.prepare(`DELETE FROM site_sections WHERE id = ?1`).bind(id).run();
	return (res.meta.changes ?? 0) > 0;
}
```

Note on the move test: renumbering by index assumes the list positions are 1..n; the seed is 1..6, so the swap test holds. If a later list has gaps, the swap still yields a correct relative order.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/lib/server/site/sections.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify and commit**

Run: `pnpm check && pnpm test`

```bash
git add src/lib/server/site/sections.ts src/lib/server/site/sections.test.ts
git commit -m "feat(site): section storage, validation, ordering, conflict check"
```

---

### Task 4: photos, R2 binding, photo route

**Files:**
- Modify: `src/app.d.ts`, `wrangler.jsonc`
- Create: `src/lib/server/site/photos.ts`, `src/lib/server/site/photos.test.ts`, `src/routes/media/site/[id]/+server.ts`

**Interfaces:**
- Consumes: Task 2 tier, Task 3 `getSection`, `deleteSectionRow`.
- Produces:
  - `const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const`, `PHOTO_MAX_BYTES = 8 * 1024 * 1024`
  - `interface Photo { id: string; sectionId: number; alt: string; width: number; height: number; contentType: PhotoType; position: number }`
  - `validatePhoto(file: { type: string; size: number }, width: unknown, height: unknown): { ok: true; contentType: PhotoType; width: number; height: number } | { ok: false; error: string }`
  - `addPhoto(db, bucket: R2Bucket, sectionId: number, file: Blob, meta: { contentType: PhotoType; width: number; height: number }): Promise<string>` → photo id
  - `photosFor(db, sectionIds: number[]): Promise<Map<number, Photo[]>>`
  - `setPhotoAlt(db, id, alt: string): Promise<boolean>` (alt trimmed, ≤ 300 chars)
  - `movePhoto(db, id, direction): Promise<boolean>`
  - `deletePhoto(db, bucket, id): Promise<boolean>`
  - `deleteSection(db, bucket, sectionId): Promise<boolean>` (photos rows + R2 objects, then the section)
  - `servePhoto(db, bucket, id: string, tier: ViewerTier): Promise<Response>` (404 unless visible)

- [ ] **Step 1: Bind R2** — `src/app.d.ts`: change the import line to include `R2Bucket`, and add the binding after `DB: D1Database;`

```ts
import type { CfProperties, D1Database, ExecutionContext, KVNamespace, R2Bucket } from '@cloudflare/workers-types';
```
```ts
				DB: D1Database;
				/** Retreat-site photos (private bucket; served via /media/site/[id]). Optional until provisioned. */
				SITE_MEDIA?: R2Bucket;
```

`wrangler.jsonc`: add after the `d1_databases` array (keep the trailing secrets comment):
```jsonc
	,
	"r2_buckets": [
		// Retreat-site photos. Private — no public bucket URL; the Worker
		// serves them at /media/site/[id] after a visibility check.
		{ "binding": "SITE_MEDIA", "bucket_name": "buildtreat-site-media" }
	]
```
(Place the comma so the JSONC stays valid: `"d1_databases": [ … ],` then `"r2_buckets": [ … ]`.)

- [ ] **Step 2: Write the failing test** — `src/lib/server/site/photos.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import { sqliteD1 } from '$lib/server/test/sqlite-d1';
import { createSection, getSection } from './sections';
import {
	addPhoto,
	deletePhoto,
	deleteSection,
	movePhoto,
	photosFor,
	servePhoto,
	setPhotoAlt,
	validatePhoto
} from './photos';

/** Map-backed R2 with the calls photos.ts makes. */
function fakeR2() {
	const objects = new Map<string, { bytes: Uint8Array; type: string }>();
	const bucket = {
		put: async (key: string, value: Blob, opts?: { httpMetadata?: { contentType?: string } }) => {
			objects.set(key, { bytes: new Uint8Array(await value.arrayBuffer()), type: opts?.httpMetadata?.contentType ?? '' });
			return {};
		},
		get: async (key: string) => {
			const o = objects.get(key);
			return o ? { body: new Blob([o.bytes]).stream(), httpMetadata: { contentType: o.type } } : null;
		},
		delete: async (keys: string | string[]) => {
			for (const k of Array.isArray(keys) ? keys : [keys]) objects.delete(k);
		}
	};
	return { bucket: bucket as unknown as R2Bucket, objects };
}

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

	it('removes the R2 object if the row insert fails', async () => {
		const { bucket, objects } = fakeR2();
		await expect(addPhoto(sqliteD1(), bucket, 9999, blob(), JPEG)).rejects.toThrow();
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
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm vitest run src/lib/server/site/photos.test.ts`
Expected: FAIL — cannot resolve `./photos`.

- [ ] **Step 4: Implement** — `src/lib/server/site/photos.ts`

```ts
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

const isPhotoType = (t: string): t is PhotoType => (PHOTO_TYPES as readonly string[]).includes(t);

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

export async function addPhoto(
	db: D1Database,
	bucket: R2Bucket,
	sectionId: number,
	file: Blob,
	meta: { contentType: PhotoType; width: number; height: number }
): Promise<string> {
	const id = crypto.randomUUID();
	await bucket.put(id, file, { httpMetadata: { contentType: meta.contentType } });
	try {
		await db
			.prepare(
				`INSERT INTO site_photos (id, section_id, alt, width, height, content_type, position, created_at)
				 SELECT ?1, s.id, '', ?3, ?4, ?5,
				        (SELECT COALESCE(MAX(position), 0) + 1 FROM site_photos WHERE section_id = ?2), ?6
				 FROM site_sections s WHERE s.id = ?2`
			)
			.bind(id, sectionId, meta.width, meta.height, meta.contentType, new Date().toISOString())
			.run()
			.then((r) => {
				if ((r.meta.changes ?? 0) === 0) throw new Error('unknown section');
			});
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
	await db.batch([
		db.prepare(`UPDATE site_photos SET position = ?1 WHERE id = ?2`).bind(j + 1, list[i].id),
		db.prepare(`UPDATE site_photos SET position = ?1 WHERE id = ?2`).bind(i + 1, list[j].id)
	]);
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run src/lib/server/site/photos.test.ts`
Expected: PASS. `json_each` is built into SQLite and D1; if node:sqlite lacks JSON1, the test errors on `json_each` — then replace the IN clause with a bound list built from placeholders `?2, ?3, …` generated from `sectionIds.map((_, i) => '?' + (i + 2))` (still parameterized).

- [ ] **Step 6: Photo route** — `src/routes/media/site/[id]/+server.ts`

```ts
import type { RequestHandler } from './$types';
import { loadBskyProfile } from '@svelte-atproto/oauth/bsky';
import { cloudflareKV } from '@svelte-atproto/oauth/server/stores/cloudflare';
import { viewerTier } from '$lib/server/site/tier';
import { servePhoto } from '$lib/server/site/photos';

const ID_RE = /^[0-9a-f-]{36}$/;

/** Retreat-site photo bytes, gated by the parent section's visibility. */
export const GET: RequestHandler = async ({ params, locals, platform }) => {
	const db = platform?.env?.DB;
	const bucket = platform?.env?.SITE_MEDIA;
	if (!db || !bucket || !ID_RE.test(params.id)) return new Response('Not found', { status: 404 });
	let handle: string | null = null;
	if (locals.did) {
		const cache = platform.env.PROFILE_CACHE ? cloudflareKV(platform.env.PROFILE_CACHE, { ttl: 3600 }) : undefined;
		handle = (await loadBskyProfile(locals.did, { cache }).catch(() => undefined))?.handle ?? null;
	}
	const tier = await viewerTier(db, platform.env.ORGANIZER_DIDS, locals.did ? { did: locals.did, handle } : null);
	return servePhoto(db, bucket, params.id, tier);
};
```

- [ ] **Step 7: Verify and commit**

Run: `pnpm check && pnpm test && pnpm build`
Expected: green.

```bash
git add src/app.d.ts wrangler.jsonc src/lib/server/site/photos.ts src/lib/server/site/photos.test.ts "src/routes/media/site/[id]/+server.ts"
git commit -m "feat(site): photo storage in R2 and the visibility-checked photo route"
```

---

### Task 5: home data loader + wiring into `/`

**Files:**
- Create: `src/lib/server/site/page.ts`, `src/lib/server/site/page.test.ts`
- Modify: `src/routes/+page.server.ts`, `src/lib/content.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  - `interface SitePhotoView { id: string; alt: string; width: number; height: number; src: string }` (`src = /media/site/{id}`)
  - `interface SiteSectionView { id: number; title: string; html: string; visibility: 'public' | 'invited'; photos: SitePhotoView[] }`
  - `interface SiteData { tier: 'public' | 'invited'; organizer: boolean; sections: SiteSectionView[]; unavailable: boolean; preview: { title: string; description: string; image: string } }`
  - `loadSite(input: { db: D1Database | undefined; organizerDids: string | undefined; origin: string; who: { did: string; handle: string | null } | null; asParam: string | null }): Promise<SiteData>`
  - `/` load returns gain `site: SiteData` and `registerMode: boolean` on every path.

- [ ] **Step 1: Write the failing test** — `src/lib/server/site/page.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import { sqliteD1 } from '$lib/server/test/sqlite-d1';
import { createSection } from './sections';
import { loadSite } from './page';

const ORIGIN = 'https://buildersretre.at';
const ORGS = 'did:plc:org1';

async function db(): Promise<D1Database> {
	const d = sqliteD1();
	await d.prepare(`INSERT INTO allowlist (handle, did) VALUES ('invited.test', 'did:plc:inv')`).run();
	await createSection(d, { title: 'The house', body: 'Address: **secret**', visibility: 'invited' }, ORGS);
	return d;
}
const base = { organizerDids: ORGS, origin: ORIGIN, asParam: null };

describe('loadSite', () => {
	it('public viewers get public sections only, rendered', async () => {
		const site = await loadSite({ ...base, db: await db(), who: null });
		expect(site.tier).toBe('public');
		expect(site.sections.map((s) => s.title)).toEqual(['The retreat', "Who's organizing"]);
		expect(site.sections[0].html).toContain('<p>');
		expect(JSON.stringify(site)).not.toContain('secret');
	});

	it('invited viewers also get invited sections, never hidden drafts', async () => {
		const site = await loadSite({ ...base, db: await db(), who: { did: 'did:plc:inv', handle: null } });
		expect(site.tier).toBe('invited');
		expect(site.sections.map((s) => s.title)).toContain('The house');
		expect(site.sections.some((s) => s.title === 'Schedule')).toBe(false);
	});

	it('organizers render invited by default and public with ?as=public', async () => {
		const d = await db();
		const asInvited = await loadSite({ ...base, db: d, who: { did: 'did:plc:org1', handle: null } });
		expect(asInvited).toMatchObject({ tier: 'invited', organizer: true });
		const asPublic = await loadSite({ ...base, db: d, asParam: 'public', who: { did: 'did:plc:org1', handle: null } });
		expect(asPublic.tier).toBe('public');
		expect(JSON.stringify(asPublic)).not.toContain('secret');
	});

	it('link preview uses public content only, with an absolute image url', async () => {
		const site = await loadSite({ ...base, db: await db(), who: { did: 'did:plc:inv', handle: null } });
		expect(site.preview.description).toContain('December 4–7, 2026');
		expect(site.preview.description).not.toContain('secret');
		expect(site.preview.image).toBe(`${ORIGIN}/media/hero-landscape.png`);
	});

	it('a failed read degrades to unavailable, not a throw', async () => {
		const broken = { prepare: () => { throw new Error('down'); } } as unknown as D1Database;
		const site = await loadSite({ ...base, db: broken, who: null });
		expect(site).toMatchObject({ unavailable: true, sections: [] });
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/lib/server/site/page.test.ts`
Expected: FAIL — cannot resolve `./page`.

- [ ] **Step 3: Implement** — `src/lib/server/site/page.ts`

```ts
import type { D1Database } from '@cloudflare/workers-types';
import { renderMarkdown } from '$lib/markdown/render';
import { retreat, siteHome } from '$lib/content';
import { pageTier, viewerTier } from './tier';
import { listSections, visibleTo, type Section } from './sections';
import { photosFor } from './photos';

export interface SitePhotoView {
	id: string;
	alt: string;
	width: number;
	height: number;
	src: string;
}

export interface SiteSectionView {
	id: number;
	title: string;
	html: string;
	visibility: 'public' | 'invited';
	photos: SitePhotoView[];
}

export interface SiteData {
	tier: 'public' | 'invited';
	/** True for organizers — the page shows "Edit retreat info" and preview links. */
	organizer: boolean;
	sections: SiteSectionView[];
	/** The section read failed: render hero + strip + a quiet "more soon". */
	unavailable: boolean;
	/** Link-preview tags, built from public content only. */
	preview: { title: string; description: string; image: string };
}

const plain = (markdown: string) =>
	markdown
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
		.replace(/[*_#>`]/g, '')
		.replace(/\s+/g, ' ')
		.trim();

function previewFrom(publicSections: Section[], origin: string): SiteData['preview'] {
	const first = publicSections.find((s) => s.body.trim());
	const description = (first ? plain(first.body) : siteHome.fallbackDescription).slice(0, 200);
	return { title: retreat.name, description, image: `${origin}/media/hero-landscape.png` };
}

export async function loadSite(input: {
	db: D1Database | undefined;
	organizerDids: string | undefined;
	origin: string;
	who: { did: string; handle: string | null } | null;
	asParam: string | null;
}): Promise<SiteData> {
	const actual = await viewerTier(input.db, input.organizerDids, input.who);
	const tier = pageTier(actual, input.asParam);
	const organizer = actual === 'organizer';
	const empty = { title: retreat.name, description: siteHome.fallbackDescription, image: `${input.origin}/media/hero-landscape.png` };
	if (!input.db) return { tier, organizer, sections: [], unavailable: true, preview: empty };
	try {
		const all = await listSections(input.db);
		const shown = visibleTo(all, tier);
		const photos = await photosFor(input.db, shown.map((s) => s.id));
		return {
			tier,
			organizer,
			unavailable: false,
			preview: previewFrom(visibleTo(all, 'public'), input.origin),
			sections: shown.map((s) => ({
				id: s.id,
				title: s.title,
				html: renderMarkdown(s.body),
				visibility: s.visibility === 'public' ? 'public' : 'invited',
				photos: (photos.get(s.id) ?? [])
					.filter((p) => p.alt)
					.map((p) => ({ id: p.id, alt: p.alt, width: p.width, height: p.height, src: `/media/site/${p.id}` }))
			}))
		};
	} catch (e) {
		console.error('site sections load failed', e);
		return { tier, organizer, sections: [], unavailable: true, preview: empty };
	}
}
```

- [ ] **Step 4: Content** — `src/lib/content.ts`

Change the public "Where" fact and add home copy. In `retreat.facts` replace
`{ label: 'Where', value: 'Palm Springs or Coachella Valley' },` with
`{ label: 'Where', value: 'Near Palm Springs, California' },`.

In `retreatLocation` replace `display: 'Palm Springs',` with `display: 'Near Palm Springs',`.

In `registration.facts` replace the first two entries with:
```ts
		{ label: 'Near Palm Springs, California', value: '' },
		{ label: 'The house is booked — details on the retreat page', value: '', muted: true },
```

Append after `retreatLocation`:
```ts
/** Copy for the retreat home `/`. Facts come from PRODUCT.md / the spec. */
export const siteHome = {
	fallbackDescription: 'Three nights and two full days with the builders of the Atmosphere — December 4–7, 2026, near Palm Springs.',
	moreSoon: 'More details soon.',
	registerCta: 'Register',
	registeredLine: 'You’re registered',
	editDetails: 'Edit details',
	declinedLine: 'You said you can’t make it',
	changeAnswer: 'Change that',
	closedLine: 'Registration has closed — message Bryan if you still want to come.',
	invitedOnlyLabel: 'For invited builders',
	editInfo: 'Edit retreat info',
	backHome: '← Retreat home'
} as const;
```

- [ ] **Step 5: Wire `/` load** — `src/routes/+page.server.ts`

Add imports:
```ts
import { loadSite } from '$lib/server/site/page';
```

In `load`, right after `const knownUser = readKnownUser(cookies.get(KNOWN_COOKIE));` add:
```ts
	const registerMode = url.searchParams.has('register');
	const origin = platform?.env?.ORIGIN ?? url.origin;
	const siteFor = (who: { did: string; handle: string | null } | null) =>
		loadSite({ db, organizerDids: platform?.env?.ORGANIZER_DIDS, origin, who, asParam: url.searchParams.get('as') });
```

Add to each of the three `return { … }` objects:
- dev preview return: `site: await siteFor({ did: 'did:plc:preview', handle: 'preview.bsky.social' }), registerMode,`
- signed-out return: `site: await siteFor(null), registerMode,`
- signed-in return (end of load): `site: await siteFor({ did: locals.did, handle: user.handle }), registerMode,`

Change `registrationMode: allowed && !wantsSurvey,` to `registrationMode: allowed,` and delete the `wantsSurvey` constant and its comment (the survey feed no longer renders).

- [ ] **Step 6: Run tests and checks**

Run: `pnpm vitest run src/lib/server/site/page.test.ts && pnpm check && pnpm test`
Expected: PASS; check 0/0. (`+page.svelte` still compiles: it ignores the new fields until Task 7.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/site/page.ts src/lib/server/site/page.test.ts src/routes/+page.server.ts src/lib/content.ts
git commit -m "feat(site): load visible sections for / with server-side tier filtering"
```

---

### Task 6: impeccable — retreat home direction (Bryan picks a comp)

**Files:** `.impeccable/surfaces/src-routes-page-svelte.md` (update), `.impeccable/mocks/home-*.png` (new comps)

This is a design gate, not code. Use the **impeccable** skill.

- [ ] **Step 1:** Run `/impeccable` on `/` as a **redesign of an existing surface**: the full-bleed snap feed becomes a long scrolling retreat home. Inputs to the brief: `DESIGN.md` ("The Dusk Feed" tokens and rules — ground `#0b0908`, white ink at opacity steps, Big Shoulders/Hanken Grotesk, hairline ledgers, white pill for real actions, no cards/shadows/second color) and the spec amendment's **two views** (structure from Tasks 7, 9a, 9b):
  - **Public — storytelling only:** hero → public story sections (the 2 seed sections) → **Who's coming** (6–8 attendee cards: avatar, Bluesky name, linked handle, one-line "what I'm building" blurb; include one card with no avatar) → **Posts** (newest first: one organizer update with a photo, two natively rendered Bluesky posts — one text-only with a link, one with 2 image thumbnails — each with author, date, "View on Bluesky") → footer. Also a signed-in-but-not-invited variant with the invite-only strip + waitlist under the hero. Venue rule: region only ("near Palm Springs") — no town, house name or house photos.
  - **Invited — logistics first:** compact hero → status strip ("Register by Sep 20", or "You're registered · edit details") → invited sections (the house with 3 photos, a schedule list, getting there, what to bring) → then the public story continues below (story sections, Who's coming, Posts). House photos come from the venue's own website and appear only in invited comps (kept in the gitignored .impeccable/mocks/private/).
- [ ] **Step 2:** Generate 3 comps per impeccable's process (`.impeccable/mocks/home-a.png` … `home-c.png`), each showing both views (public and invited) at desktop and 393 px.
- [ ] **Step 3:** Show Bryan the comps and **wait for his pick**. Record the choice and its seed in `.impeccable/surfaces/src-routes-page-svelte.md`.
- [ ] **Step 4:** Commit:
```bash
git add .impeccable/surfaces/src-routes-page-svelte.md .impeccable/mocks/home-a.png .impeccable/mocks/home-a.png.json .impeccable/mocks/home-b.png .impeccable/mocks/home-b.png.json .impeccable/mocks/home-c.png .impeccable/mocks/home-c.png.json
git commit -m "design(site): retreat home direction and comps"
```
(Stage only the comp files that exist.)

---

### Task 7: retreat home UI

**Files:**
- Create: `src/lib/site/RetreatHome.svelte`, `src/lib/site/StatusStrip.svelte`, `src/lib/site/SiteSection.svelte`, `src/lib/site/PhotoGallery.svelte`, `src/lib/site/AGENTS.md`, `src/lib/site/CLAUDE.md`
- Modify: `src/routes/+page.svelte`, `src/lib/registration/RegistrationFlow.svelte`

**Interfaces:**
- Consumes: `SiteData`, `SiteSectionView`, `SitePhotoView` (Task 5, `import type`); `siteHome`, `retreat` from `$lib/content`; existing `SignInSheet`.
- Produces: `RetreatHome` props `{ data: PageData; form: ActionData; onsignin: () => void }`.

Structure and behavior are fixed here; visual styling follows the comp Bryan picked in Task 6 using existing `app.css` tokens and the five global classes. The code below is the functional baseline — the comp refines spacing, type scale and gallery layout only.

- [ ] **Step 1: `src/lib/site/PhotoGallery.svelte`**

```svelte
<script lang="ts">
	import type { SitePhotoView } from '$lib/server/site/page';

	let { photos }: { photos: SitePhotoView[] } = $props();
</script>

{#if photos.length}
	<ul class="gallery" class:single={photos.length === 1}>
		{#each photos as p (p.id)}
			<li>
				<img src={p.src} alt={p.alt} width={p.width} height={p.height} loading="lazy" decoding="async" />
			</li>
		{/each}
	</ul>
{/if}

<style>
	.gallery {
		list-style: none;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 16rem), 1fr));
		gap: var(--space-2);
	}
	.gallery.single {
		grid-template-columns: 1fr;
	}
	img {
		display: block;
		width: 100%;
		height: auto;
		border-radius: 4px;
	}
</style>
```

- [ ] **Step 2: `src/lib/site/SiteSection.svelte`**

```svelte
<script lang="ts">
	import type { SiteSectionView } from '$lib/server/site/page';
	import { siteHome } from '$lib/content';
	import PhotoGallery from '$lib/site/PhotoGallery.svelte';

	let { section }: { section: SiteSectionView } = $props();
</script>

<section class="site-section" aria-labelledby={`s-${section.id}`}>
	{#if section.visibility === 'invited'}
		<p class="kicker invited-label">{siteHome.invitedOnlyLabel}</p>
	{/if}
	<h2 class="display section-title" id={`s-${section.id}`}>{section.title}</h2>
	<!-- Rendered by markdown-it with html:false on the server; safe to inject. -->
	<div class="prose">{@html section.html}</div>
	<PhotoGallery photos={section.photos} />
</section>

<style>
	.site-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-5) 0;
		border-top: var(--hairline);
	}
	.invited-label {
		color: var(--ink-70);
	}
	.section-title {
		font-size: clamp(1.6rem, 5vw, 2.4rem);
	}
	.prose {
		max-width: 62ch;
		color: var(--ink-70);
		line-height: 1.6;
	}
	.prose :global(h2),
	.prose :global(h3) {
		color: var(--ink);
		margin: var(--space-3) 0 var(--space-1);
	}
	.prose :global(a) {
		color: var(--ink);
		text-decoration: underline;
	}
	.prose :global(ul),
	.prose :global(ol) {
		padding-left: 1.4rem;
	}
	.prose :global(p + p) {
		margin-top: var(--space-2);
	}
</style>
```

- [ ] **Step 3: `src/lib/site/StatusStrip.svelte`**

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import { siteHome } from '$lib/content';

	let {
		signedIn,
		invited,
		handle,
		registrationStatus,
		regClosed,
		regDeadlineDisplay,
		waitlistState,
		waitlistError
	}: {
		signedIn: boolean;
		invited: boolean;
		handle: string | null;
		registrationStatus: 'confirmed' | 'declined' | null;
		regClosed: boolean;
		regDeadlineDisplay: string | null;
		waitlistState: 'none' | 'member';
		waitlistError: string | null;
	} = $props();
</script>

{#if signedIn}
	<div class="strip" role="status">
		{#if !invited}
			<p>Signed in as @{handle ?? 'you'} — this retreat is invite-only.</p>
			{#if waitlistState === 'member'}
				<p class="sub">You’re on the waitlist.</p>
			{:else}
				<form method="POST" action="?/joinWaitlist" use:enhance class="waitlist">
					<label class="visually-hidden" for="wl-email">Email</label>
					<input id="wl-email" name="email" type="email" required placeholder="you@example.com" />
					<button class="pill">Join the waitlist</button>
				</form>
				{#if waitlistError}<p class="sub" role="alert">{waitlistError}</p>{/if}
			{/if}
		{:else if registrationStatus === 'confirmed'}
			<p>{siteHome.registeredLine}</p>
			<a class="quiet" href="/?register">{siteHome.editDetails} →</a>
		{:else if registrationStatus === 'declined'}
			<p>{siteHome.declinedLine}</p>
			<a class="quiet" href="/?register">{siteHome.changeAnswer} →</a>
		{:else if regClosed}
			<p>{siteHome.closedLine}</p>
		{:else}
			<p>{regDeadlineDisplay ? `Register by ${regDeadlineDisplay}` : 'Registration is open for you'}</p>
			<a class="pill" href="/?register">{siteHome.registerCta}</a>
		{/if}
	</div>
{/if}

<style>
	.strip {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2) var(--space-3);
		padding: var(--space-3) 0;
		border-top: 1px solid var(--ink);
		border-bottom: 1px solid var(--ink);
	}
	.sub {
		color: var(--ink-70);
		font-size: 0.875rem;
	}
	.quiet {
		color: var(--ink);
	}
	.waitlist {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.waitlist input {
		background: transparent;
		border: none;
		border-bottom: 1px solid var(--ink-45);
		color: var(--ink);
		font: inherit;
		padding: 0.45rem 0;
	}
	.pill {
		width: auto;
	}
</style>
```

The waitlist lines are short UI strings; if the `waitlist` export in `content.ts` already has equivalent copy (`grep -n -A12 "export const waitlist" src/lib/content.ts`), use those keys instead of the literals.

- [ ] **Step 4: `src/lib/site/RetreatHome.svelte`**

```svelte
<script lang="ts">
	import type { ActionData, PageData } from '../../routes/$types';
	import { retreat, retreatDates, retreatLocation, siteHome } from '$lib/content';
	import StatusStrip from '$lib/site/StatusStrip.svelte';
	import SiteSection from '$lib/site/SiteSection.svelte';

	let { data, form, onsignin }: { data: PageData; form: ActionData; onsignin: () => void } = $props();

	const site = $derived(data.site);
	const waitlistError = $derived(form && 'waitlistError' in form ? (form.waitlistError as string) : null);
	const reg = $derived(data.registration);
	const status = $derived<'confirmed' | 'declined' | null>(
		reg?.status === 'confirmed' && reg.agreedAt !== null ? 'confirmed' : reg?.status === 'declined' ? 'declined' : null
	);
</script>

<svelte:head>
	<title>{retreat.name}</title>
	<meta name="description" content={site.preview.description} />
	<meta property="og:title" content={site.preview.title} />
	<meta property="og:description" content={site.preview.description} />
	<meta property="og:image" content={site.preview.image} />
	<meta property="og:type" content="website" />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<main class="home">
	<header class="hero">
		<p class="kicker">{retreat.kicker}</p>
		<h1 class="display hero-title">{retreat.nameLines[0]}<br />{retreat.nameLines[1]}</h1>
		<p class="hero-facts">{retreatDates.display} · {retreatLocation.display}</p>
		{#if !data.user}
			<button class="pill" onclick={onsignin}>{retreat.signIn}</button>
		{/if}
		{#if site.organizer}
			<p class="organizer-tools">
				<a href="/organizer/retreat">{siteHome.editInfo}</a> ·
				<a href="/?as=public">view as public</a> ·
				<a href="/">view as invited</a>
			</p>
		{/if}
	</header>

	<StatusStrip
		signedIn={data.user !== null}
		invited={site.tier === 'invited' && data.allowed}
		handle={data.user?.handle ?? null}
		registrationStatus={status}
		regClosed={data.regClosed}
		regDeadlineDisplay={data.regDeadlineDisplay}
		waitlistState={data.waitlistState}
		{waitlistError}
	/>

	{#each site.sections as section (section.id)}
		<SiteSection {section} />
	{/each}
	{#if site.unavailable}
		<p class="more-soon">{siteHome.moreSoon}</p>
	{/if}

	<footer class="footer">
		{retreat.organizerLead} (<a href={retreat.organizerLink}>@{retreat.organizerHandle}</a>) {retreat.organizerTail}
	</footer>
</main>

<style>
	.home {
		max-width: 56rem;
		margin: 0 auto;
		padding: var(--space-5) var(--space-3) var(--space-5);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.hero {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding-bottom: var(--space-4);
	}
	.hero-title {
		font-size: clamp(2.6rem, 11vw, 6rem);
		line-height: 0.95;
	}
	.hero-facts {
		color: var(--ink-70);
	}
	.organizer-tools {
		font-size: 0.8125rem;
		color: var(--ink-70);
	}
	.organizer-tools a,
	.footer a {
		color: var(--ink);
	}
	.more-soon {
		color: var(--ink-70);
		padding: var(--space-4) 0;
		border-top: var(--hairline);
	}
	.footer {
		margin-top: var(--space-5);
		padding-top: var(--space-3);
		border-top: var(--hairline);
		font-size: 0.8125rem;
		color: var(--ink-70);
	}
</style>
```

Note: `invited` uses both the tier (fails closed) and `data.allowed`; an organizer who is not on the allowlist still gets the invited view of sections but the strip treats them per `data.allowed` — correct, since registration is gated by the allowlist.

- [ ] **Step 5: `src/routes/+page.svelte`** — replace the whole file

```svelte
<script lang="ts">
	import RegistrationFlow from '$lib/registration/RegistrationFlow.svelte';
	import RetreatHome from '$lib/site/RetreatHome.svelte';
	import SignInSheet from '$lib/auth/SignInSheet.svelte';

	let { data, form } = $props();

	let sheetOpen = $state(false);
</script>

{#if data.registerMode && data.registrationMode}
	<RegistrationFlow {data} {form} />
{:else}
	<div inert={sheetOpen}>
		<RetreatHome {data} {form} onsignin={() => (sheetOpen = true)} />
	</div>
	<SignInSheet bind:open={sheetOpen} error={data.authError} knownUser={data.knownUser} />
{/if}
```

(`bind:open` on `SignInSheet` is pre-existing and this page sets no `<title>` in that branch's parent scope beyond `RetreatHome`'s own head — verify in Step 8 that the served `<title>` is the retreat name. If it is not, switch `SignInSheet` to `open={sheetOpen} onclose={() => (sheetOpen = false)}` only if the component already supports an `onclose` prop; check its props first.)

- [ ] **Step 6: `src/lib/registration/RegistrationFlow.svelte`**

Remove the survey link: in the `<AnnouncementItem … />` props delete `surveyHref="/?survey"` and `surveyLabel={copy.surveyLink}`. If `copy` (`registration`) is now unused in the file, delete its import.

Add a back link as the first child of every branch: insert directly after `{#if mode === 'announce'}`, `{:else if mode === 'form'}`, and `{:else}`:
```svelte
	<a class="back-home" href="/">{siteHome.backHome}</a>
```
Add `import { siteHome } from '$lib/content';` and the style:
```css
	.back-home {
		position: fixed;
		top: var(--space-3);
		left: var(--space-3);
		z-index: 5;
		font-size: 0.8125rem;
		color: var(--ink);
	}
```

- [ ] **Step 7: Folder docs** — `src/lib/site/CLAUDE.md` = `@AGENTS.md`; `src/lib/site/AGENTS.md`:

```markdown
# src/lib/site — the retreat home and its console

Client components for `/` (the retreat home) and `/organizer/retreat` (the
editor, under `console/`). Data arrives already filtered and rendered from
`lib/server/site/` — these components never decide visibility.

| File | Role |
|---|---|
| `RetreatHome.svelte` | Page shell for `/`: head/link-preview tags, hero, status strip, sections, footer. |
| `StatusStrip.svelte` | Signed-in state: register / registered / declined / closed / not invited (+ waitlist). |
| `SiteSection.svelte` | One section: invited label, title, server-rendered markdown (`{@html}` — safe because markdown-it runs with `html: false`), photos. |
| `PhotoGallery.svelte` | Photos for a section; `src` is `/media/site/{id}`, which re-checks visibility. |
| `console/` | Editor components — see the files' headers. |

## Boundaries

- Never filter or hide sections here; the server sends only what the viewer may see.
- `{@html}` only for `section.html` from `loadSite` (or `renderMarkdown` in the console preview).
- No `bind:` on component props (SSR `<title>` issue — see `lib/organizer/AGENTS.md`).
- The town, address and house never appear in public copy; public text comes from sections.

## Verify

`pnpm check`; `pnpm dev`, then `/`, `/?as=public` and `/?as=invited` as an organizer, at 1440 and 393 px.
```

- [ ] **Step 8: Verify in the browser**

Run: `pnpm check && pnpm test && pnpm build`, then `pnpm dev --host 127.0.0.1` and:
- `curl -s http://127.0.0.1:5173/ | grep -o '<title>[^<]*</title>'` → the retreat name.
- `curl -s http://127.0.0.1:5173/ | grep -c 'For invited builders'` → `0` (signed out sees no invited sections).
- Screenshots: `PLAYWRIGHT_BROWSERS_PATH=$PWD/.playwright-browsers node scripts/shot.mjs http://127.0.0.1:5173/ /tmp/home-1440.png 1440 900 full` and the same at `393 852`. Compare against the chosen comp.

- [ ] **Step 9: Apply the comp** — with the **impeccable** skill, refine the four components' styles to match the comp from Task 6 (tokens only, no new colors). Re-run Step 8.

- [ ] **Step 10: Commit**

```bash
git add src/lib/site/RetreatHome.svelte src/lib/site/StatusStrip.svelte src/lib/site/SiteSection.svelte src/lib/site/PhotoGallery.svelte src/lib/site/AGENTS.md src/lib/site/CLAUDE.md src/routes/+page.svelte src/lib/registration/RegistrationFlow.svelte src/lib/content.ts
git commit -m "feat(site): retreat home at /, registration flow at /?register"
```

---

### Task 8: console server — `/organizer/retreat`

**Files:**
- Create: `src/routes/organizer/retreat/+page.server.ts`

**Interfaces:**
- Consumes: Tasks 2–4; `requireOrganizer` pattern from `src/routes/organizer/registrations/[did]/+page.server.ts` (signed out → redirect `/organizer`, non-organizer → 404).
- Produces: `load` → `{ sections: Array<Section & { photos: Photo[] }>; mediaConfigured: boolean }`; actions `create`, `save`, `move`, `delete`, `upload`, `photoAlt`, `photoMove`, `photoDelete`. Every failure returns `fail(status, { message, sectionId? })`; successes return `{ message, sectionId? }`.

- [ ] **Step 1: Implement** — `src/routes/organizer/retreat/+page.server.ts`

```ts
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { isOrganizer } from '$lib/server/organizer/admin';
import {
	createSection,
	listSections,
	moveSection,
	updateSection,
	validateSection
} from '$lib/server/site/sections';
import {
	addPhoto,
	deletePhoto,
	deleteSection,
	deleteSectionWithoutMedia,
	movePhoto,
	photosFor,
	setPhotoAlt,
	validatePhoto
} from '$lib/server/site/photos';

/**
 * /organizer/retreat — edit the retreat home's sections and photos. Same
 * access policy as /organizer: signed out → the gate, non-organizer → 404.
 */
function requireOrganizer(locals: App.Locals, platform: App.Platform | undefined): string {
	if (!locals.did) redirect(303, '/organizer');
	if (!isOrganizer(platform?.env?.ORGANIZER_DIDS, locals.did)) error(404, { message: 'Not found' });
	return locals.did;
}

const sectionId = (form: FormData) => {
	const n = Number(form.get('id'));
	return Number.isInteger(n) && n > 0 ? n : null;
};
const direction = (form: FormData) => (form.get('direction') === 'up' ? 'up' : form.get('direction') === 'down' ? 'down' : null);

export const load: PageServerLoad = async ({ locals, platform }) => {
	requireOrganizer(locals, platform);
	const db = platform?.env?.DB;
	if (!db) error(503, { message: 'Storage is not available right now' });
	const sections = await listSections(db);
	const photos = await photosFor(db, sections.map((s) => s.id));
	return {
		sections: sections.map((s) => ({ ...s, photos: photos.get(s.id) ?? [] })),
		mediaConfigured: Boolean(platform?.env?.SITE_MEDIA)
	};
};

export const actions: Actions = {
	create: async ({ locals, platform }) => {
		const by = requireOrganizer(locals, platform);
		const db = platform?.env?.DB;
		if (!db) return fail(503, { message: 'Storage is not available right now' });
		const id = await createSection(db, { title: 'New section', body: '', visibility: 'hidden' }, by);
		return { message: 'Section added (hidden until you change who can see it)', sectionId: id };
	},

	save: async ({ locals, platform, request }) => {
		const by = requireOrganizer(locals, platform);
		const db = platform?.env?.DB;
		if (!db) return fail(503, { message: 'Storage is not available right now' });
		const form = await request.formData();
		const id = sectionId(form);
		if (!id) return fail(400, { message: 'Missing section' });
		const checked = validateSection({ title: form.get('title'), body: form.get('body'), visibility: form.get('visibility') });
		if (!checked.ok) return fail(400, { message: checked.error, sectionId: id });
		const result = await updateSection(db, id, checked.value, by, String(form.get('updatedAt') ?? ''));
		if (result === 'conflict') return fail(409, { message: 'Changed elsewhere — reload first', sectionId: id });
		if (result === 'missing') return fail(404, { message: 'That section no longer exists' });
		return { message: 'Saved', sectionId: id };
	},

	move: async ({ locals, platform, request }) => {
		requireOrganizer(locals, platform);
		const db = platform?.env?.DB;
		if (!db) return fail(503, { message: 'Storage is not available right now' });
		const form = await request.formData();
		const id = sectionId(form);
		const dir = direction(form);
		if (!id || !dir) return fail(400, { message: 'Missing section or direction' });
		await moveSection(db, id, dir);
		return { sectionId: id };
	},

	delete: async ({ locals, platform, request }) => {
		requireOrganizer(locals, platform);
		const db = platform?.env?.DB;
		const bucket = platform?.env?.SITE_MEDIA;
		if (!db) return fail(503, { message: 'Storage is not available right now' });
		const id = sectionId(await request.formData());
		if (!id) return fail(400, { message: 'Missing section' });
		if (!bucket) {
			// Without R2 a section can only go if it has no photos to clean up.
			const r = await deleteSectionWithoutMedia(db, id);
			if (r === 'has-photos') {
				return fail(503, { message: 'Photo storage is unavailable — can’t delete a section with photos yet', sectionId: id });
			}
			if (!r) return fail(404, { message: 'That section no longer exists' });
			return { message: 'Section deleted' };
		}
		if (!(await deleteSection(db, bucket, id))) return fail(404, { message: 'That section no longer exists' });
		return { message: 'Section deleted' };
	},

	upload: async ({ locals, platform, request }) => {
		requireOrganizer(locals, platform);
		const db = platform?.env?.DB;
		const bucket = platform?.env?.SITE_MEDIA;
		if (!db) return fail(503, { message: 'Storage is not available right now' });
		if (!bucket) return fail(503, { message: 'Photo storage isn’t set up yet' });
		const form = await request.formData();
		const id = sectionId(form);
		if (!id) return fail(400, { message: 'Missing section' });
		const files = form.getAll('photo').filter((f): f is File => f instanceof File && f.size > 0);
		const widths = form.getAll('width');
		const heights = form.getAll('height');
		if (!files.length) return fail(400, { message: 'Pick at least one photo', sectionId: id });
		const failures: string[] = [];
		let added = 0;
		for (const [i, file] of files.entries()) {
			const checked = validatePhoto(file, widths[i], heights[i]);
			if (!checked.ok) {
				failures.push(`${file.name}: ${checked.error}`);
				continue;
			}
			try {
				await addPhoto(db, bucket, id, file, checked);
				added++;
			} catch (e) {
				console.error('photo upload failed', e);
				failures.push(`${file.name}: storage unavailable`);
			}
		}
		if (!added) return fail(400, { message: failures.join(' · '), sectionId: id });
		return {
			message: `Added ${added} photo${added === 1 ? '' : 's'} — add alt text to show them${failures.length ? ` · ${failures.join(' · ')}` : ''}`,
			sectionId: id
		};
	},

	photoAlt: async ({ locals, platform, request }) => {
		requireOrganizer(locals, platform);
		const db = platform?.env?.DB;
		if (!db) return fail(503, { message: 'Storage is not available right now' });
		const form = await request.formData();
		const ok = await setPhotoAlt(db, String(form.get('photo') ?? ''), String(form.get('alt') ?? ''));
		if (!ok) return fail(404, { message: 'That photo no longer exists' });
		return { message: 'Alt text saved', sectionId: sectionId(form) };
	},

	photoMove: async ({ locals, platform, request }) => {
		requireOrganizer(locals, platform);
		const db = platform?.env?.DB;
		if (!db) return fail(503, { message: 'Storage is not available right now' });
		const form = await request.formData();
		const dir = direction(form);
		if (!dir) return fail(400, { message: 'Missing direction' });
		await movePhoto(db, String(form.get('photo') ?? ''), dir);
		return { sectionId: sectionId(form) };
	},

	photoDelete: async ({ locals, platform, request }) => {
		requireOrganizer(locals, platform);
		const db = platform?.env?.DB;
		const bucket = platform?.env?.SITE_MEDIA;
		if (!db) return fail(503, { message: 'Storage is not available right now' });
		if (!bucket) return fail(503, { message: 'Photo storage isn’t set up yet' });
		const form = await request.formData();
		const ok = await deletePhoto(db, bucket, String(form.get('photo') ?? ''));
		if (!ok) return fail(404, { message: 'That photo no longer exists' });
		return { message: 'Photo deleted', sectionId: sectionId(form) };
	}
};
```

Add the helper the `delete` action uses to `src/lib/server/site/photos.ts`:
```ts
/** For when R2 is unbound: only photo-less sections can be deleted. */
export async function deleteSectionWithoutMedia(db: D1Database, sectionId: number): Promise<boolean | 'has-photos'> {
	const n = await db.prepare(`SELECT COUNT(*) AS n FROM site_photos WHERE section_id = ?1`).bind(sectionId).first<{ n: number }>();
	if ((n?.n ?? 0) > 0) return 'has-photos';
	return deleteSectionRow(db, sectionId);
}
```
and its test in `src/lib/server/site/photos.test.ts` (add `deleteSectionWithoutMedia` to the import list from `./photos`):
```ts
	it('deleteSectionWithoutMedia refuses sections that still have photos', async () => {
		const { db, sectionId } = await setup('public');
		expect(await deleteSectionWithoutMedia(db, sectionId)).toBe('has-photos');
		const empty = await createSection(db, { title: 'E', body: '', visibility: 'hidden' }, 'did:plc:org1');
		expect(await deleteSectionWithoutMedia(db, empty)).toBe(true);
	});
```
Run `pnpm vitest run src/lib/server/site/photos.test.ts` → PASS.

- [ ] **Step 2: Verify**

Run: `pnpm check && pnpm test && pnpm build`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add src/routes/organizer/retreat/+page.server.ts src/lib/server/site/photos.ts src/lib/server/site/photos.test.ts
git commit -m "feat(site): organizer actions for retreat sections and photos"
```

---

### Task 9: console UI

**Files:**
- Create: `src/lib/site/console/downscale.ts`, `src/lib/site/console/downscale.test.ts`, `src/lib/site/console/SectionList.svelte`, `src/lib/site/console/SectionEditor.svelte`, `src/lib/site/console/PhotoManager.svelte`, `src/routes/organizer/retreat/+page.svelte`
- Modify: `src/lib/organizer/OrganizerRail.svelte`

**Interfaces:**
- Consumes: Task 8 load data/actions; `renderMarkdown` (Task 1) for preview; types `Section`, `Photo` (`import type`).
- Produces: `fitWithin(width, height, max): { width: number; height: number }`; `downscale(file: File, max = 2400, quality = 0.85): Promise<{ blob: Blob; width: number; height: number; name: string }>`.

- [ ] **Step 1: Failing test for the pure sizing** — `src/lib/site/console/downscale.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { fitWithin } from './downscale';

describe('fitWithin', () => {
	it('keeps small images as they are', () => {
		expect(fitWithin(1200, 800, 2400)).toEqual({ width: 1200, height: 800 });
	});
	it('scales the longest edge down to max, keeping aspect', () => {
		expect(fitWithin(4032, 3024, 2400)).toEqual({ width: 2400, height: 1800 });
		expect(fitWithin(3024, 4032, 2400)).toEqual({ width: 1800, height: 2400 });
	});
});
```

Run: `pnpm vitest run src/lib/site/console/downscale.test.ts` → FAIL (no module).

- [ ] **Step 2: Implement** — `src/lib/site/console/downscale.ts`

```ts
/** Longest edge ≤ max, aspect preserved, integer pixels. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
	const scale = Math.min(1, max / Math.max(width, height));
	return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Browser-only: decode, shrink to ≤ max px, re-encode as JPEG. iOS hands
 * HEIC picks over as JPEG already. Falls back to the original file (with its
 * natural size) if the browser can't decode it, so the server's type and
 * size checks still decide.
 */
export async function downscale(
	file: File,
	max = 2400,
	quality = 0.85
): Promise<{ blob: Blob; width: number; height: number; name: string }> {
	const bitmap = await createImageBitmap(file);
	const size = fitWithin(bitmap.width, bitmap.height, max);
	const canvas = new OffscreenCanvas(size.width, size.height);
	const ctx = canvas.getContext('2d');
	if (!ctx) {
		bitmap.close();
		return { blob: file, width: size.width, height: size.height, name: file.name };
	}
	ctx.drawImage(bitmap, 0, 0, size.width, size.height);
	bitmap.close();
	const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
	return { blob, width: size.width, height: size.height, name: file.name.replace(/\.[^.]+$/, '') + '.jpg' };
}
```

Run the test → PASS.

- [ ] **Step 3: `src/lib/site/console/PhotoManager.svelte`**

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Photo } from '$lib/server/site/photos';
	import { downscale } from '$lib/site/console/downscale';

	let { sectionId, photos, mediaConfigured }: { sectionId: number; photos: Photo[]; mediaConfigured: boolean } = $props();

	let uploading = $state(false);
	let uploadError = $state<string | null>(null);
</script>

<div class="photos">
	<h3 class="kicker">Photos</h3>
	{#if !mediaConfigured}
		<p class="warn" role="alert">Photo storage isn’t set up yet — create the <code>buildtreat-site-media</code> R2 bucket and bind it as <code>SITE_MEDIA</code>.</p>
	{:else}
		<form
			method="POST"
			action="?/upload"
			enctype="multipart/form-data"
			use:enhance={async ({ formData, cancel }) => {
				uploadError = null;
				const picked = formData.getAll('photo').filter((f): f is File => f instanceof File && f.size > 0);
				if (!picked.length) {
					cancel();
					uploadError = 'Pick at least one photo';
					return;
				}
				uploading = true;
				formData.delete('photo');
				formData.delete('width');
				formData.delete('height');
				for (const file of picked) {
					try {
						const out = await downscale(file);
						formData.append('photo', new File([out.blob], out.name, { type: out.blob.type || file.type }));
						formData.append('width', String(out.width));
						formData.append('height', String(out.height));
					} catch {
						formData.append('photo', file);
						formData.append('width', '0');
						formData.append('height', '0');
					}
				}
				return async ({ update }) => {
					uploading = false;
					await update();
				};
			}}
		>
			<input type="hidden" name="id" value={sectionId} />
			<label class="kicker" for={`pick-${sectionId}`}>Add photos</label>
			<input id={`pick-${sectionId}`} type="file" name="photo" accept="image/jpeg,image/png,image/webp,image/heic" multiple />
			<button class="btn-ghost" disabled={uploading}>{uploading ? 'Uploading…' : 'Upload'}</button>
			{#if uploadError}<p class="warn" role="alert">{uploadError}</p>{/if}
		</form>
	{/if}

	{#if photos.length}
		<ul class="thumbs">
			{#each photos as p, i (p.id)}
				<li>
					<img src={`/media/site/${p.id}`} alt={p.alt || 'No alt text yet'} width={p.width} height={p.height} loading="lazy" />
					<form method="POST" action="?/photoAlt" use:enhance={() => async ({ update }) => update({ reset: false })}>
						<input type="hidden" name="id" value={sectionId} />
						<input type="hidden" name="photo" value={p.id} />
						<label class="visually-hidden" for={`alt-${p.id}`}>Alt text</label>
						<input id={`alt-${p.id}`} name="alt" value={p.alt} maxlength="300" placeholder="Describe the photo (required to show it)" />
						<button class="btn-ghost">Save alt</button>
					</form>
					{#if !p.alt}<p class="hint">Hidden on the site until it has alt text.</p>{/if}
					<div class="row">
						<form method="POST" action="?/photoMove" use:enhance>
							<input type="hidden" name="id" value={sectionId} />
							<input type="hidden" name="photo" value={p.id} />
							<button class="btn-ghost" name="direction" value="up" disabled={i === 0} aria-label="Move photo earlier">↑</button>
							<button class="btn-ghost" name="direction" value="down" disabled={i === photos.length - 1} aria-label="Move photo later">↓</button>
						</form>
						<form method="POST" action="?/photoDelete" use:enhance>
							<input type="hidden" name="id" value={sectionId} />
							<input type="hidden" name="photo" value={p.id} />
							<button class="btn-ghost">Delete photo</button>
						</form>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.photos { display: flex; flex-direction: column; gap: var(--space-2); }
	.thumbs { list-style: none; display: grid; grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr)); gap: var(--space-3); }
	.thumbs img { width: 100%; height: auto; border-radius: 4px; display: block; }
	.row { display: flex; gap: var(--space-1); flex-wrap: wrap; }
	.hint, .warn { font-size: 0.8125rem; color: var(--ink-70); }
	input:not([type='file']) { background: transparent; border: none; border-bottom: 1px solid var(--ink-45); color: var(--ink); font: inherit; padding: 0.4rem 0; width: 100%; }
	.btn-ghost { border: 1px solid var(--ink-45); border-radius: 999px; padding: 0.4rem 0.9rem; font-size: 0.8125rem; font-weight: 600; color: var(--ink); }
	.btn-ghost:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
```

- [ ] **Step 4: `src/lib/site/console/SectionEditor.svelte`**

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Photo } from '$lib/server/site/photos';
	import type { Section } from '$lib/server/site/sections';
	import { renderMarkdown } from '$lib/markdown/render';
	import PhotoManager from '$lib/site/console/PhotoManager.svelte';

	let {
		section,
		photos,
		mediaConfigured,
		message
	}: { section: Section; photos: Photo[]; mediaConfigured: boolean; message: string | null } = $props();

	// Local edit buffers start from the loaded row; a successful save re-runs
	// the load, which remounts this component (keyed by id + updatedAt).
	let title = $state(section.title);
	let body = $state(section.body);
	let visibility = $state(section.visibility);
	const preview = $derived(renderMarkdown(body));
	let armed = $state(false);
</script>

<article class="editor" aria-labelledby={`ed-${section.id}`}>
	<form method="POST" action="?/save" use:enhance={() => async ({ update }) => update({ reset: false })}>
		<input type="hidden" name="id" value={section.id} />
		<input type="hidden" name="updatedAt" value={section.updatedAt} />
		<label class="kicker" for={`ed-${section.id}`}>Title</label>
		<input id={`ed-${section.id}`} name="title" bind:value={title} maxlength="120" required />

		<label class="kicker" for={`body-${section.id}`}>Body</label>
		<textarea id={`body-${section.id}`} name="body" bind:value={body} rows="10"></textarea>
		<p class="hint">Markdown: <code>## Heading</code>, <code>- item</code>, <code>1. item</code>, <code>**bold**</code>, <code>_italic_</code>, <code>[label](https://…)</code>.</p>

		<fieldset class="vis">
			<legend class="kicker">Who can see this</legend>
			<label><input type="radio" name="visibility" value="public" bind:group={visibility} /> Public</label>
			<label><input type="radio" name="visibility" value="invited" bind:group={visibility} /> Invited only</label>
			<label><input type="radio" name="visibility" value="hidden" bind:group={visibility} /> Hidden (draft)</label>
		</fieldset>

		<div class="row">
			<button class="pill">Save</button>
			{#if message}<p class="hint" role="status">{message}</p>{/if}
		</div>
	</form>

	<div class="preview">
		<h3 class="kicker">Preview</h3>
		<h4 class="display">{title}</h4>
		<div class="prose">{@html preview}</div>
	</div>

	<PhotoManager sectionId={section.id} {photos} {mediaConfigured} />

	<form method="POST" action="?/delete" use:enhance class="row">
		<input type="hidden" name="id" value={section.id} />
		{#if armed}
			<button class="pill">Really delete “{section.title}”{photos.length ? ` and ${photos.length} photo${photos.length === 1 ? '' : 's'}` : ''}</button>
			<button class="btn-ghost" type="button" onclick={() => (armed = false)}>Cancel</button>
		{:else}
			<button class="btn-ghost" type="button" onclick={() => (armed = true)}>Delete section…</button>
		{/if}
	</form>
</article>

<style>
	.editor { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4) 0; border-top: var(--hairline); }
	form { display: flex; flex-direction: column; gap: var(--space-2); }
	.row { flex-direction: row; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
	input:not([type='radio']), textarea { background: transparent; border: none; border-bottom: 1px solid var(--ink-45); color: var(--ink); font: inherit; padding: 0.45rem 0; resize: vertical; }
	.vis { border: 0; padding: 0; display: flex; gap: var(--space-3); flex-wrap: wrap; }
	.hint { font-size: 0.8125rem; color: var(--ink-70); }
	.hint code { background: var(--ink-12); padding: 0.1em 0.35em; border-radius: 6px; }
	.preview { padding: var(--space-3); border: var(--hairline); }
	.prose { color: var(--ink-70); line-height: 1.6; }
	.prose :global(a) { color: var(--ink); text-decoration: underline; }
	.btn-ghost { border: 1px solid var(--ink-45); border-radius: 999px; padding: 0.5rem 1.1rem; font-size: 0.8125rem; font-weight: 600; color: var(--ink); }
	.pill { width: auto; }
</style>
```

- [ ] **Step 5: `src/lib/site/console/SectionList.svelte`**

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Section } from '$lib/server/site/sections';

	let { sections, selected, onselect }: { sections: Array<Section & { photoCount: number }>; selected: number | null; onselect: (id: number) => void } = $props();

	const badge = { public: 'Public', invited: 'Invited', hidden: 'Hidden' } as const;
</script>

<ol class="list">
	{#each sections as s, i (s.id)}
		<li class:current={s.id === selected}>
			<button type="button" class="pick" onclick={() => onselect(s.id)}>
				<span class="title">{s.title}</span>
				<span class="meta">{badge[s.visibility]} · {s.photoCount} photo{s.photoCount === 1 ? '' : 's'}</span>
			</button>
			<form method="POST" action="?/move" use:enhance>
				<input type="hidden" name="id" value={s.id} />
				<button name="direction" value="up" disabled={i === 0} aria-label={`Move ${s.title} up`}>↑</button>
				<button name="direction" value="down" disabled={i === sections.length - 1} aria-label={`Move ${s.title} down`}>↓</button>
			</form>
		</li>
	{/each}
</ol>
<form method="POST" action="?/create" use:enhance>
	<button class="btn-ghost">Add section</button>
</form>

<style>
	.list { list-style: none; display: flex; flex-direction: column; }
	li { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); border-top: var(--hairline); padding: 0.5rem 0; }
	li.current .title { text-decoration: underline; }
	.pick { display: flex; flex-direction: column; align-items: flex-start; text-align: left; color: var(--ink); }
	.meta { font-size: 0.75rem; color: var(--ink-70); }
	form { display: flex; gap: 0.25rem; }
	form button:disabled { opacity: 0.3; }
	.btn-ghost { margin-top: var(--space-2); border: 1px solid var(--ink-45); border-radius: 999px; padding: 0.5rem 1.1rem; font-size: 0.8125rem; font-weight: 600; color: var(--ink); }
</style>
```

- [ ] **Step 6: Page** — `src/routes/organizer/retreat/+page.svelte`

```svelte
<script lang="ts">
	import SectionList from '$lib/site/console/SectionList.svelte';
	import SectionEditor from '$lib/site/console/SectionEditor.svelte';

	let { data, form } = $props();

	let selected = $state<number | null>(data.sections[0]?.id ?? null);
	// A create/save/move result names its section; follow it.
	$effect(() => {
		if (form && 'sectionId' in form && typeof form.sectionId === 'number') selected = form.sectionId;
	});
	const current = $derived(data.sections.find((s) => s.id === selected) ?? null);
	const message = $derived(form && 'message' in form ? (form.message as string) : null);
</script>

<svelte:head><title>Retreat info — Organizer</title></svelte:head>

<main class="console">
	<header>
		<a href="/organizer">← Console</a>
		<h1 class="display">Retreat info</h1>
		<p class="links"><a href="/?as=public" target="_blank" rel="noopener">View as public</a> · <a href="/?as=invited" target="_blank" rel="noopener">View as invited</a></p>
	</header>
	<div class="layout">
		<aside>
			<SectionList
				sections={data.sections.map((s) => ({ ...s, photoCount: s.photos.length }))}
				{selected}
				onselect={(id) => (selected = id)}
			/>
		</aside>
		<section aria-label="Editor">
			{#if current}
				{#key `${current.id}:${current.updatedAt}`}
					<SectionEditor section={current} photos={current.photos} mediaConfigured={data.mediaConfigured} {message} />
				{/key}
			{:else}
				<p>No sections yet — add one.</p>
				{#if message}<p role="status">{message}</p>{/if}
			{/if}
		</section>
	</div>
</main>

<style>
	.console { max-width: 72rem; margin: 0 auto; padding: var(--space-4) var(--space-3) var(--space-5); }
	header { display: flex; flex-direction: column; gap: var(--space-1); margin-bottom: var(--space-4); }
	header a, .links a { color: var(--ink); }
	.links { font-size: 0.8125rem; color: var(--ink-70); }
	.layout { display: grid; grid-template-columns: minmax(14rem, 18rem) 1fr; gap: var(--space-5); }
	@media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }
</style>
```

- [ ] **Step 7: Rail link** — `src/lib/organizer/OrganizerRail.svelte`: replace the line
`<a class="quiet-link" href="/">← the survey</a>` with
```svelte
		<a class="quiet-link" href="/organizer/retreat">retreat info →</a>
		<a class="quiet-link" href="/">← the retreat site</a>
```

- [ ] **Step 8: Verify**

Run: `pnpm check && pnpm test && pnpm build`. Then `pnpm dev --host 127.0.0.1`, sign in as an organizer (or use the local D1 with your DID in `ORGANIZER_DIDS`) and exercise: add section → edit title/body (preview updates) → set Invited → save → `/?as=public` hides it, `/?as=invited` shows it → upload a phone photo (local R2 simulation via the platform proxy) → add alt → it appears on `/` for invited, `curl -i` of its `/media/site/<id>` while signed out returns 404 → reorder → delete section (arm/confirm). Two tabs: save in one, then save the stale tab → "Changed elsewhere — reload first".

- [ ] **Step 9: Commit**

```bash
git add src/lib/site/console/downscale.ts src/lib/site/console/downscale.test.ts src/lib/site/console/SectionList.svelte src/lib/site/console/SectionEditor.svelte src/lib/site/console/PhotoManager.svelte src/routes/organizer/retreat/+page.svelte src/lib/organizer/OrganizerRail.svelte
git commit -m "feat(site): retreat info console with live preview and photo uploads"
```

---

### Task 9a: Who's coming (curated attendees)

**Files:**
- Create: `migrations/0011_site_featured_posts.sql`, `src/lib/server/site/featured.ts`, `src/lib/server/site/featured.test.ts`, `src/routes/organizer/retreat/attendees/+page.server.ts`, `src/routes/organizer/retreat/attendees/+page.svelte`, `src/lib/site/WhosComing.svelte`
- Modify: `src/lib/server/site/page.ts`, `src/lib/server/site/page.test.ts`, `src/routes/+page.server.ts`, `src/lib/content.ts`, `src/lib/site/RetreatHome.svelte`, `src/routes/organizer/retreat/+page.svelte`, `src/lib/site/AGENTS.md`

**Interfaces:**
- Consumes: `registrations` table (migration 0006; a *confirmed registrant* is `status = 'confirmed' AND agreed_at IS NOT NULL` — the same "complete registration" rule `RetreatHome` uses for its status strip); `loadBskyProfiles` from `@svelte-atproto/oauth/bsky` (batch `app.bsky.actor.getProfiles` against `https://public.api.bsky.app`, read-through `PROFILE_CACHE`); `requireOrganizer` pattern (Task 8); `SiteData`/`loadSite` (Task 5).
- Produces:
  - `BLURB_MAX = 140`
  - `interface ConsoleAttendee { did: string; handle: string | null; name: string; shown: boolean; blurb: string }`
  - `listConsoleAttendees(db): Promise<ConsoleAttendee[]>` — shown rows first in `position` order, then the rest by name
  - `validateBlurb(raw: unknown): { ok: true; value: string } | { ok: false; error: string }`
  - `setFeatured(db, did, patch: { shown?: boolean; blurb?: string }): Promise<{ ok: true } | { ok: false; error: string }>`
  - `moveFeatured(db, did, direction: 'up' | 'down'): Promise<boolean>` — renumbers the shown list 1..n
  - `interface FeaturedAttendee { did: string; handle: string | null; blurb: string }`; `shownAttendees(db): Promise<FeaturedAttendee[]>`
  - `interface ProfileLite { handle?: string; displayName?: string; avatar?: string }`; `type ProfileLoader = (dids: string[]) => Promise<Record<string, ProfileLite | undefined>>`
  - `interface AttendeeView { did: string; handle: string; displayName: string | null; avatar: string | null; blurb: string }`
  - `hydrateAttendees(rows: FeaturedAttendee[], load: ProfileLoader | undefined, timeoutMs = 3000): Promise<AttendeeView[]>`
  - `SiteData` gains `attendees: AttendeeView[]`; `loadSite` input gains optional `profiles?: ProfileLoader`.
  - Console route `/organizer/retreat/attendees`: `load` → `{ attendees: ConsoleAttendee[]; blurbMax: number }`; actions `toggle`, `blurb`, `move`.

**Decisions made here (documented in code comments):**
- *Confirmed* = `status = 'confirmed' AND agreed_at IS NOT NULL` (a confirmed row without an agreement is an incomplete registration, not an attendee).
- Public cards never use the registration's `name` (it is personal data the attendee gave the organizers); display name comes only from the live Bluesky profile. Fallback is the registration handle; a person with neither a profile handle nor a registration handle is omitted rather than rendered as a bare DID.
- `move` reorders only the shown list; un-shown rows keep a stale position until switched on, at which point they go to the end.
- Profiles are loaded with `loadBskyProfiles` (appview only — no PDS fallback, so the global "Bluesky data only from `public.api.bsky.app`" rule holds), wrapped in a 3 s timeout.

- [ ] **Step 1: Migration** — `migrations/0011_site_featured_posts.sql` (holds all of 0011's schema; Task 9b uses the `site_bsky_posts` table and the two `site_sections` columns)

```sql
-- the Atmospheric Builders' Retreat — who's coming + the posts stream

-- Who's coming: organizer-curated confirmed registrants. Off by default;
-- the public render additionally requires the registration to still be
-- confirmed, so a later decline hides the card without touching this row.
CREATE TABLE site_featured (
  did         TEXT PRIMARY KEY,
  blurb       TEXT NOT NULL DEFAULT '',
  shown       INTEGER NOT NULL DEFAULT 0 CHECK (shown IN (0, 1)),
  position    INTEGER NOT NULL,
  updated_at  TEXT NOT NULL
);

-- Bluesky posts in the stream, by at:// URI. Hydrated from the public
-- appview at render time (KV-cached); a post that no longer resolves is
-- omitted silently.
CREATE TABLE site_bsky_posts (
  uri       TEXT PRIMARY KEY,
  added_at  TEXT NOT NULL,
  added_by  TEXT NOT NULL
);

-- Updates are sections with kind = 'update' and a publish date; they render
-- in the posts stream instead of the page flow. SQLite (and D1) accept a
-- CHECK on ADD COLUMN and test it against existing rows; sections.ts also
-- validates kind in code (isKind) and maps unknown values to 'section'.
ALTER TABLE site_sections ADD COLUMN kind TEXT NOT NULL DEFAULT 'section'
  CHECK (kind IN ('section', 'update'));
ALTER TABLE site_sections ADD COLUMN published_at TEXT;
```

Run: `pnpm vitest run src/lib/server/site` → PASS (every test DB now applies 0011; existing tests are unaffected because `listSections` still returns every row until Task 9b filters by kind).

- [ ] **Step 2: Write the failing test** — `src/lib/server/site/featured.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import { sqliteD1 } from '$lib/server/test/sqlite-d1';
import {
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

	it('uses the live profile for name, handle and an https avatar', async () => {
		const load: ProfileLoader = async () => ({
			'did:plc:a': { handle: 'ada.example', displayName: ' Ada ', avatar: 'https://cdn.bsky.app/img/avatar/plain/a@jpeg' },
			'did:plc:b': { handle: 'handle.invalid', avatar: 'javascript:alert(1)' }
		});
		expect(await hydrateAttendees(rows, load)).toEqual([
			{ did: 'did:plc:a', handle: 'ada.example', displayName: 'Ada', avatar: 'https://cdn.bsky.app/img/avatar/plain/a@jpeg', blurb: 'feeds' },
			{ did: 'did:plc:b', handle: 'b.test', displayName: null, avatar: null, blurb: '' }
		]);
	});

	it('degrades to registration handles with no avatar when profiles fail or hang', async () => {
		const fallback = [
			{ did: 'did:plc:a', handle: 'a.test', displayName: null, avatar: null, blurb: 'feeds' },
			{ did: 'did:plc:b', handle: 'b.test', displayName: null, avatar: null, blurb: '' }
		];
		expect(await hydrateAttendees(rows, async () => { throw new Error('appview down'); })).toEqual(fallback);
		expect(await hydrateAttendees(rows, () => new Promise(() => {}), 10)).toEqual(fallback);
		expect(await hydrateAttendees(rows, undefined)).toEqual(fallback);
	});
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm vitest run src/lib/server/site/featured.test.ts`
Expected: FAIL — cannot resolve `./featured`.

- [ ] **Step 4: Implement** — `src/lib/server/site/featured.ts`

```ts
import type { D1Database } from '@cloudflare/workers-types';

/**
 * Who's coming (migration 0011): organizer-curated confirmed registrants.
 * A confirmed registrant is status 'confirmed' with an agreement on file —
 * the same "complete registration" rule as the status strip. The public
 * list is shown = 1 AND still confirmed, so a later decline hides the card.
 * All SQL parameterized.
 */

export const BLURB_MAX = 140;

export interface ConsoleAttendee {
	did: string;
	handle: string | null;
	/** Registration name — organizer console only, never rendered publicly. */
	name: string;
	shown: boolean;
	blurb: string;
}

export interface FeaturedAttendee {
	did: string;
	handle: string | null;
	blurb: string;
}

export interface ProfileLite {
	handle?: string;
	displayName?: string;
	avatar?: string;
}

/** Injected so tests don't touch the network; production passes loadBskyProfiles. */
export type ProfileLoader = (dids: string[]) => Promise<Record<string, ProfileLite | undefined>>;

export interface AttendeeView {
	did: string;
	handle: string;
	displayName: string | null;
	avatar: string | null;
	blurb: string;
}

const CONFIRMED = `r.status = 'confirmed' AND r.agreed_at IS NOT NULL`;

export function validateBlurb(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
	if (typeof raw !== 'string') return { ok: false, error: 'The blurb must be text' };
	const value = raw.replace(/\s+/g, ' ').trim();
	if ([...value].length > BLURB_MAX) return { ok: false, error: `Blurbs max out at ${BLURB_MAX} characters` };
	return { ok: true, value };
}

export async function listConsoleAttendees(db: D1Database): Promise<ConsoleAttendee[]> {
	const { results } = await db
		.prepare(
			`SELECT r.did AS did, r.handle AS handle, r.name AS name,
			        COALESCE(f.blurb, '') AS blurb, COALESCE(f.shown, 0) AS shown
			 FROM registrations r LEFT JOIN site_featured f ON f.did = r.did
			 WHERE ${CONFIRMED}
			 ORDER BY COALESCE(f.shown, 0) DESC, CASE WHEN f.shown = 1 THEN f.position END, lower(r.name), r.did`
		)
		.all<{ did: string; handle: string | null; name: string; blurb: string; shown: number }>();
	return results.map((r) => ({ did: r.did, handle: r.handle, name: r.name, blurb: r.blurb, shown: r.shown === 1 }));
}

export async function shownAttendees(db: D1Database): Promise<FeaturedAttendee[]> {
	const { results } = await db
		.prepare(
			`SELECT f.did AS did, r.handle AS handle, f.blurb AS blurb
			 FROM site_featured f JOIN registrations r ON r.did = f.did
			 WHERE f.shown = 1 AND ${CONFIRMED}
			 ORDER BY f.position, f.did`
		)
		.all<FeaturedAttendee>();
	return results.map((r) => ({ did: r.did, handle: r.handle, blurb: r.blurb }));
}

/**
 * Patch one person's card. Omitted fields keep their value. Switching a card
 * on (or creating it) puts it at the end of the shown order.
 */
export async function setFeatured(
	db: D1Database,
	did: string,
	patch: { shown?: boolean; blurb?: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
	const confirmed = await db
		.prepare(`SELECT 1 AS ok FROM registrations r WHERE r.did = ?1 AND ${CONFIRMED}`)
		.bind(did)
		.first();
	if (!confirmed) return { ok: false, error: 'Only confirmed registrants can appear on the site' };

	let blurb: string | undefined;
	if (patch.blurb !== undefined) {
		const checked = validateBlurb(patch.blurb);
		if (!checked.ok) return checked;
		blurb = checked.value;
	}

	const existing = await db
		.prepare(`SELECT blurb, shown FROM site_featured WHERE did = ?1`)
		.bind(did)
		.first<{ blurb: string; shown: number }>();
	const now = new Date().toISOString();
	const shown = patch.shown ?? existing?.shown === 1;
	const nextBlurb = blurb ?? existing?.blurb ?? '';

	if (!existing || (shown && existing.shown !== 1)) {
		await db
			.prepare(
				`INSERT INTO site_featured (did, blurb, shown, position, updated_at)
				 VALUES (?1, ?2, ?3, (SELECT COALESCE(MAX(position), 0) + 1 FROM site_featured), ?4)
				 ON CONFLICT(did) DO UPDATE SET blurb = excluded.blurb, shown = excluded.shown,
				   position = excluded.position, updated_at = excluded.updated_at`
			)
			.bind(did, nextBlurb, shown ? 1 : 0, now)
			.run();
	} else {
		await db
			.prepare(`UPDATE site_featured SET blurb = ?1, shown = ?2, updated_at = ?3 WHERE did = ?4`)
			.bind(nextBlurb, shown ? 1 : 0, now, did)
			.run();
	}
	return { ok: true };
}

/** Swap with the neighbour in the shown list, then renumber that list 1..n. */
export async function moveFeatured(db: D1Database, did: string, direction: 'up' | 'down'): Promise<boolean> {
	const list = await shownAttendees(db);
	const i = list.findIndex((a) => a.did === did);
	const j = direction === 'up' ? i - 1 : i + 1;
	if (i < 0 || j < 0 || j >= list.length) return false;
	const order = [...list];
	[order[i], order[j]] = [order[j], order[i]];
	await db.batch(
		order.map((a, idx) => db.prepare(`UPDATE site_featured SET position = ?1 WHERE did = ?2`).bind(idx + 1, a.did))
	);
	return true;
}

const HANDLE_RE = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;

const cleanHandle = (h: unknown): string | null =>
	typeof h === 'string' && h !== 'handle.invalid' && HANDLE_RE.test(h) ? h.toLowerCase() : null;

const httpsUrl = (u: unknown): string | null => {
	if (typeof u !== 'string' || u.length > 1024) return null;
	try {
		const url = new URL(u);
		return url.protocol === 'https:' ? url.href : null;
	} catch {
		return null;
	}
};

const cleanName = (n: unknown): string | null => {
	if (typeof n !== 'string') return null;
	const v = n.replace(/\s+/g, ' ').trim().slice(0, 64);
	return v || null;
};

/**
 * Attach live Bluesky profile data. Any loader failure or timeout degrades
 * every card to its registration handle with no avatar; a person with no
 * usable handle at all is left out rather than shown as a bare DID.
 */
export async function hydrateAttendees(
	rows: FeaturedAttendee[],
	load: ProfileLoader | undefined,
	timeoutMs = 3000
): Promise<AttendeeView[]> {
	if (!rows.length) return [];
	let profiles: Record<string, ProfileLite | undefined> = {};
	if (load) {
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			profiles = await Promise.race([
				load(rows.map((r) => r.did)),
				new Promise<never>((_, reject) => {
					timer = setTimeout(() => reject(new Error('profile load timed out')), timeoutMs);
				})
			]);
		} catch (e) {
			console.error('attendee profiles unavailable; using registration handles', e);
			profiles = {};
		} finally {
			clearTimeout(timer);
		}
	}
	const out: AttendeeView[] = [];
	for (const row of rows) {
		const p = profiles[row.did];
		const handle = cleanHandle(p?.handle) ?? cleanHandle(row.handle);
		if (!handle) continue;
		out.push({
			did: row.did,
			handle,
			displayName: cleanName(p?.displayName),
			avatar: httpsUrl(p?.avatar),
			blurb: row.blurb
		});
	}
	return out;
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `pnpm vitest run src/lib/server/site/featured.test.ts`
Expected: PASS.

- [ ] **Step 6: Failing tests for `loadSite` attendees** — append to the `describe('loadSite', …)` block in `src/lib/server/site/page.test.ts`

```ts
	it('shows curated, still-confirmed attendees to every tier', async () => {
		const d = await db();
		const at = '2026-09-01T00:00:00Z';
		for (const [did, handle, status] of [
			['did:plc:inv', 'invited.test', 'confirmed'],
			['did:plc:gone', 'gone.test', 'confirmed'],
			['did:plc:hidden', 'hidden.test', 'confirmed']
		] as const) {
			await d
				.prepare(
					`INSERT INTO registrations (did, handle, name, email, status, agreed_at, created_at, updated_at)
					 VALUES (?1, ?2, 'Private Name', 'x@example.com', ?3, ?4, ?4, ?4)`
				)
				.bind(did, handle, status, at)
				.run();
		}
		await setFeatured(d, 'did:plc:inv', { shown: true, blurb: 'building feeds' });
		await setFeatured(d, 'did:plc:gone', { shown: true });
		await setFeatured(d, 'did:plc:hidden', { blurb: 'not shown' });
		await d.prepare(`UPDATE registrations SET status = 'declined' WHERE did = 'did:plc:gone'`).run();

		const profiles: ProfileLoader = async () => ({
			'did:plc:inv': { handle: 'inv.example', displayName: 'Inv', avatar: 'https://cdn.bsky.app/a.jpg' }
		});
		for (const who of [null, { did: 'did:plc:inv', handle: null }]) {
			const site = await loadSite({ ...base, db: d, who, profiles });
			expect(site.attendees).toEqual([
				{ did: 'did:plc:inv', handle: 'inv.example', displayName: 'Inv', avatar: 'https://cdn.bsky.app/a.jpg', blurb: 'building feeds' }
			]);
			expect(JSON.stringify(site)).not.toContain('Private Name');
		}
	});

	it('a profile failure degrades attendees to registration handles, never a throw', async () => {
		const d = await db();
		await d
			.prepare(
				`INSERT INTO registrations (did, handle, name, email, status, agreed_at, created_at, updated_at)
				 VALUES ('did:plc:inv', 'invited.test', 'N', 'x@example.com', 'confirmed', ?1, ?1, ?1)`
			)
			.bind('2026-09-01T00:00:00Z')
			.run();
		await setFeatured(d, 'did:plc:inv', { shown: true });
		const site = await loadSite({ ...base, db: d, who: null, profiles: async () => { throw new Error('down'); } });
		expect(site.attendees).toEqual([{ did: 'did:plc:inv', handle: 'invited.test', displayName: null, avatar: null, blurb: '' }]);
		expect(site.unavailable).toBe(false);
	});
```

and change the file's imports to:

```ts
import { describe, expect, it } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import { sqliteD1 } from '$lib/server/test/sqlite-d1';
import { createSection } from './sections';
import { setFeatured, type ProfileLoader } from './featured';
import { loadSite } from './page';
```

Also extend the existing `'a failed read degrades to unavailable, not a throw'` expectation to `expect(site).toMatchObject({ unavailable: true, sections: [], attendees: [] });`.

Run: `pnpm vitest run src/lib/server/site/page.test.ts`
Expected: FAIL — `site.attendees` is undefined / `profiles` is not a known input.

- [ ] **Step 7: Implement** — replace `src/lib/server/site/page.ts` with

```ts
import type { D1Database } from '@cloudflare/workers-types';
import { renderMarkdown } from '$lib/markdown/render';
import { retreat, siteHome } from '$lib/content';
import { pageTier, viewerTier } from './tier';
import { listSections, visibleTo, type Section } from './sections';
import { photosFor } from './photos';
import { hydrateAttendees, shownAttendees, type AttendeeView, type ProfileLoader } from './featured';

export interface SitePhotoView {
	id: string;
	alt: string;
	width: number;
	height: number;
	src: string;
}

export interface SiteSectionView {
	id: number;
	title: string;
	html: string;
	visibility: 'public' | 'invited';
	photos: SitePhotoView[];
}

export interface SiteData {
	tier: 'public' | 'invited';
	/** True for organizers — the page shows "Edit retreat info" and preview links. */
	organizer: boolean;
	sections: SiteSectionView[];
	/** Who's coming: curated, still-confirmed registrants. Public at every tier. */
	attendees: AttendeeView[];
	/** The section read failed: render hero + strip + a quiet "more soon". */
	unavailable: boolean;
	/** Link-preview tags, built from public content only. */
	preview: { title: string; description: string; image: string };
}

const plain = (markdown: string) =>
	markdown
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
		.replace(/[*_#>`]/g, '')
		.replace(/\s+/g, ' ')
		.trim();

function previewFrom(publicSections: Section[], origin: string): SiteData['preview'] {
	const first = publicSections.find((s) => s.body.trim());
	const description = (first ? plain(first.body) : siteHome.fallbackDescription).slice(0, 200);
	return { title: retreat.name, description, image: `${origin}/media/hero-landscape.png` };
}

/** Who's coming never breaks the page: any failure renders no cards. */
async function loadAttendees(db: D1Database, profiles: ProfileLoader | undefined): Promise<AttendeeView[]> {
	try {
		return await hydrateAttendees(await shownAttendees(db), profiles);
	} catch (e) {
		console.error('who’s coming load failed', e);
		return [];
	}
}

export async function loadSite(input: {
	db: D1Database | undefined;
	organizerDids: string | undefined;
	origin: string;
	who: { did: string; handle: string | null } | null;
	asParam: string | null;
	/** Bluesky profile loader for attendee cards; omitted → registration handles only. */
	profiles?: ProfileLoader;
}): Promise<SiteData> {
	const actual = await viewerTier(input.db, input.organizerDids, input.who);
	const tier = pageTier(actual, input.asParam);
	const organizer = actual === 'organizer';
	const empty = { title: retreat.name, description: siteHome.fallbackDescription, image: `${input.origin}/media/hero-landscape.png` };
	if (!input.db) return { tier, organizer, sections: [], attendees: [], unavailable: true, preview: empty };
	const attendees = await loadAttendees(input.db, input.profiles);
	try {
		const all = await listSections(input.db);
		const shown = visibleTo(all, tier);
		const photos = await photosFor(input.db, shown.map((s) => s.id));
		return {
			tier,
			organizer,
			attendees,
			unavailable: false,
			preview: previewFrom(visibleTo(all, 'public'), input.origin),
			sections: shown.map((s) => ({
				id: s.id,
				title: s.title,
				html: renderMarkdown(s.body),
				visibility: s.visibility === 'public' ? 'public' : 'invited',
				photos: (photos.get(s.id) ?? [])
					.filter((p) => p.alt)
					.map((p) => ({ id: p.id, alt: p.alt, width: p.width, height: p.height, src: `/media/site/${p.id}` }))
			}))
		};
	} catch (e) {
		console.error('site sections load failed', e);
		return { tier, organizer, sections: [], attendees, unavailable: true, preview: empty };
	}
}
```

Run: `pnpm vitest run src/lib/server/site` → PASS.

- [ ] **Step 8: Wire profiles into `/`** — `src/routes/+page.server.ts`

Change the import `import { loadBskyProfile } from '@svelte-atproto/oauth/bsky';` to:
```ts
import { loadBskyProfile, loadBskyProfiles } from '@svelte-atproto/oauth/bsky';
```

Replace the `siteFor` constant with:
```ts
	// Attendee cards use the batch appview call only (no PDS fallback), so
	// Bluesky data on `/` comes solely from public.api.bsky.app.
	const attendeeProfiles = (dids: string[]) =>
		loadBskyProfiles(dids as `did:${string}:${string}`[], { cache: profileCache });
	const siteFor = (who: { did: string; handle: string | null } | null) =>
		loadSite({
			db,
			organizerDids: platform?.env?.ORGANIZER_DIDS,
			origin,
			who,
			asParam: url.searchParams.get('as'),
			profiles: attendeeProfiles
		});
```

- [ ] **Step 9: Copy** — `src/lib/content.ts`: in `siteHome`, replace `	backHome: '← Retreat home'` with
```ts
	whosComing: 'Who’s coming',
	backHome: '← Retreat home'
```

- [ ] **Step 10: `src/lib/site/WhosComing.svelte`**

```svelte
<script lang="ts">
	import type { AttendeeView } from '$lib/server/site/featured';
	import { siteHome } from '$lib/content';

	let { attendees }: { attendees: AttendeeView[] } = $props();
</script>

{#if attendees.length}
	<section class="whos-coming" aria-labelledby="whos-coming-title">
		<h2 class="display section-title" id="whos-coming-title">{siteHome.whosComing}</h2>
		<ul class="people">
			{#each attendees as a (a.did)}
				<li>
					{#if a.avatar}
						<img class="avatar" src={a.avatar} alt="" width="56" height="56" loading="lazy" decoding="async" referrerpolicy="no-referrer" />
					{:else}
						<span class="avatar blank" aria-hidden="true"></span>
					{/if}
					<div class="who">
						{#if a.displayName}<p class="name">{a.displayName}</p>{/if}
						<!-- handle is validated against the handle grammar on the server -->
						<a class="handle" href={`https://bsky.app/profile/${a.handle}`} rel="noopener">@{a.handle}</a>
						{#if a.blurb}<p class="blurb">{a.blurb}</p>{/if}
					</div>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.whos-coming {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-5) 0;
		border-top: var(--hairline);
	}
	.section-title {
		font-size: clamp(1.6rem, 5vw, 2.4rem);
	}
	.people {
		list-style: none;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 15rem), 1fr));
		gap: var(--space-3);
	}
	li {
		display: flex;
		gap: var(--space-2);
		align-items: flex-start;
	}
	.avatar {
		flex: none;
		width: 56px;
		height: 56px;
		border-radius: 50%;
		object-fit: cover;
	}
	.avatar.blank {
		display: block;
		border: var(--hairline);
	}
	.who {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
	}
	.name {
		color: var(--ink);
	}
	.handle {
		color: var(--ink-70);
		font-size: 0.875rem;
		overflow-wrap: anywhere;
	}
	.blurb {
		color: var(--ink-70);
		font-size: 0.875rem;
		line-height: 1.5;
	}
</style>
```

- [ ] **Step 11: Wire into the home** — `src/lib/site/RetreatHome.svelte` (amendment order: public = hero → public story → Who's coming → Posts → footer; invited = compact hero → status strip → invited sections → public story → Who's coming → Posts)

Add to the imports:
```ts
	import WhosComing from '$lib/site/WhosComing.svelte';
```
Add after `const site = $derived(data.site);`:
```ts
	// Invited view is logistics-first: invited sections, then the public story.
	const logistics = $derived(site.sections.filter((s) => s.visibility === 'invited'));
	const story = $derived(site.sections.filter((s) => s.visibility === 'public'));
```
Replace `<header class="hero">` with `<header class="hero" class:compact={site.tier === 'invited'}>`.

Replace
```svelte
	{#each site.sections as section (section.id)}
		<SiteSection {section} />
	{/each}
	{#if site.unavailable}
		<p class="more-soon">{siteHome.moreSoon}</p>
	{/if}
```
with
```svelte
	{#each logistics as section (section.id)}
		<SiteSection {section} />
	{/each}
	{#each story as section (section.id)}
		<SiteSection {section} />
	{/each}
	{#if site.unavailable}
		<p class="more-soon">{siteHome.moreSoon}</p>
	{/if}

	<WhosComing attendees={site.attendees} />
```
Add to the `<style>` block (if Task 7 Step 9 already gave the hero a compact treatment from the comp, keep the comp's version instead):
```css
	.hero.compact .hero-title {
		font-size: clamp(2rem, 7vw, 3.6rem);
	}
```

- [ ] **Step 12: Console server** — `src/routes/organizer/retreat/attendees/+page.server.ts`

```ts
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { isOrganizer } from '$lib/server/organizer/admin';
import { BLURB_MAX, listConsoleAttendees, moveFeatured, setFeatured } from '$lib/server/site/featured';

/**
 * /organizer/retreat/attendees — curate "Who's coming". Same access policy
 * as /organizer: signed out → the gate, non-organizer → 404.
 */
function requireOrganizer(locals: App.Locals, platform: App.Platform | undefined): string {
	if (!locals.did) redirect(303, '/organizer');
	if (!isOrganizer(platform?.env?.ORGANIZER_DIDS, locals.did)) error(404, { message: 'Not found' });
	return locals.did;
}

const didOf = (form: FormData) => {
	const v = String(form.get('did') ?? '');
	return v.startsWith('did:') && v.length <= 2048 ? v : null;
};

export const load: PageServerLoad = async ({ locals, platform }) => {
	requireOrganizer(locals, platform);
	const db = platform?.env?.DB;
	if (!db) error(503, { message: 'Storage is not available right now' });
	return { attendees: await listConsoleAttendees(db), blurbMax: BLURB_MAX };
};

export const actions: Actions = {
	toggle: async ({ locals, platform, request }) => {
		requireOrganizer(locals, platform);
		const db = platform?.env?.DB;
		if (!db) return fail(503, { message: 'Storage is not available right now' });
		const form = await request.formData();
		const did = didOf(form);
		if (!did) return fail(400, { message: 'Missing person' });
		const shown = form.get('shown') === '1';
		const r = await setFeatured(db, did, { shown });
		if (!r.ok) return fail(400, { message: r.error });
		return { message: shown ? 'Shown on the site' : 'Hidden from the site' };
	},

	blurb: async ({ locals, platform, request }) => {
		requireOrganizer(locals, platform);
		const db = platform?.env?.DB;
		if (!db) return fail(503, { message: 'Storage is not available right now' });
		const form = await request.formData();
		const did = didOf(form);
		if (!did) return fail(400, { message: 'Missing person' });
		const r = await setFeatured(db, did, { blurb: String(form.get('blurb') ?? '') });
		if (!r.ok) return fail(400, { message: r.error });
		return { message: 'Blurb saved' };
	},

	move: async ({ locals, platform, request }) => {
		requireOrganizer(locals, platform);
		const db = platform?.env?.DB;
		if (!db) return fail(503, { message: 'Storage is not available right now' });
		const form = await request.formData();
		const did = didOf(form);
		const dir = form.get('direction') === 'up' ? 'up' : form.get('direction') === 'down' ? 'down' : null;
		if (!did || !dir) return fail(400, { message: 'Missing person or direction' });
		await moveFeatured(db, did, dir);
		return {};
	}
};
```

- [ ] **Step 13: Console page** — `src/routes/organizer/retreat/attendees/+page.svelte`

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	const shownCount = $derived(data.attendees.filter((a) => a.shown).length);
	const message = $derived(form && 'message' in form ? (form.message as string) : null);
</script>

<svelte:head><title>Who’s coming — Organizer</title></svelte:head>

<main class="console">
	<header>
		<a href="/organizer/retreat">← Retreat info</a>
		<h1 class="display">Who’s coming</h1>
		<p class="hint">Confirmed registrants. Only people you switch on appear on the retreat site, in this order, with their Bluesky name and avatar.</p>
		{#if message}<p class="hint" role="status">{message}</p>{/if}
	</header>

	{#if !data.attendees.length}
		<p>No confirmed registrations yet.</p>
	{:else}
		<ol class="people">
			{#each data.attendees as a, i (a.did)}
				<li class:shown={a.shown}>
					<div class="who">
						<span class="name">{a.name}</span>
						<span class="handle">{a.handle ? `@${a.handle}` : a.did}</span>
					</div>
					<form method="POST" action="?/toggle" use:enhance>
						<input type="hidden" name="did" value={a.did} />
						<input type="hidden" name="shown" value={a.shown ? '0' : '1'} />
						<button class="btn-ghost" aria-pressed={a.shown}>{a.shown ? 'Shown on site' : 'Show on site'}</button>
					</form>
					<form method="POST" action="?/blurb" class="blurb" use:enhance={() => async ({ update }) => update({ reset: false })}>
						<input type="hidden" name="did" value={a.did} />
						<label class="visually-hidden" for={`blurb-${i}`}>What {a.name} is building</label>
						<input id={`blurb-${i}`} name="blurb" value={a.blurb} maxlength={data.blurbMax} placeholder="What they’re building (one line)" />
						<button class="btn-ghost">Save</button>
					</form>
					{#if a.shown}
						<form method="POST" action="?/move" use:enhance class="move">
							<input type="hidden" name="did" value={a.did} />
							<button class="btn-ghost" name="direction" value="up" disabled={i === 0} aria-label={`Move ${a.name} earlier`}>↑</button>
							<button class="btn-ghost" name="direction" value="down" disabled={i === shownCount - 1} aria-label={`Move ${a.name} later`}>↓</button>
						</form>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}
</main>

<style>
	.console { max-width: 60rem; margin: 0 auto; padding: var(--space-4) var(--space-3) var(--space-5); }
	header { display: flex; flex-direction: column; gap: var(--space-1); margin-bottom: var(--space-4); }
	header a { color: var(--ink); }
	.hint { font-size: 0.8125rem; color: var(--ink-70); }
	.people { list-style: none; display: flex; flex-direction: column; }
	li { display: grid; grid-template-columns: minmax(10rem, 1fr) auto minmax(14rem, 2fr) auto; gap: var(--space-2); align-items: center; padding: var(--space-2) 0; border-top: var(--hairline); }
	li:not(.shown) .who { color: var(--ink-70); }
	.who { display: flex; flex-direction: column; min-width: 0; }
	.handle { font-size: 0.8125rem; color: var(--ink-70); overflow-wrap: anywhere; }
	form { display: flex; gap: var(--space-1); align-items: center; }
	.blurb input { flex: 1; background: transparent; border: none; border-bottom: 1px solid var(--ink-45); color: var(--ink); font: inherit; padding: 0.4rem 0; }
	.btn-ghost { border: 1px solid var(--ink-45); border-radius: 999px; padding: 0.4rem 0.9rem; font-size: 0.8125rem; font-weight: 600; color: var(--ink); }
	.btn-ghost[aria-pressed='true'] { background: var(--ink); color: var(--ground); }
	.btn-ghost:disabled { opacity: 0.3; cursor: not-allowed; }
	@media (max-width: 760px) { li { grid-template-columns: 1fr; } }
</style>
```

- [ ] **Step 14: Link from the retreat console** — `src/routes/organizer/retreat/+page.svelte`: replace the line
```svelte
		<p class="links"><a href="/?as=public" target="_blank" rel="noopener">View as public</a> · <a href="/?as=invited" target="_blank" rel="noopener">View as invited</a></p>
```
with
```svelte
		<p class="links"><a href="/organizer/retreat/attendees">Who’s coming →</a> · <a href="/?as=public" target="_blank" rel="noopener">View as public</a> · <a href="/?as=invited" target="_blank" rel="noopener">View as invited</a></p>
```

- [ ] **Step 15: Folder docs** — `src/lib/site/AGENTS.md`: add a row after the `PhotoGallery.svelte` row:
```markdown
| `WhosComing.svelte` | "Who's coming" cards (avatar, Bluesky name, linked handle, blurb) — data from `loadSite().attendees`, already curated and still-confirmed. |
```

- [ ] **Step 16: Verify**

Run: `pnpm check && pnpm test && pnpm build`
Expected: green, check 0/0.
Then apply 0011 to the local D1 the same way 0010 was applied for Task 9's browser check, run `pnpm dev --host 127.0.0.1`, and as an organizer open `/organizer/retreat/attendees`, switch a confirmed registrant on, write a blurb, reorder two people; `/` and `/?as=public` show the cards in that order; switching off removes the card; `curl -s http://127.0.0.1:5173/ | grep -c 'Private\|@example.com'` → `0`.

- [ ] **Step 17: Commit**

```bash
git add migrations/0011_site_featured_posts.sql src/lib/server/site/featured.ts src/lib/server/site/featured.test.ts src/lib/server/site/page.ts src/lib/server/site/page.test.ts src/routes/+page.server.ts src/lib/content.ts src/lib/site/WhosComing.svelte src/lib/site/RetreatHome.svelte src/lib/site/AGENTS.md src/routes/organizer/retreat/attendees/+page.server.ts src/routes/organizer/retreat/attendees/+page.svelte src/routes/organizer/retreat/+page.svelte
git commit -m "feat(site): curated who's coming list with organizer console

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9b: Posts stream (updates + Bluesky posts)

**Files:**
- Create: `src/lib/server/site/bsky-posts.ts`, `src/lib/server/site/bsky-posts.test.ts`, `src/lib/site/PostsStream.svelte`, `src/lib/site/BskyPost.svelte`, `src/lib/site/console/BskyPostsManager.svelte`
- Modify: `src/lib/server/site/sections.ts`, `src/lib/server/site/sections.test.ts`, `src/lib/server/site/page.ts`, `src/lib/server/site/page.test.ts`, `src/routes/+page.server.ts`, `src/lib/content.ts`, `src/lib/site/RetreatHome.svelte`, `src/routes/organizer/retreat/+page.server.ts`, `src/routes/organizer/retreat/+page.svelte`, `src/lib/site/console/SectionEditor.svelte`, `src/lib/site/console/SectionList.svelte`, `src/lib/site/AGENTS.md`

**Interfaces:**
- Consumes: migration 0011 (Task 9a: `site_sections.kind`, `site_sections.published_at`, `site_bsky_posts`); Tasks 5, 8, 9, 9a.
- Produces:
  - `sections.ts`: `KINDS`, `type SectionKind = 'section' | 'update'`, `isKind`; `Section` gains `kind: SectionKind; publishedAt: string | null`; `SectionInput` gains optional `kind?`, `publishedAt?` (omitted on create → `'section'`/`null`; omitted on update → unchanged); `validateSection` accepts optional `kind`, `publishedAt` and always returns both; `listSections` now returns **only** `kind = 'section'` (same order and semantics as before); `listUpdates(db)` → updates, newest `published_at` first; `retreatToday(now?)` → `YYYY-MM-DD` in America/Los_Angeles.
  - `bsky-posts.ts`: `APPVIEW = 'https://public.api.bsky.app'`; `type FetchLike`; `interface KvLike`; `kvLike(kv: KVNamespace | undefined): KvLike | undefined`; `parsePostUrl(input: string): { actor: string; rkey: string } | null`; `resolveDid(actor, fetch): Promise<string | null>`; `postUriFromUrl(input, fetch): Promise<string | null>`; `interface BskyPostView { uri; url; createdAt; author: { did; handle: string | null; displayName: string | null; avatar: string | null }; segments: Array<{ text: string; href: string | null }>; images: Array<{ thumb: string; alt: string }> }`; `hydrateBskyPosts(uris, { fetch, kv? }): Promise<Map<string, BskyPostView>>`; `listBskyPostUris(db)`, `addBskyPost(db, uri, by): Promise<'added' | 'exists'>`, `removeBskyPost(db, uri): Promise<boolean>`; `interface BskyConsoleItem { uri; url: string | null; author: string | null; excerpt: string | null }`, `consoleItems(uris, views)`.
  - `page.ts`: `type SitePostView = { kind: 'update'; key; sortKey; datetime; dateLabel; update: SiteSectionView } | { kind: 'bsky'; key; sortKey; datetime; dateLabel; post: BskyPostView }`; `SiteData` gains `posts: SitePostView[]`; `loadSite` input gains optional `bsky?: { fetch: FetchLike; kv?: KvLike }`.
  - Console: load gains `updates`, `today`, `bskyPosts: BskyConsoleItem[]`; `create` accepts `kind=update`; `save` reads `kind` + `publishedAt`; new actions `bskyAdd` (field `url`), `bskyRemove` (field `uri`); Bluesky action results carry `bsky: true`.

**Decisions made here:**
- Stream order: updates sort as the *end* of their publish day (`YYYY-MM-DDT23:59:59.999Z`), so an organizer update leads any same-day Bluesky post. Labels: updates show their calendar date; Bluesky posts show the date in America/Los_Angeles.
- The URL parser accepts exactly `https://bsky.app/profile/<handle|did>/post/<rkey>` with an optional trailing slash — no query, fragment, port, userinfo or other host. The actor segment may be percent-encoded (`did%3Aplc%3A…`); the rkey must match the atproto record-key grammar (`[A-Za-z0-9._:~-]{1,512}`, not `.`/`..`). DIDs accepted: `did:plc:<24 base32>` and `did:web:<hostname>`.
- `bskyAdd` verifies the post actually hydrates before storing it, so organizers find typos immediately. Hydration negative-caches a post the appview definitively didn't return (1 h) but never caches a failed/timed-out request.
- Only link facets with `http:`/`https:` URIs become links; mentions and tags render as plain text. Text is never passed to `{@html}` — segments render as Svelte text nodes.
- Bluesky images keep their author-provided alt, including empty alt (rendered as `alt=""`); thumbnails must be `https:`.
- KV: reuses the `PROFILE_CACHE` namespace under the `bskypost:v1:` prefix (no new binding).

- [ ] **Step 1: Failing tests for kinds** — `src/lib/server/site/sections.test.ts`

Change the import list from `./sections` to include `listUpdates` and `retreatToday`, and change the first expectation in `'trims and accepts a valid section'` to:
```ts
			value: { title: 'Schedule', body: 'Fri: arrive', visibility: 'invited', kind: 'section', publishedAt: null }
```
Append:
```ts
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
		expect((await listSections(db))).toHaveLength(6);
		expect((await listUpdates(db)).map((u) => u.id)).toEqual([newer, older]);
		expect(await moveSection(db, older, 'up')).toBe(false);
	});

	it('update without kind keeps it; with kind converts', async () => {
		const db = sqliteD1();
		const id = await createSection(db, { title: 'U', body: '', visibility: 'public', kind: 'update', publishedAt: '2026-10-01' }, BY);
		const u = (await getSection(db, id))!;
		expect(await updateSection(db, id, { title: 'U2', body: '', visibility: 'public' }, BY, u.updatedAt)).toBe('ok');
		const kept = (await getSection(db, id))!;
		expect([kept.kind, kept.publishedAt]).toEqual(['update', '2026-10-01']);
		expect(await updateSection(db, id, { title: 'U2', body: '', visibility: 'public', kind: 'section', publishedAt: null }, BY, kept.updatedAt)).toBe('ok');
		const converted = (await getSection(db, id))!;
		expect([converted.kind, converted.publishedAt]).toEqual(['section', null]);
		expect((await listSections(db)).at(-1)?.id).toBe(id);
	});

	it('retreatToday is the Pacific calendar date', () => {
		expect(retreatToday(new Date('2026-11-02T03:00:00Z'))).toBe('2026-11-01');
		expect(retreatToday(new Date('2026-11-02T09:00:00Z'))).toBe('2026-11-02');
	});
});
```

Run: `pnpm vitest run src/lib/server/site/sections.test.ts`
Expected: FAIL — `listUpdates`/`retreatToday` not exported; `kind` missing from the validated value.

- [ ] **Step 2: Implement** — replace `src/lib/server/site/sections.ts` with

```ts
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
 * `kind`/`publishedAt` omitted → left as they are.
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
```

Run: `pnpm vitest run src/lib/server/site` → PASS (photos/page tests are unaffected: they only create sections).

- [ ] **Step 3: Failing test for Bluesky posts** — `src/lib/server/site/bsky-posts.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { sqliteD1 } from '$lib/server/test/sqlite-d1';
import {
	addBskyPost,
	hydrateBskyPosts,
	listBskyPostUris,
	parsePostUrl,
	postUriFromUrl,
	removeBskyPost,
	type FetchLike
} from './bsky-posts';

const DID = 'did:plc:abcdefghijklmnopqrstuvwx';
const uriFor = (rkey: string) => `at://${DID}/app.bsky.feed.post/${rkey}`;

function post(rkey: string, extra: Record<string, unknown> = {}, record: Record<string, unknown> = {}) {
	return {
		uri: uriFor(rkey),
		cid: 'bafyfake',
		author: { did: DID, handle: 'alice.test', displayName: 'Alice', avatar: 'https://cdn.bsky.app/img/avatar/plain/a@jpeg' },
		record: { $type: 'app.bsky.feed.post', text: 'hello', createdAt: '2026-10-10T17:00:00.000Z', ...record },
		indexedAt: '2026-10-10T17:00:01.000Z',
		...extra
	};
}

function fakeFetch(handler: (url: URL) => unknown) {
	const calls: URL[] = [];
	const fn: FetchLike = async (input) => {
		const url = new URL(input);
		calls.push(url);
		const body = handler(url);
		if (body instanceof Response) return body;
		return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
	};
	return { fn, calls };
}

function memoryKv() {
	const store = new Map<string, string>();
	return {
		store,
		kv: {
			get: async (k: string) => store.get(k) ?? null,
			put: async (k: string, v: string) => {
				store.set(k, v);
			}
		}
	};
}

describe('parsePostUrl', () => {
	it('accepts handle and DID forms', () => {
		expect(parsePostUrl('https://bsky.app/profile/alice.bsky.social/post/3l6oveex3ii2l')).toEqual({ actor: 'alice.bsky.social', rkey: '3l6oveex3ii2l' });
		expect(parsePostUrl(` https://bsky.app/profile/${DID}/post/3l6oveex3ii2l/ `)).toEqual({ actor: DID, rkey: '3l6oveex3ii2l' });
		expect(parsePostUrl('https://bsky.app/profile/did%3Aplc%3Aabcdefghijklmnopqrstuvwx/post/3l6oveex3ii2l')).toEqual({ actor: DID, rkey: '3l6oveex3ii2l' });
	});

	it('rejects everything else', () => {
		for (const bad of [
			'http://bsky.app/profile/alice.bsky.social/post/3l6oveex3ii2l',
			'https://bsky.app.evil.com/profile/alice.bsky.social/post/3l6oveex3ii2l',
			'https://evil.com/https://bsky.app/profile/alice.bsky.social/post/3l6oveex3ii2l',
			'https://x@bsky.app/profile/alice.bsky.social/post/3l6oveex3ii2l',
			'https://bsky.app:8443/profile/alice.bsky.social/post/3l6oveex3ii2l',
			'https://bsky.app/profile/alice.bsky.social/post/3l6oveex3ii2l?ref=x',
			'https://bsky.app/profile/alice.bsky.social/post/3l6oveex3ii2l#x',
			'https://bsky.app/profile/alice.bsky.social/post/3l6oveex3ii2l/extra',
			'https://bsky.app/profile/alice.bsky.social/feed/3l6oveex3ii2l',
			'https://bsky.app/profile/alice.bsky.social/post/..',
			'https://bsky.app/profile/alice.bsky.social/post/a%2Fb',
			'https://bsky.app/profile/localhost/post/3l6oveex3ii2l',
			'https://bsky.app/profile/did:example:123/post/3l6oveex3ii2l',
			'javascript:alert(1)',
			''
		]) {
			expect(parsePostUrl(bad), bad).toBeNull();
		}
	});
});

describe('postUriFromUrl', () => {
	it('resolves a handle through the fixed appview host only', async () => {
		const { fn, calls } = fakeFetch(() => ({ did: DID }));
		expect(await postUriFromUrl('https://bsky.app/profile/Alice.bsky.social/post/3l6oveex3ii2l', fn)).toBe(uriFor('3l6oveex3ii2l'));
		expect(calls).toHaveLength(1);
		expect(calls[0].origin).toBe('https://public.api.bsky.app');
		expect(calls[0].pathname).toBe('/xrpc/com.atproto.identity.resolveHandle');
		expect(calls[0].searchParams.get('handle')).toBe('alice.bsky.social');
	});

	it('uses a DID directly without fetching', async () => {
		const { fn, calls } = fakeFetch(() => ({}));
		expect(await postUriFromUrl(`https://bsky.app/profile/${DID}/post/3l6oveex3ii2l`, fn)).toBe(uriFor('3l6oveex3ii2l'));
		expect(calls).toHaveLength(0);
	});

	it('returns null when the resolver fails or answers nonsense', async () => {
		const failing: FetchLike = async () => { throw new Error('down'); };
		expect(await postUriFromUrl('https://bsky.app/profile/alice.bsky.social/post/3l6oveex3ii2l', failing)).toBeNull();
		const junk = fakeFetch(() => ({ did: 'https://evil.example' })).fn;
		expect(await postUriFromUrl('https://bsky.app/profile/alice.bsky.social/post/3l6oveex3ii2l', junk)).toBeNull();
	});
});

describe('hydrateBskyPosts', () => {
	it('maps to a safe view: http(s) link facets by byte offset, https thumbs, max 4', async () => {
		const images = Array.from({ length: 5 }, (_, i) => ({ thumb: `https://cdn.bsky.app/img/feed_thumbnail/plain/x/${i}@jpeg`, fullsize: 'https://cdn.bsky.app/f', alt: `pic ${i}` }));
		images[1] = { ...images[1], thumb: 'http://insecure.example/x.jpg' };
		const store = new Map<string, unknown>([
			[
				uriFor('one'),
				post(
					'one',
					{ embed: { $type: 'app.bsky.embed.images#view', images } },
					{
						text: '👋 docs: example.com/x',
						facets: [
							{ index: { byteStart: 11, byteEnd: 24 }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'https://example.com/x' }] }
						]
					}
				)
			],
			[
				uriFor('two'),
				post('two', {}, {
					text: 'click me',
					facets: [{ index: { byteStart: 0, byteEnd: 5 }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'javascript:alert(1)' }] }]
				})
			]
		]);
		const { fn } = fakeFetch((url) => ({ posts: url.searchParams.getAll('uris').map((u) => store.get(u)).filter(Boolean) }));
		const views = await hydrateBskyPosts([uriFor('one'), uriFor('two')], { fetch: fn });
		const one = views.get(uriFor('one'))!;
		expect(one.segments).toEqual([
			{ text: '👋 docs: ', href: null },
			{ text: 'example.com/x', href: 'https://example.com/x' }
		]);
		expect(one.images.map((i) => i.alt)).toEqual(['pic 0', 'pic 2', 'pic 3']);
		expect(one.url).toBe(`https://bsky.app/profile/${DID}/post/one`);
		expect(one.author).toEqual({ did: DID, handle: 'alice.test', displayName: 'Alice', avatar: 'https://cdn.bsky.app/img/avatar/plain/a@jpeg' });
		expect(one.createdAt).toBe('2026-10-10T17:00:00.000Z');
		expect(views.get(uriFor('two'))!.segments).toEqual([{ text: 'click me', href: null }]);
	});

	it('batches at most 25 uris per request against the fixed host', async () => {
		const uris = Array.from({ length: 30 }, (_, i) => uriFor(`p${i}`));
		const { fn, calls } = fakeFetch((url) => ({ posts: url.searchParams.getAll('uris').map((u) => post(u.split('/').pop()!)) }));
		const views = await hydrateBskyPosts(uris, { fetch: fn });
		expect(views.size).toBe(30);
		expect(calls.map((c) => c.searchParams.getAll('uris').length)).toEqual([25, 5]);
		expect(calls.every((c) => c.origin === 'https://public.api.bsky.app' && c.pathname === '/xrpc/app.bsky.feed.getPosts')).toBe(true);
	});

	it('caches hits and definitive misses for an hour; omits missing posts', async () => {
		const { store, kv } = memoryKv();
		const { fn, calls } = fakeFetch(() => ({ posts: [post('here')] }));
		const first = await hydrateBskyPosts([uriFor('here'), uriFor('gone')], { fetch: fn, kv });
		expect([...first.keys()]).toEqual([uriFor('here')]);
		expect(store.size).toBe(2);
		const second = await hydrateBskyPosts([uriFor('here'), uriFor('gone')], { fetch: fn, kv });
		expect([...second.keys()]).toEqual([uriFor('here')]);
		expect(calls).toHaveLength(1);
	});

	it('a failed request returns nothing and caches nothing', async () => {
		const { store, kv } = memoryKv();
		const failing: FetchLike = async () => { throw new Error('timeout'); };
		expect((await hydrateBskyPosts([uriFor('x')], { fetch: failing, kv })).size).toBe(0);
		const http500 = fakeFetch(() => new Response('no', { status: 500 })).fn;
		expect((await hydrateBskyPosts([uriFor('x')], { fetch: http500, kv })).size).toBe(0);
		expect(store.size).toBe(0);
	});

	it('ignores stored uris that are not post at-uris', async () => {
		const { fn, calls } = fakeFetch(() => ({ posts: [] }));
		expect((await hydrateBskyPosts(['https://evil.example/x', `at://${DID}/app.bsky.actor.profile/self`], { fetch: fn })).size).toBe(0);
		expect(calls).toHaveLength(0);
	});
});

describe('site_bsky_posts', () => {
	it('adds once, lists newest first, removes', async () => {
		const db = sqliteD1();
		expect(await addBskyPost(db, uriFor('a'), 'did:plc:org1')).toBe('added');
		await new Promise((r) => setTimeout(r, 5));
		expect(await addBskyPost(db, uriFor('b'), 'did:plc:org1')).toBe('added');
		expect(await addBskyPost(db, uriFor('a'), 'did:plc:org1')).toBe('exists');
		expect(await listBskyPostUris(db)).toEqual([uriFor('b'), uriFor('a')]);
		expect(await removeBskyPost(db, uriFor('a'))).toBe(true);
		expect(await removeBskyPost(db, uriFor('a'))).toBe(false);
	});
});
```

Run: `pnpm vitest run src/lib/server/site/bsky-posts.test.ts`
Expected: FAIL — cannot resolve `./bsky-posts`.

- [ ] **Step 4: Implement** — `src/lib/server/site/bsky-posts.ts`

```ts
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

/**
 * Bluesky posts in the retreat posts stream (migration 0011).
 *
 * SSRF rule: the only host this module ever fetches is APPVIEW, with
 * organizer input reduced to validated identifiers and passed as encoded
 * query parameters. No URL derived from input is fetched. Every request has
 * a timeout; anything that doesn't resolve is omitted silently.
 */

export const APPVIEW = 'https://public.api.bsky.app';
const CACHE_TTL = 3600;
const CACHE_PREFIX = 'bskypost:v1:';
const BATCH = 25;

export type FetchLike = (input: string, init?: { signal?: AbortSignal }) => Promise<Response>;

export interface KvLike {
	get(key: string): Promise<string | null>;
	put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

/** Narrow the Workers KV binding to the two calls this module makes. */
export function kvLike(kv: KVNamespace | undefined): KvLike | undefined {
	if (!kv) return undefined;
	return {
		get: (key) => kv.get(key),
		put: (key, value, options) => kv.put(key, value, options)
	};
}

const HANDLE_RE = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const DID_SRC = 'did:(?:plc:[a-z2-7]{24}|web:[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?)';
const DID_RE = new RegExp(`^${DID_SRC}$`);
/** atproto record-key grammar; "." and ".." are excluded separately. */
const RKEY_SRC = '[A-Za-z0-9._:~-]{1,512}';
const RKEY_RE = new RegExp(`^${RKEY_SRC}$`);
const POST_URL_RE = /^https:\/\/bsky\.app\/profile\/([^/?#\s]+)\/post\/([^/?#\s]+)\/?$/;
const AT_URI_RE = new RegExp(`^at://(${DID_SRC})/app\\.bsky\\.feed\\.post/(${RKEY_SRC})$`);

const validRkey = (r: string) => RKEY_RE.test(r) && r !== '.' && r !== '..';

/** Strictly `https://bsky.app/profile/<handle|did>/post/<rkey>` (optional trailing slash). */
export function parsePostUrl(input: string): { actor: string; rkey: string } | null {
	const trimmed = input.trim();
	if (trimmed.length > 800) return null;
	const m = POST_URL_RE.exec(trimmed);
	if (!m) return null;
	let actor: string;
	try {
		actor = decodeURIComponent(m[1]);
	} catch {
		return null;
	}
	const rkey = m[2];
	if (!validRkey(rkey)) return null;
	if (DID_RE.test(actor)) return { actor, rkey };
	if (HANDLE_RE.test(actor)) return { actor: actor.toLowerCase(), rkey };
	return null;
}

/** DID as-is; handle via the appview's resolveHandle. Null on any failure. */
export async function resolveDid(actor: string, fetchFn: FetchLike): Promise<string | null> {
	if (DID_RE.test(actor)) return actor;
	if (!HANDLE_RE.test(actor)) return null;
	try {
		const res = await fetchFn(
			`${APPVIEW}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(actor.toLowerCase())}`,
			{ signal: AbortSignal.timeout(3000) }
		);
		if (!res.ok) return null;
		const data = (await res.json()) as { did?: unknown };
		return typeof data.did === 'string' && DID_RE.test(data.did) ? data.did : null;
	} catch {
		return null;
	}
}

export async function postUriFromUrl(input: string, fetchFn: FetchLike): Promise<string | null> {
	const parsed = parsePostUrl(input);
	if (!parsed) return null;
	const did = await resolveDid(parsed.actor, fetchFn);
	return did ? `at://${did}/app.bsky.feed.post/${parsed.rkey}` : null;
}

export interface BskyPostView {
	uri: string;
	/** Web link, built from the DID and rkey — never from response text. */
	url: string;
	createdAt: string;
	author: { did: string; handle: string | null; displayName: string | null; avatar: string | null };
	/** Text split at link facets; render as text nodes, never {@html}. */
	segments: Array<{ text: string; href: string | null }>;
	images: Array<{ thumb: string; alt: string }>;
}

const obj = (v: unknown): Record<string, unknown> | null =>
	v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

function safeUrl(v: unknown, protocols: readonly string[]): string | null {
	if (typeof v !== 'string' || v.length > 2048) return null;
	try {
		const u = new URL(v);
		return protocols.includes(u.protocol) ? u.href : null;
	} catch {
		return null;
	}
}

function isoOrNull(v: string | null): string | null {
	if (!v) return null;
	const t = Date.parse(v);
	return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function cleanName(v: unknown): string | null {
	const s = str(v)?.replace(/\s+/g, ' ').trim().slice(0, 64);
	return s || null;
}

/** Facet offsets are UTF-8 byte offsets into the text. */
function segmentsFrom(text: string, facets: unknown): BskyPostView['segments'] {
	const bytes = new TextEncoder().encode(text);
	const decoder = new TextDecoder();
	const links: Array<{ start: number; end: number; href: string }> = [];
	for (const f of Array.isArray(facets) ? facets : []) {
		const facet = obj(f);
		const index = obj(facet?.index);
		const start = index?.byteStart;
		const end = index?.byteEnd;
		if (typeof start !== 'number' || typeof end !== 'number' || !Number.isInteger(start) || !Number.isInteger(end)) continue;
		if (start < 0 || end > bytes.length || start >= end) continue;
		const features = Array.isArray(facet?.features) ? facet.features : [];
		const link = features.map(obj).find((x) => x?.$type === 'app.bsky.richtext.facet#link');
		const href = safeUrl(link?.uri, ['http:', 'https:']);
		if (href) links.push({ start, end, href });
	}
	links.sort((a, b) => a.start - b.start);
	const out: BskyPostView['segments'] = [];
	let at = 0;
	for (const l of links) {
		if (l.start < at) continue; // overlapping facet — keep the first
		if (l.start > at) out.push({ text: decoder.decode(bytes.slice(at, l.start)), href: null });
		out.push({ text: decoder.decode(bytes.slice(l.start, l.end)), href: l.href });
		at = l.end;
	}
	if (at < bytes.length) out.push({ text: decoder.decode(bytes.slice(at)), href: null });
	return out;
}

function imagesFrom(embed: unknown): BskyPostView['images'] {
	let e = obj(embed);
	if (e?.$type === 'app.bsky.embed.recordWithMedia#view') e = obj(e.media);
	if (!e || e.$type !== 'app.bsky.embed.images#view' || !Array.isArray(e.images)) return [];
	const out: BskyPostView['images'] = [];
	for (const raw of e.images.slice(0, 4)) {
		const img = obj(raw);
		const thumb = safeUrl(img?.thumb, ['https:']);
		if (thumb) out.push({ thumb, alt: (str(img?.alt) ?? '').slice(0, 2000) });
	}
	return out;
}

function toView(raw: unknown): BskyPostView | null {
	const p = obj(raw);
	const uri = str(p?.uri);
	const m = uri ? AT_URI_RE.exec(uri) : null;
	const author = obj(p?.author);
	const record = obj(p?.record);
	if (!p || !uri || !m || !author || !record) return null;
	const did = str(author.did);
	if (did !== m[1]) return null;
	const createdAt = isoOrNull(str(record.createdAt)) ?? isoOrNull(str(p.indexedAt));
	if (!createdAt) return null;
	const handle = str(author.handle);
	return {
		uri,
		url: `https://bsky.app/profile/${did}/post/${m[2]}`,
		createdAt,
		author: {
			did,
			handle: handle && handle !== 'handle.invalid' && HANDLE_RE.test(handle) ? handle.toLowerCase() : null,
			displayName: cleanName(author.displayName),
			avatar: safeUrl(author.avatar, ['https:'])
		},
		segments: segmentsFrom((str(record.text) ?? '').slice(0, 3000), record.facets),
		images: imagesFrom(p.embed)
	};
}

type Cached = BskyPostView | 'gone';

async function cacheGet(kv: KvLike | undefined, uri: string): Promise<Cached | null> {
	if (!kv) return null;
	try {
		const raw = await kv.get(CACHE_PREFIX + uri);
		if (!raw) return null;
		const v = JSON.parse(raw) as unknown;
		if (v === 'gone') return 'gone';
		return obj(v)?.uri === uri ? (v as BskyPostView) : null;
	} catch {
		return null;
	}
}

async function cachePut(kv: KvLike | undefined, uri: string, value: Cached): Promise<void> {
	if (!kv) return;
	try {
		await kv.put(CACHE_PREFIX + uri, JSON.stringify(value), { expirationTtl: CACHE_TTL });
	} catch (e) {
		console.error('bsky post cache write failed', e);
	}
}

/**
 * Hydrate stored post URIs into view models: KV first, then
 * app.bsky.feed.getPosts in batches of 25. Posts the appview doesn't return
 * are negative-cached; failed requests cache nothing.
 */
export async function hydrateBskyPosts(
	uris: string[],
	deps: { fetch: FetchLike; kv?: KvLike }
): Promise<Map<string, BskyPostView>> {
	const out = new Map<string, BskyPostView>();
	const valid = [...new Set(uris)].filter((u) => AT_URI_RE.test(u));
	const cached = await Promise.all(valid.map((u) => cacheGet(deps.kv, u)));
	const misses: string[] = [];
	valid.forEach((u, i) => {
		const hit = cached[i];
		if (hit === 'gone') return;
		if (hit) out.set(u, hit);
		else misses.push(u);
	});

	for (let i = 0; i < misses.length; i += BATCH) {
		const batch = misses.slice(i, i + BATCH);
		const qs = new URLSearchParams();
		for (const u of batch) qs.append('uris', u);
		let posts: unknown[];
		try {
			const res = await deps.fetch(`${APPVIEW}/xrpc/app.bsky.feed.getPosts?${qs.toString()}`, {
				signal: AbortSignal.timeout(4000)
			});
			if (!res.ok) continue;
			const body = obj(await res.json());
			posts = Array.isArray(body?.posts) ? body.posts : [];
		} catch (e) {
			console.error('bsky getPosts failed', e);
			continue;
		}
		for (const raw of posts) {
			const view = toView(raw);
			if (view && batch.includes(view.uri)) out.set(view.uri, view);
		}
		// The appview answered: anything it didn't return is gone (for an hour).
		await Promise.all(batch.map((u) => cachePut(deps.kv, u, out.get(u) ?? 'gone')));
	}
	return out;
}

export async function listBskyPostUris(db: D1Database): Promise<string[]> {
	const { results } = await db
		.prepare(`SELECT uri FROM site_bsky_posts ORDER BY added_at DESC, uri`)
		.all<{ uri: string }>();
	return results.map((r) => r.uri);
}

export async function addBskyPost(db: D1Database, uri: string, by: string): Promise<'added' | 'exists'> {
	const res = await db
		.prepare(`INSERT INTO site_bsky_posts (uri, added_at, added_by) VALUES (?1, ?2, ?3) ON CONFLICT(uri) DO NOTHING`)
		.bind(uri, new Date().toISOString(), by)
		.run();
	return (res.meta.changes ?? 0) > 0 ? 'added' : 'exists';
}

export async function removeBskyPost(db: D1Database, uri: string): Promise<boolean> {
	const res = await db.prepare(`DELETE FROM site_bsky_posts WHERE uri = ?1`).bind(uri).run();
	return (res.meta.changes ?? 0) > 0;
}

/** Console list row: unresolvable posts stay listed (so they can be removed). */
export interface BskyConsoleItem {
	uri: string;
	url: string | null;
	author: string | null;
	excerpt: string | null;
}

export function consoleItems(uris: string[], views: Map<string, BskyPostView>): BskyConsoleItem[] {
	return uris.map((uri) => {
		const v = views.get(uri);
		if (!v) return { uri, url: null, author: null, excerpt: null };
		return {
			uri,
			url: v.url,
			author: v.author.handle ? `@${v.author.handle}` : v.author.did,
			excerpt: v.segments.map((s) => s.text).join('').slice(0, 120)
		};
	});
}
```

Run: `pnpm vitest run src/lib/server/site/bsky-posts.test.ts`
Expected: PASS.

- [ ] **Step 5: Failing tests for the stream** — `src/lib/server/site/page.test.ts`

Add to the imports:
```ts
import type { FetchLike } from './bsky-posts';
```
Append inside `describe('loadSite', …)`:
```ts
	it('merges visible updates and Bluesky posts newest first; updates leave the page flow', async () => {
		const d = await db();
		await createSection(d, { title: 'Old news', body: 'public update', visibility: 'public', kind: 'update', publishedAt: '2026-10-01' }, ORGS);
		await createSection(d, { title: 'Invited news', body: 'invited **secret** update', visibility: 'invited', kind: 'update', publishedAt: '2026-10-20' }, ORGS);
		await createSection(d, { title: 'Draft news', body: 'hidden', visibility: 'hidden', kind: 'update', publishedAt: '2026-10-25' }, ORGS);
		const did = 'did:plc:abcdefghijklmnopqrstuvwx';
		const live = `at://${did}/app.bsky.feed.post/3l6oveex3ii2l`;
		const gone = `at://${did}/app.bsky.feed.post/3l6oveex3ii2m`;
		await d.prepare(`INSERT INTO site_bsky_posts (uri, added_at, added_by) VALUES (?1, ?3, ?4), (?2, ?3, ?4)`).bind(live, gone, '2026-10-11T00:00:00Z', ORGS).run();
		const fetchFn: FetchLike = async () =>
			new Response(
				JSON.stringify({
					posts: [
						{
							uri: live,
							author: { did, handle: 'alice.test' },
							record: { text: 'see you there', createdAt: '2026-10-10T17:00:00.000Z' }
						}
					]
				}),
				{ status: 200 }
			);
		const bsky = { fetch: fetchFn };

		const pub = await loadSite({ ...base, db: d, who: null, bsky });
		expect(pub.posts.map((p) => (p.kind === 'update' ? p.update.title : p.post.uri))).toEqual([live, 'Old news']);
		expect(pub.posts.map((p) => p.dateLabel)).toEqual(['Oct 10, 2026', 'Oct 1, 2026']);
		expect(pub.sections.some((s) => s.title.includes('news'))).toBe(false);
		expect(JSON.stringify(pub)).not.toContain('secret');

		const inv = await loadSite({ ...base, db: d, who: { did: 'did:plc:inv', handle: null }, bsky });
		expect(inv.posts.map((p) => (p.kind === 'update' ? p.update.title : 'bsky'))).toEqual(['Invited news', 'bsky', 'Old news']);
		expect(JSON.stringify(inv)).not.toContain('Draft news');
	});

	it('without a Bluesky fetcher (or when it fails) the stream still shows updates', async () => {
		const d = await db();
		await createSection(d, { title: 'Hello', body: 'x', visibility: 'public', kind: 'update', publishedAt: '2026-10-01' }, ORGS);
		await d.prepare(`INSERT INTO site_bsky_posts (uri, added_at, added_by) VALUES (?1, ?2, ?3)`).bind('at://did:plc:abcdefghijklmnopqrstuvwx/app.bsky.feed.post/abc', '2026-10-11T00:00:00Z', ORGS).run();
		const failing: FetchLike = async () => { throw new Error('down'); };
		for (const bsky of [undefined, { fetch: failing }]) {
			const site = await loadSite({ ...base, db: d, who: null, bsky });
			expect(site.posts.map((p) => p.kind)).toEqual(['update']);
		}
	});
```
And extend the `'a failed read degrades…'` expectation to `toMatchObject({ unavailable: true, sections: [], attendees: [], posts: [] })`.

Run: `pnpm vitest run src/lib/server/site/page.test.ts`
Expected: FAIL — `site.posts` undefined.

- [ ] **Step 6: Implement** — replace `src/lib/server/site/page.ts` with

```ts
import type { D1Database } from '@cloudflare/workers-types';
import { renderMarkdown } from '$lib/markdown/render';
import { retreat, siteHome } from '$lib/content';
import { pageTier, viewerTier } from './tier';
import { listSections, listUpdates, visibleTo, type Section } from './sections';
import { photosFor, type Photo } from './photos';
import { hydrateAttendees, shownAttendees, type AttendeeView, type ProfileLoader } from './featured';
import { hydrateBskyPosts, listBskyPostUris, type BskyPostView, type FetchLike, type KvLike } from './bsky-posts';

export interface SitePhotoView {
	id: string;
	alt: string;
	width: number;
	height: number;
	src: string;
}

export interface SiteSectionView {
	id: number;
	title: string;
	html: string;
	visibility: 'public' | 'invited';
	photos: SitePhotoView[];
}

interface PostBase {
	key: string;
	/** ISO instant used for newest-first ordering. */
	sortKey: string;
	/** Machine date for <time datetime>. */
	datetime: string;
	dateLabel: string;
}

export type SitePostView =
	| (PostBase & { kind: 'update'; update: SiteSectionView })
	| (PostBase & { kind: 'bsky'; post: BskyPostView });

export interface SiteData {
	tier: 'public' | 'invited';
	/** True for organizers — the page shows "Edit retreat info" and preview links. */
	organizer: boolean;
	sections: SiteSectionView[];
	/** Who's coming: curated, still-confirmed registrants. Public at every tier. */
	attendees: AttendeeView[];
	/** Updates the viewer may see + Bluesky posts (public), newest first. */
	posts: SitePostView[];
	/** The section read failed: render hero + strip + a quiet "more soon". */
	unavailable: boolean;
	/** Link-preview tags, built from public content only. */
	preview: { title: string; description: string; image: string };
}

const plain = (markdown: string) =>
	markdown
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
		.replace(/[*_#>`]/g, '')
		.replace(/\s+/g, ' ')
		.trim();

function previewFrom(publicSections: Section[], origin: string): SiteData['preview'] {
	const first = publicSections.find((s) => s.body.trim());
	const description = (first ? plain(first.body) : siteHome.fallbackDescription).slice(0, 200);
	return { title: retreat.name, description, image: `${origin}/media/hero-landscape.png` };
}

function sectionView(s: Section, photos: Map<number, Photo[]>): SiteSectionView {
	return {
		id: s.id,
		title: s.title,
		html: renderMarkdown(s.body),
		visibility: s.visibility === 'public' ? 'public' : 'invited',
		photos: (photos.get(s.id) ?? [])
			.filter((p) => p.alt)
			.map((p) => ({ id: p.id, alt: p.alt, width: p.width, height: p.height, src: `/media/site/${p.id}` }))
	};
}

// Updates carry a calendar date (format it in UTC so it never shifts);
// Bluesky posts carry an instant (format it at the retreat, Pacific).
const dayLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const instantLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' });

/** Who's coming never breaks the page: any failure renders no cards. */
async function loadAttendees(db: D1Database, profiles: ProfileLoader | undefined): Promise<AttendeeView[]> {
	try {
		return await hydrateAttendees(await shownAttendees(db), profiles);
	} catch (e) {
		console.error('who’s coming load failed', e);
		return [];
	}
}

/** The stream never breaks the page: a failure renders no posts. */
async function loadPosts(
	db: D1Database,
	tier: 'public' | 'invited',
	bsky: { fetch: FetchLike; kv?: KvLike } | undefined
): Promise<SitePostView[]> {
	try {
		const updates = visibleTo(await listUpdates(db), tier);
		const photos = await photosFor(db, updates.map((u) => u.id));
		const items: SitePostView[] = updates.map((u): SitePostView => {
			const day = u.publishedAt ?? u.updatedAt.slice(0, 10);
			return {
				kind: 'update',
				key: `u:${u.id}`,
				sortKey: `${day}T23:59:59.999Z`,
				datetime: day,
				dateLabel: dayLabel.format(new Date(`${day}T12:00:00Z`)),
				update: sectionView(u, photos)
			};
		});
		if (bsky) {
			const uris = await listBskyPostUris(db);
			const views = await hydrateBskyPosts(uris, bsky);
			for (const uri of uris) {
				const post = views.get(uri);
				if (!post) continue;
				items.push({
					kind: 'bsky',
					key: `b:${uri}`,
					sortKey: post.createdAt,
					datetime: post.createdAt,
					dateLabel: instantLabel.format(new Date(post.createdAt)),
					post
				});
			}
		}
		return items.sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0));
	} catch (e) {
		console.error('posts stream load failed', e);
		return [];
	}
}

export async function loadSite(input: {
	db: D1Database | undefined;
	organizerDids: string | undefined;
	origin: string;
	who: { did: string; handle: string | null } | null;
	asParam: string | null;
	/** Bluesky profile loader for attendee cards; omitted → registration handles only. */
	profiles?: ProfileLoader;
	/** Fixed-host Bluesky fetcher + KV cache for the stream; omitted → updates only. */
	bsky?: { fetch: FetchLike; kv?: KvLike };
}): Promise<SiteData> {
	const actual = await viewerTier(input.db, input.organizerDids, input.who);
	const tier = pageTier(actual, input.asParam);
	const organizer = actual === 'organizer';
	const empty = { title: retreat.name, description: siteHome.fallbackDescription, image: `${input.origin}/media/hero-landscape.png` };
	if (!input.db) return { tier, organizer, sections: [], attendees: [], posts: [], unavailable: true, preview: empty };
	const [attendees, posts] = await Promise.all([
		loadAttendees(input.db, input.profiles),
		loadPosts(input.db, tier, input.bsky)
	]);
	try {
		const all = await listSections(input.db);
		const shown = visibleTo(all, tier);
		const photos = await photosFor(input.db, shown.map((s) => s.id));
		return {
			tier,
			organizer,
			attendees,
			posts,
			unavailable: false,
			preview: previewFrom(visibleTo(all, 'public'), input.origin),
			sections: shown.map((s) => sectionView(s, photos))
		};
	} catch (e) {
		console.error('site sections load failed', e);
		return { tier, organizer, sections: [], attendees, posts, unavailable: true, preview: empty };
	}
}
```

Run: `pnpm vitest run src/lib/server/site` → PASS.

- [ ] **Step 7: Wire the stream into `/`** — `src/routes/+page.server.ts`

Add the import:
```ts
import { kvLike } from '$lib/server/site/bsky-posts';
```
In the `siteFor` constant from Task 9a, add one property after `profiles: attendeeProfiles`:
```ts
			profiles: attendeeProfiles,
			// Fixed host only (public.api.bsky.app), KV-cached for an hour.
			bsky: { fetch, kv: kvLike(platform?.env?.PROFILE_CACHE) }
```

- [ ] **Step 8: Copy** — `src/lib/content.ts`: in `siteHome`, replace `	whosComing: 'Who’s coming',` with
```ts
	whosComing: 'Who’s coming',
	postsHeading: 'Posts',
	viewOnBluesky: 'View on Bluesky',
```

- [ ] **Step 9: `src/lib/site/BskyPost.svelte`**

```svelte
<script lang="ts">
	import type { BskyPostView } from '$lib/server/site/bsky-posts';
	import { siteHome } from '$lib/content';

	let { post, datetime, dateLabel }: { post: BskyPostView; datetime: string; dateLabel: string } = $props();

	// handle is validated server-side; the DID fallback is a valid path segment.
	const profileHref = $derived(`https://bsky.app/profile/${post.author.handle ?? post.author.did}`);
</script>

<article class="bsky-post">
	<header class="author">
		{#if post.author.avatar}
			<img class="avatar" src={post.author.avatar} alt="" width="40" height="40" loading="lazy" decoding="async" referrerpolicy="no-referrer" />
		{/if}
		<div class="who">
			{#if post.author.displayName}<span class="name">{post.author.displayName}</span>{/if}
			<a class="handle" href={profileHref} rel="noopener">{post.author.handle ? `@${post.author.handle}` : post.author.did}</a>
		</div>
	</header>
	<!-- Text nodes only: segments are escaped by Svelte; links are http(s) facets. -->
	<p class="text">{#each post.segments as seg, i (i)}{#if seg.href}<a href={seg.href} rel="noopener nofollow ugc">{seg.text}</a>{:else}{seg.text}{/if}{/each}</p>
	{#if post.images.length}
		<ul class="images" class:single={post.images.length === 1}>
			{#each post.images as img, i (i)}
				<li><img src={img.thumb} alt={img.alt} loading="lazy" decoding="async" referrerpolicy="no-referrer" /></li>
			{/each}
		</ul>
	{/if}
	<footer class="meta">
		<time {datetime}>{dateLabel}</time> · <a href={post.url} rel="noopener">{siteHome.viewOnBluesky}</a>
	</footer>
</article>

<style>
	.bsky-post { display: flex; flex-direction: column; gap: var(--space-2); }
	.author { display: flex; align-items: center; gap: var(--space-2); }
	.avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex: none; }
	.who { display: flex; flex-direction: column; min-width: 0; }
	.name { color: var(--ink); }
	.handle { color: var(--ink-70); font-size: 0.875rem; overflow-wrap: anywhere; }
	.text { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.6; max-width: 62ch; }
	.text a { color: var(--ink); text-decoration: underline; }
	.images { list-style: none; display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-1); max-width: 36rem; }
	.images.single { grid-template-columns: 1fr; }
	.images img { display: block; width: 100%; height: auto; border-radius: 4px; }
	.meta { font-size: 0.8125rem; color: var(--ink-70); }
	.meta a { color: var(--ink); }
</style>
```

- [ ] **Step 10: `src/lib/site/PostsStream.svelte`**

```svelte
<script lang="ts">
	import type { SitePostView } from '$lib/server/site/page';
	import { siteHome } from '$lib/content';
	import BskyPost from '$lib/site/BskyPost.svelte';
	import PhotoGallery from '$lib/site/PhotoGallery.svelte';

	let { posts }: { posts: SitePostView[] } = $props();
</script>

{#if posts.length}
	<section class="posts" aria-labelledby="posts-title">
		<h2 class="display section-title" id="posts-title">{siteHome.postsHeading}</h2>
		<ol class="stream">
			{#each posts as item (item.key)}
				<li>
					{#if item.kind === 'update'}
						<article class="update" aria-labelledby={`u-${item.update.id}`}>
							<p class="kicker">
								<time datetime={item.datetime}>{item.dateLabel}</time>{#if item.update.visibility === 'invited'} · {siteHome.invitedOnlyLabel}{/if}
							</p>
							<h3 class="update-title" id={`u-${item.update.id}`}>{item.update.title}</h3>
							<!-- Rendered by markdown-it with html:false on the server; safe to inject. -->
							<div class="prose">{@html item.update.html}</div>
							<PhotoGallery photos={item.update.photos} />
						</article>
					{:else}
						<BskyPost post={item.post} datetime={item.datetime} dateLabel={item.dateLabel} />
					{/if}
				</li>
			{/each}
		</ol>
	</section>
{/if}

<style>
	.posts { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-5) 0; border-top: var(--hairline); }
	.section-title { font-size: clamp(1.6rem, 5vw, 2.4rem); }
	.stream { list-style: none; display: flex; flex-direction: column; }
	.stream > li { padding: var(--space-4) 0; border-top: var(--hairline); }
	.stream > li:first-child { border-top: none; padding-top: 0; }
	.update { display: flex; flex-direction: column; gap: var(--space-2); }
	.kicker { color: var(--ink-70); }
	.update-title { font-size: 1.25rem; color: var(--ink); }
	.prose { max-width: 62ch; color: var(--ink-70); line-height: 1.6; }
	.prose :global(a) { color: var(--ink); text-decoration: underline; }
	.prose :global(ul), .prose :global(ol) { padding-left: 1.4rem; }
	.prose :global(p + p) { margin-top: var(--space-2); }
</style>
```

- [ ] **Step 11: Wire into the home** — `src/lib/site/RetreatHome.svelte`

Add to the imports:
```ts
	import PostsStream from '$lib/site/PostsStream.svelte';
```
Replace `	<WhosComing attendees={site.attendees} />` with
```svelte
	<WhosComing attendees={site.attendees} />
	<PostsStream posts={site.posts} />
```

- [ ] **Step 12: Console server** — `src/routes/organizer/retreat/+page.server.ts` (from Task 8)

Replace the `$lib/server/site/sections` import with:
```ts
import {
	createSection,
	listSections,
	listUpdates,
	moveSection,
	retreatToday,
	updateSection,
	validateSection
} from '$lib/server/site/sections';
import {
	addBskyPost,
	consoleItems,
	hydrateBskyPosts,
	kvLike,
	listBskyPostUris,
	postUriFromUrl,
	removeBskyPost
} from '$lib/server/site/bsky-posts';
```

Replace the whole `load` with:
```ts
export const load: PageServerLoad = async ({ locals, platform }) => {
	requireOrganizer(locals, platform);
	const db = platform?.env?.DB;
	if (!db) error(503, { message: 'Storage is not available right now' });
	const [sections, updates, uris] = await Promise.all([listSections(db), listUpdates(db), listBskyPostUris(db)]);
	const photos = await photosFor(db, [...sections, ...updates].map((s) => s.id));
	const views = await hydrateBskyPosts(uris, { fetch, kv: kvLike(platform?.env?.PROFILE_CACHE) });
	return {
		sections: sections.map((s) => ({ ...s, photos: photos.get(s.id) ?? [] })),
		updates: updates.map((s) => ({ ...s, photos: photos.get(s.id) ?? [] })),
		today: retreatToday(),
		bskyPosts: consoleItems(uris, views),
		mediaConfigured: Boolean(platform?.env?.SITE_MEDIA)
	};
};
```

Replace the whole `create` action with:
```ts
	create: async ({ locals, platform, request }) => {
		const by = requireOrganizer(locals, platform);
		const db = platform?.env?.DB;
		if (!db) return fail(503, { message: 'Storage is not available right now' });
		const asUpdate = (await request.formData()).get('kind') === 'update';
		const id = await createSection(
			db,
			asUpdate
				? { title: 'New update', body: '', visibility: 'hidden', kind: 'update', publishedAt: retreatToday() }
				: { title: 'New section', body: '', visibility: 'hidden' },
			by
		);
		return { message: `${asUpdate ? 'Update' : 'Section'} added (hidden until you change who can see it)`, sectionId: id };
	},
```

In `save`, replace
```ts
		const checked = validateSection({ title: form.get('title'), body: form.get('body'), visibility: form.get('visibility') });
```
with
```ts
		const checked = validateSection({
			title: form.get('title'),
			body: form.get('body'),
			visibility: form.get('visibility'),
			kind: form.get('kind'),
			publishedAt: form.get('publishedAt')
		});
```

Insert directly before `	photoAlt: async ({ locals, platform, request }) => {`:
```ts
	bskyAdd: async ({ locals, platform, request }) => {
		const by = requireOrganizer(locals, platform);
		const db = platform?.env?.DB;
		if (!db) return fail(503, { message: 'Storage is not available right now', bsky: true });
		const raw = String((await request.formData()).get('url') ?? '');
		// Input becomes identifiers only; the fetches go to public.api.bsky.app.
		const uri = await postUriFromUrl(raw, fetch);
		if (!uri) {
			return fail(400, { message: 'Paste a post link like https://bsky.app/profile/name.bsky.social/post/…', bsky: true });
		}
		const views = await hydrateBskyPosts([uri], { fetch, kv: kvLike(platform?.env?.PROFILE_CACHE) });
		if (!views.has(uri)) {
			return fail(404, { message: 'Couldn’t load that post from Bluesky — check the link, or try again in a minute', bsky: true });
		}
		const r = await addBskyPost(db, uri, by);
		return { message: r === 'added' ? 'Post added to the stream' : 'That post is already in the stream', bsky: true };
	},

	bskyRemove: async ({ locals, platform, request }) => {
		requireOrganizer(locals, platform);
		const db = platform?.env?.DB;
		if (!db) return fail(503, { message: 'Storage is not available right now', bsky: true });
		const uri = String((await request.formData()).get('uri') ?? '');
		if (!(await removeBskyPost(db, uri))) return fail(404, { message: 'That post was already removed', bsky: true });
		return { message: 'Post removed from the stream', bsky: true };
	},

```

- [ ] **Step 13: `src/lib/site/console/BskyPostsManager.svelte`**

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import type { BskyConsoleItem } from '$lib/server/site/bsky-posts';

	let { posts, message }: { posts: BskyConsoleItem[]; message: string | null } = $props();
</script>

<div class="bsky">
	<h2 class="kicker">Bluesky posts in the stream</h2>
	<form method="POST" action="?/bskyAdd" use:enhance class="add">
		<label class="visually-hidden" for="bsky-url">Bluesky post link</label>
		<input id="bsky-url" name="url" type="url" required placeholder="https://bsky.app/profile/…/post/…" />
		<button class="btn-ghost">Add post</button>
	</form>
	{#if message}<p class="hint" role="status">{message}</p>{/if}
	{#if posts.length}
		<ul class="list">
			{#each posts as p (p.uri)}
				<li>
					{#if p.excerpt !== null}
						<span class="who">{p.author}</span>
						<span class="excerpt">{p.excerpt || '(no text)'}</span>
						{#if p.url}<a href={p.url} target="_blank" rel="noopener">open ↗</a>{/if}
					{:else}
						<span class="excerpt">Not loading from Bluesky right now — hidden on the site.</span>
					{/if}
					<form method="POST" action="?/bskyRemove" use:enhance>
						<input type="hidden" name="uri" value={p.uri} />
						<button class="btn-ghost">Remove</button>
					</form>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="hint">No posts yet.</p>
	{/if}
</div>

<style>
	.bsky { display: flex; flex-direction: column; gap: var(--space-2); margin-top: var(--space-4); }
	.add { display: flex; gap: var(--space-1); }
	.add input { flex: 1; min-width: 0; background: transparent; border: none; border-bottom: 1px solid var(--ink-45); color: var(--ink); font: inherit; padding: 0.4rem 0; }
	.list { list-style: none; display: flex; flex-direction: column; }
	li { display: flex; flex-direction: column; gap: 0.2rem; padding: 0.5rem 0; border-top: var(--hairline); }
	.who { font-size: 0.8125rem; color: var(--ink); }
	.excerpt { font-size: 0.8125rem; color: var(--ink-70); overflow-wrap: anywhere; }
	li a { font-size: 0.75rem; color: var(--ink); }
	.hint { font-size: 0.8125rem; color: var(--ink-70); }
	.btn-ghost { align-self: flex-start; border: 1px solid var(--ink-45); border-radius: 999px; padding: 0.4rem 0.9rem; font-size: 0.8125rem; font-weight: 600; color: var(--ink); }
</style>
```

- [ ] **Step 14: `src/lib/site/console/SectionEditor.svelte`** (from Task 9) — exact edits

Replace the props block
```ts
	let {
		section,
		photos,
		mediaConfigured,
		message
	}: { section: Section; photos: Photo[]; mediaConfigured: boolean; message: string | null } = $props();
```
with
```ts
	let {
		section,
		photos,
		mediaConfigured,
		message,
		today
	}: { section: Section; photos: Photo[]; mediaConfigured: boolean; message: string | null; today: string } = $props();
```
After `	let visibility = $state(section.visibility);` add
```ts
	let asUpdate = $state(section.kind === 'update');
	let publishedAt = $state(section.publishedAt ?? today);
```
Replace
```svelte
			<label><input type="radio" name="visibility" value="hidden" bind:group={visibility} /> Hidden (draft)</label>
		</fieldset>
```
with
```svelte
			<label><input type="radio" name="visibility" value="hidden" bind:group={visibility} /> Hidden (draft)</label>
		</fieldset>

		<fieldset class="kind">
			<legend class="kicker">Where it shows</legend>
			<label><input type="checkbox" name="kind" value="update" bind:checked={asUpdate} /> Post as update — appears in the Posts stream (newest first) instead of the page flow</label>
			<!-- Always rendered (prefilled) so the form works without JavaScript; ignored for sections. -->
			<label class="date" class:muted={!asUpdate}>Publish date <input type="date" name="publishedAt" bind:value={publishedAt} /></label>
		</fieldset>
```
In `<style>`, replace `	input:not([type='radio']), textarea {` with `	input:not([type='radio']):not([type='checkbox']), textarea {` and add:
```css
	.kind { border: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-1); }
	.kind .date { display: flex; align-items: center; gap: var(--space-2); font-size: 0.875rem; }
	.muted { opacity: 0.5; }
```

- [ ] **Step 15: `src/lib/site/console/SectionList.svelte`** — replace the whole file

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Section } from '$lib/server/site/sections';

	type Row = Section & { photoCount: number };
	let {
		sections,
		updates,
		selected,
		onselect
	}: { sections: Row[]; updates: Row[]; selected: number | null; onselect: (id: number) => void } = $props();

	const badge = { public: 'Public', invited: 'Invited', hidden: 'Hidden' } as const;
	const photos = (n: number) => `${n} photo${n === 1 ? '' : 's'}`;
</script>

<h2 class="kicker">Page sections</h2>
<ol class="list">
	{#each sections as s, i (s.id)}
		<li class:current={s.id === selected}>
			<button type="button" class="pick" onclick={() => onselect(s.id)}>
				<span class="title">{s.title}</span>
				<span class="meta">{badge[s.visibility]} · {photos(s.photoCount)}</span>
			</button>
			<form method="POST" action="?/move" use:enhance>
				<input type="hidden" name="id" value={s.id} />
				<button name="direction" value="up" disabled={i === 0} aria-label={`Move ${s.title} up`}>↑</button>
				<button name="direction" value="down" disabled={i === sections.length - 1} aria-label={`Move ${s.title} down`}>↓</button>
			</form>
		</li>
	{/each}
</ol>
<form method="POST" action="?/create" use:enhance>
	<button class="btn-ghost">Add section</button>
</form>

<h2 class="kicker updates-head">Updates <span class="meta">(newest first)</span></h2>
{#if updates.length}
	<ol class="list">
		{#each updates as u (u.id)}
			<li class:current={u.id === selected}>
				<button type="button" class="pick" onclick={() => onselect(u.id)}>
					<span class="title">{u.title}</span>
					<span class="meta">{u.publishedAt} · {badge[u.visibility]} · {photos(u.photoCount)}</span>
				</button>
			</li>
		{/each}
	</ol>
{:else}
	<p class="meta">No updates yet.</p>
{/if}
<form method="POST" action="?/create" use:enhance>
	<input type="hidden" name="kind" value="update" />
	<button class="btn-ghost">Add update</button>
</form>

<style>
	.list { list-style: none; display: flex; flex-direction: column; }
	li { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); border-top: var(--hairline); padding: 0.5rem 0; }
	li.current .title { text-decoration: underline; }
	.pick { display: flex; flex-direction: column; align-items: flex-start; text-align: left; color: var(--ink); }
	.meta { font-size: 0.75rem; color: var(--ink-70); }
	.updates-head { margin-top: var(--space-4); }
	form { display: flex; gap: 0.25rem; }
	form button:disabled { opacity: 0.3; }
	.btn-ghost { margin-top: var(--space-2); border: 1px solid var(--ink-45); border-radius: 999px; padding: 0.5rem 1.1rem; font-size: 0.8125rem; font-weight: 600; color: var(--ink); }
</style>
```

- [ ] **Step 16: Console page** — replace `src/routes/organizer/retreat/+page.svelte` (keeps Task 9a's "Who's coming" link)

```svelte
<script lang="ts">
	import SectionList from '$lib/site/console/SectionList.svelte';
	import SectionEditor from '$lib/site/console/SectionEditor.svelte';
	import BskyPostsManager from '$lib/site/console/BskyPostsManager.svelte';

	let { data, form } = $props();

	let selected = $state<number | null>(data.sections[0]?.id ?? data.updates[0]?.id ?? null);
	// A create/save/move result names its section; follow it.
	$effect(() => {
		if (form && 'sectionId' in form && typeof form.sectionId === 'number') selected = form.sectionId;
	});
	const current = $derived([...data.sections, ...data.updates].find((s) => s.id === selected) ?? null);
	const fromBsky = $derived(Boolean(form && 'bsky' in form && form.bsky));
	const formMessage = $derived(form && 'message' in form ? (form.message as string) : null);
	const message = $derived(fromBsky ? null : formMessage);
	const bskyMessage = $derived(fromBsky ? formMessage : null);
	const withCount = <T extends { photos: unknown[] }>(rows: T[]) => rows.map((s) => ({ ...s, photoCount: s.photos.length }));
</script>

<svelte:head><title>Retreat info — Organizer</title></svelte:head>

<main class="console">
	<header>
		<a href="/organizer">← Console</a>
		<h1 class="display">Retreat info</h1>
		<p class="links"><a href="/organizer/retreat/attendees">Who’s coming →</a> · <a href="/?as=public" target="_blank" rel="noopener">View as public</a> · <a href="/?as=invited" target="_blank" rel="noopener">View as invited</a></p>
	</header>
	<div class="layout">
		<aside>
			<SectionList
				sections={withCount(data.sections)}
				updates={withCount(data.updates)}
				{selected}
				onselect={(id) => (selected = id)}
			/>
			<BskyPostsManager posts={data.bskyPosts} message={bskyMessage} />
		</aside>
		<section aria-label="Editor">
			{#if current}
				{#key `${current.id}:${current.updatedAt}`}
					<SectionEditor section={current} photos={current.photos} mediaConfigured={data.mediaConfigured} {message} today={data.today} />
				{/key}
			{:else}
				<p>No sections yet — add one.</p>
				{#if message}<p role="status">{message}</p>{/if}
			{/if}
		</section>
	</div>
</main>

<style>
	.console { max-width: 72rem; margin: 0 auto; padding: var(--space-4) var(--space-3) var(--space-5); }
	header { display: flex; flex-direction: column; gap: var(--space-1); margin-bottom: var(--space-4); }
	header a, .links a { color: var(--ink); }
	.links { font-size: 0.8125rem; color: var(--ink-70); }
	.layout { display: grid; grid-template-columns: minmax(14rem, 18rem) 1fr; gap: var(--space-5); }
	@media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }
</style>
```

- [ ] **Step 17: Folder docs** — `src/lib/site/AGENTS.md`: add rows after the `WhosComing.svelte` row:
```markdown
| `PostsStream.svelte` | The Posts stream: updates (server-rendered markdown, photos) and Bluesky posts, merged newest first by `loadSite`. |
| `BskyPost.svelte` | One Bluesky post rendered natively: author, text segments (text nodes; http(s) facet links only), ≤ 4 thumbnails, date, "View on Bluesky". No embed script. |
```
and add to the Boundaries list:
```markdown
- Bluesky post text is never `{@html}`; render `segments` as text nodes.
```

- [ ] **Step 18: Verify**

Run: `pnpm check && pnpm test && pnpm build`
Expected: green, check 0/0.
Then `pnpm dev --host 127.0.0.1` (local D1 with 0011 applied) as an organizer: Add update → set Public, today's date → save → it leaves "Page sections", appears under "Updates", and shows in the Posts stream on `/?as=public`; an Invited update shows only on `/?as=invited`; untick "Post as update" → it returns to the page flow. Paste a real post link (`https://bsky.app/profile/bsky.app/post/<rkey>` from any public post) → it renders natively in the stream with "View on Bluesky"; paste `https://example.com/x` → the "Paste a post link…" error; remove the post → gone from `/`. `curl -s http://127.0.0.1:5173/ | grep -c 'embed.bsky.app\|<script[^>]*bsky'` → `0`.

- [ ] **Step 19: Commit**

```bash
git add src/lib/server/site/sections.ts src/lib/server/site/sections.test.ts src/lib/server/site/bsky-posts.ts src/lib/server/site/bsky-posts.test.ts src/lib/server/site/page.ts src/lib/server/site/page.test.ts src/routes/+page.server.ts src/lib/content.ts src/lib/site/PostsStream.svelte src/lib/site/BskyPost.svelte src/lib/site/RetreatHome.svelte src/lib/site/AGENTS.md src/lib/site/console/BskyPostsManager.svelte src/lib/site/console/SectionEditor.svelte src/lib/site/console/SectionList.svelte src/routes/organizer/retreat/+page.server.ts src/routes/organizer/retreat/+page.svelte
git commit -m "feat(site): posts stream with updates and natively rendered Bluesky posts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: finish reviews, docs, follow-up issue

**Files:** `src/lib/server/site/AGENTS.md`, `src/lib/server/site/CLAUDE.md`, `src/AGENTS.md`, `src/lib/AGENTS.md`, `src/routes/AGENTS.md`, `src/lib/server/AGENTS.md`, `DESIGN.md` (+ sidecar)

- [ ] **Step 1: Finish reviews** — run the **impeccable** finish reviewer on `/` (public + invited, 1440 + 393) against the chosen comp, and on `/organizer/retreat` against the organizer surface (`.impeccable/mocks/org-b.png`). Fix every material finding; re-run `pnpm check && pnpm test`.

- [ ] **Step 2: Server folder docs** — `src/lib/server/site/CLAUDE.md` = `@AGENTS.md`; `src/lib/server/site/AGENTS.md`:

```markdown
# src/lib/server/site — retreat site content (server)

| File | Migration | Owns |
|---|---|---|
| `tier.ts` | — | `viewerTier` (organizer / invited / public; **fails closed**), `canSee` (the one visibility rule), `pageTier` (`?as=` for organizers only). |
| `sections.ts` | `0010_site_content`, `0011` | Section/update CRUD (`kind`, `published_at`; `listSections` = page sections, `listUpdates` = updates), `validateSection`, `visibleTo`, `moveSection`, optimistic `updateSection` (`'ok' \| 'conflict' \| 'missing'`). |
| `photos.ts` | `0010_site_content` | Photo validation, R2 writes/deletes (`SITE_MEDIA`), ordering, `servePhoto` (404 unless visible; photos without alt are organizer-only). |
| `featured.ts` | `0011_site_featured_posts` | Who's coming: confirmed-only curation (`setFeatured`, `moveFeatured`), `shownAttendees` (shown AND still confirmed), `hydrateAttendees` (injected profile loader; failures → registration handle, no avatar). |
| `bsky-posts.ts` | `0011_site_featured_posts` | Strict `bsky.app` post-URL parser, handle→DID and `getPosts` **only** via `public.api.bsky.app` (timeouts, batches of 25), KV cache 1 h, safe view model (http(s) facet links, https thumbs). |
| `page.ts` | — | `loadSite` → `/`'s data: filtered sections rendered with `renderMarkdown`, attendees, posts stream (visible updates + Bluesky posts, newest first), link preview from public content only. |

## Boundaries

- Every section/photo read goes through `tier.ts`. Never add a second path.
- The invited tier unlocks the address: lookup errors → public.
- Never fetch a URL derived from input; Bluesky calls go to `APPVIEW` with encoded query params only.
- Tests run real migrations on `node:sqlite` via `server/test/sqlite-d1.ts`.

## Verify

`pnpm test src/lib/server/site`.
```

- [ ] **Step 3: Update existing guides**
  - `src/AGENTS.md` surface table: the `/` row becomes `| Retreat home + registration | `/` (`/?register`) | everyone; invited builders see more | organizer-edited sections (public / invited), status strip, registration flow |`; add `| Retreat info editor | `/organizer/retreat` (+ `/attendees`) | organizers | sections, updates, photos, Bluesky posts; Who's coming curation |`; add `site/` and `markdown/` lines to the map.
  - `src/lib/AGENTS.md` Folders table: add `site/` and `markdown/` rows.
  - `src/routes/AGENTS.md` map: update `+page.svelte` (retreat home / `?register` registration), add `media/site/[id]/+server.ts`, `organizer/retreat/` and `organizer/retreat/attendees/`.
  - `src/lib/server/AGENTS.md`: add the `site/` row (migrations `0010`, `0011`) and `SITE_MEDIA` to the env list.

- [ ] **Step 4: DESIGN.md** — run impeccable's documenter to refresh `DESIGN.md` and its sidecar from the shipped surfaces.

- [ ] **Step 5: Follow-up issue** — `~/.cargo/bin/chainlink issue quick "Remove retired survey feed components + /api/response (survey closed; late passes still nominally reopen it)" -p low -l chore`

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/site/AGENTS.md src/lib/server/site/CLAUDE.md src/AGENTS.md src/lib/AGENTS.md src/routes/AGENTS.md src/lib/server/AGENTS.md DESIGN.md .impeccable/design.json
git commit -m "docs(site): folder guides, routes map, refreshed DESIGN.md"
```
(Stage only files that changed.)

---

### Task 11: rollout

- [ ] **Step 1:** Push the branch and open the PR (body: spec link, what changed, verification evidence incl. screenshots, the privacy matrix test list). Wait for CodeRabbit's automatic review; address findings.
- [ ] **Step 2: Ask Bryan for the go-ahead** on production changes, listing exactly: (a) create R2 bucket `buildtreat-site-media` (`cf cli search "create r2 bucket"` → run the found command); (b) apply `migrations/0010_site_content.sql` then `migrations/0011_site_featured_posts.sql` to prod D1 and record both in `d1_migrations` (per repo memory: via `cf` or the Cloudflare MCP `d1_database_query`, then `INSERT INTO d1_migrations (name) VALUES ('0010_site_content.sql'), ('0011_site_featured_posts.sql')`).
- [ ] **Step 3:** After his OK, run (a) and (b); verify with `cf r2` / a D1 `SELECT title, visibility, kind FROM site_sections ORDER BY position` and `SELECT COUNT(*) FROM site_featured`.
- [ ] **Step 4:** Bryan merges; confirm the Workers build succeeds (`cf builds list --external-script-id c7ecc3234c51420fbf7ce70b4e39acad --per-page 1`) and `curl -s https://buildersretre.at/ | grep -o '<title>[^<]*</title>'`.
- [ ] **Step 5:** Remind Bryan to fill the hidden drafts (Where we're staying, Schedule, Getting there, What to bring) and switch them to Invited, curate Who's coming at `/organizer/retreat/attendees`, and add any Bluesky posts to the stream.
