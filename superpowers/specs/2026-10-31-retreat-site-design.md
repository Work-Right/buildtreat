# Retreat site — design

**Date:** 2026-10-31
**Status:** Approved by Bryan section by section (conversation, 2026-10-31)
**Scope:** Turn buildersretre.at from the survey/registration feed into the
overall retreat site: an organizer-edited page of sections, some public and
some for invited people only, with photos. Registration keeps working as is.

## Locked decisions

| Question | Decision |
|---|---|
| Visibility tiers | **Two.** Public overview; **invited** people — allowlisted or holding a late pass, registered or not, including people who declined — see everything, address included. |
| How content is edited | **Organizer console**, light markdown, each section `public` / `invited` / `hidden` (draft). Saves go live immediately. |
| Where the site lives | **`/` becomes the retreat home.** The survey feed is retired from `/`. |
| Photos | **Uploaded from the console**, stored in a private R2 bucket, served through the site with a visibility check. |
| Public location wording | **Region only** — "near Palm Springs" / Coachella Valley. Town, address and house details are invited-only. (Unchanged rule: the exact venue never appears on public surfaces.) |
| Markdown | **markdown-it 15** (MIT, ~22k★, ships types): escapes raw HTML (`html: false`) and rejects `javascript:`/`data:` links by default; pure JS, so it runs in the Worker and the browser. marked was rejected: it passes raw HTML through and its usual sanitizer (DOMPurify) needs a DOM, which Workers lack. |

Calls made without asking (recorded here so they can be revisited):
- **No new notification system.** Bryan announces important changes with
  the existing broadcast panel (email or DM), linking to the page.
- **Seed content.** Migration 0010 inserts public sections built from facts
  the site already states, so `/` is never empty at launch.
- **Hidden** visibility exists so sections can be drafted ahead.
- **Edit conflicts** are refused, not merged (see Console).

## Approaches considered

1. **Sections in D1, photos in R2, server-side filtering — chosen.** Matches
   how the app already stores and gates everything; invited-only text and
   photos are protected on the server.
2. **Whole page as one JSON document in KV.** Simpler storage, but reorder,
   per-section visibility and photo ownership become ad hoc, and two quick
   edits can overwrite each other. Rejected.
3. **Content as ATProto records on Bryan's PDS.** On-brand, but PDS records
   are public by design — invited-only content can't live there. Rejected.

## Data — migration `0010_site_content.sql`

```sql
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
  id            TEXT PRIMARY KEY,          -- random; also the R2 object key
  section_id    INTEGER NOT NULL REFERENCES site_sections(id) ON DELETE CASCADE,
  alt           TEXT NOT NULL DEFAULT '',  -- empty = not yet shown on the site
  width         INTEGER NOT NULL,
  height        INTEGER NOT NULL,
  content_type  TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  position      INTEGER NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE INDEX site_photos_section ON site_photos(section_id, position);
```

The migration also inserts the seed public sections (dates, "near Palm
Springs", what's covered, organizer credit) with `updated_by = 'seed'`
(a migration can't know who applied it). Copy for those rows comes from `content.ts` /
`PRODUCT.md` facts — nothing invented.

D1 enforces `ON DELETE CASCADE` only with foreign keys on; the delete path
removes photo rows and R2 objects explicitly rather than relying on it.

**R2:** bucket `buildtreat-site-media`, binding `SITE_MEDIA`, **no public
access**. Created with the `cf` CLI after Bryan's OK (same rule as prod D1
migrations); `wrangler.jsonc` gains the binding.

## Server — `src/lib/server/site/`

| Module | Owns |
|---|---|
| `tier.ts` | `viewerTier(locals, platform, db)` → `'public' \| 'invited' \| 'organizer'`. Organizer = `isOrganizer(ORGANIZER_DIDS)`. Invited = signed in and `checkAllowlist` or `hasLatePass`. Everyone else public. `canSee(tier, visibility)` is the single visibility rule. |
| `sections.ts` | D1 access: `listSections(db)`, `visibleSections(db, tier)`, `getSection`, `createSection`, `updateSection(db, id, input, expectedUpdatedAt)` (returns `conflict` when `updated_at` moved), `moveSection(db, id, 'up' \| 'down')`, `deleteSection`. Input validation: title 1–120 chars, body ≤ 20 000 chars, visibility in the enum. |
| `photos.ts` | `addPhoto` (validates type ∈ jpeg/png/webp and size ≤ 8 MB, writes R2 then the row; removes the R2 object if the row insert fails), `setAlt`, `movePhoto`, `deletePhoto` (row + R2 object), `photosFor(db, sectionIds)`, `photoForViewer(db, id, tier)` (joins the section and applies `canSee`). |
| `*.test.ts` | Tier matrix, visibility filtering, ordering, validation, conflict detection, upload validation — against a stubbed D1/R2. |

Every read of sections or photos goes through `tier.ts`. There is no second
path.

## Markdown — `src/lib/markdown/` (client-importable, pure)

- `parse.ts`: one configured markdown-it instance (`html: false`,
  `linkify: true`, `typographer: false`; headings limited to `##`/`###`;
  images in markdown disabled — photos come from the photo list only).
- `web.ts`: renders to class-based HTML for the page and the console preview.
- **Email is out of scope (amended during planning, 2026-10-31).** The
  broadcast renderer in `server/messaging/email-template.ts` stays as is.
  Its tests pin non-CommonMark behavior Bryan already writes against —
  `#Heading` without a space, `•` bullets, and URLs such as
  `https://…/**v2**/_x_` staying one link — which markdown-it would change.
  Section bodies and broadcasts are written separately, so no text is
  shared between the two renderers.

## Retreat home — `/`

Top to bottom:
1. **Hero:** retreat name, December 4–7, "near Palm Springs", organizer
   credit; "Sign in with Atmosphere" when signed out.
2. **Status strip** (signed in only):
   - invited, not registered, registration open (or late pass) → "Register
     by …" + button into the existing registration form;
   - invited, registered → "You're registered · edit details";
   - invited, declined → "You said you can't make it" + a way back into the
     existing flow to change that;
   - invited, registration closed and no late pass → says so;
   - signed in, not invited → the existing invite-only denial copy.
3. **Sections** the viewer may see, in `position` order: heading, rendered
   body, photos (gallery treatment set by the comps). Photos with empty alt
   are not rendered.
4. **Footer:** organizer credit.

- Rendered on the server; invited-only sections never reach a public browser.
- The registration flow (announcement → form → summary) is unchanged and
  renders at **`/?register`** (amended during planning: same route, so the
  `register`/`decline` actions and the 425-line load stay put). The status
  strip links there; the flow gets a "← Retreat home" link back.
- **Link previews:** `<title>`, description and `og:`/`twitter:` image from
  the first public section and its first photo (fallback: the current hero
  art). Public content only.
- **Organizer preview:** `/?as=public` or `/?as=invited` renders as that tier
  for organizers only; ignored for everyone else. An organizer at plain `/`
  sees the invited view — hidden drafts appear only in the console (list +
  live preview), never on `/`.
- If the section read fails: hero + status strip + a quiet "More details
  soon" line, never a broken page.

The survey feed no longer renders on `/`. Deleting its components and the
survey endpoint is a separate follow-up issue (late passes still nominally
reopen the survey, so removal is its own decision).

## Console — `/organizer/retreat`

Its own route, organizers only (signed out → `/organizer`, non-organizer →
404, the pattern of `/organizer/registrations/[did]`), linked from the
console rail.

- **List:** title, visibility badge, photo count, **move up/down** buttons,
  **Add section**.
- **Edit:** title, body (markdown hint line shared with broadcasts),
  visibility radios, **live preview** (`lib/markdown/web.ts` client-side),
  Save. The form carries the `updated_at` it loaded; a stale save is refused
  with "Changed elsewhere — reload first".
- **Photos:** multi-select picker; each file is downscaled in the browser to
  ≤ 2400 px longest edge, JPEG, before upload (iOS converts HEIC on pick);
  thumbnails with an alt-text field (required before it shows), reorder,
  delete.
- **View as public / View as invited** links to `/?as=…`.
- **Delete section:** two-step arm/confirm (the broadcast Send pattern);
  removes its photos from R2.
- Form actions throughout; without JavaScript everything works except
  client-side downscaling (server still enforces 8 MB) and the live preview.
- If `SITE_MEDIA` is unbound: uploads disabled with a setup hint (the
  "Email isn't set up yet" pattern).

## Photo serving — `/media/site/[id]`

- Looks up the photo, joins its section, applies `canSee(viewerTier, …)`.
- Not visible or unknown → **404** (not 403 — don't confirm existence).
- `Cache-Control: private, max-age=300` — never cached by shared caches.
- Correct `Content-Type` from the row; `X-Content-Type-Options: nosniff`.

## Privacy rules (each has a test)

1. The tier comes only from server state; `?as=` is honored only for organizers.
2. `/` never includes invited or hidden sections for a public viewer.
3. `/media/site/[id]` returns 404 for photos the viewer can't see, including
   hidden-section photos for non-organizers.
4. Link-preview tags use public sections and photos only.
5. Every console action calls `requireOrganizer` first; all SQL parameterized.
6. Markdown cannot emit raw HTML or `javascript:`/`data:` links.

Test matrix: signed out · signed in not invited · allowlisted · late pass
only · registered · declined · organizer — against public / invited / hidden
sections and their photos.

## Design process (impeccable)

This spec fixes structure and behavior; visuals go through impeccable:
- **Retreat home:** new surface brief → comps of the public and invited
  states for Bryan to choose → build → finish review against the comp.
- **Console page:** extends the existing organizer surface (Command rail,
  `.impeccable/mocks/org-b.png`) — no new comps; finish review.
- **After:** refresh `DESIGN.md` and its sidecar from the shipped code.

## Rollout

1. PR with everything above; CodeRabbit + local verification (check, test,
   build; screenshots of `/` public and invited at 1440/393; a real upload
   against local R2 simulation; finish reviews).
2. With Bryan's OK: create the R2 bucket, apply migration 0010 to prod D1
   (and record it in `d1_migrations`).
3. Merge → Workers Builds deploys. Bryan writes the invited sections
   (address, house, itinerary) — before merge via a local preview, or right
   after.

## Out of scope

- Moving broadcast emails onto markdown-it (see Markdown).

- Removing the survey components and endpoint (follow-up issue).
- Notifications when content changes (use broadcasts).
- Per-person content (everyone invited sees the same thing).
- Revision history / undo for sections.
- Image formats beyond JPEG/PNG/WebP; video.

## Amendment — 2026-11-01 (approved by Bryan)

### Two views on `/`

- **Public** (signed out, or signed in but not invited) is **storytelling
  only**: hero → public story sections → **Who's coming** → **Posts** →
  footer. A signed-in, not-invited visitor additionally sees the invite-only
  strip (+ waitlist). Venue rule unchanged: region only; no town, house name,
  or house photos.
- **Invited** is **logistics first**: compact hero → status strip → invited
  sections (house, schedule, getting there, what to bring) → then the public
  story continues below (who's coming, posts).

### Who's coming (curated)

- New table `site_featured(did TEXT PRIMARY KEY, blurb TEXT NOT NULL DEFAULT
  '', shown INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL,
  updated_at TEXT NOT NULL)`, migration `0011`.
- Console page lists **confirmed registrants**; per person: **show on site**
  toggle (off by default), a one-line **blurb** ("what I'm building",
  organizer-written, ≤ 140 chars), up/down order.
- Public render: only rows with `shown = 1` whose registration is still
  `confirmed`. Avatar, display name, handle come live from the Bluesky
  profile (existing `PROFILE_CACHE`, under its own `appview:` key prefix),
  handle linked to the profile. Profile failure or no appview-verified
  handle → that person is omitted from the public list (never show an
  unverified handle); never breaks the page.
- Attendee self-editing of blurbs: out of scope.

### Posts stream

- **Updates:** a section with `kind = 'update'` and a `published_at` date
  (migration `0011` adds `kind TEXT NOT NULL DEFAULT 'section' CHECK (kind IN
  ('section','update'))` and `published_at TEXT` to `site_sections`). Same
  editor, markdown, photos and visibility as sections; updates render in the
  stream, sections in the story/logistics flow.
- **Bluesky posts:** table `site_bsky_posts(uri TEXT PRIMARY KEY, added_at
  TEXT NOT NULL, added_by TEXT NOT NULL)`. Organizer pastes a
  `https://bsky.app/profile/<handle|did>/post/<rkey>` URL; the server parses
  it strictly, resolves the handle to a DID and fetches posts via
  `app.bsky.feed.getPosts` **only from `https://public.api.bsky.app`** (fixed
  host — no URL from input is ever fetched). Hydrated views are cached in KV
  (1 h). Rendered natively in the site's style: author avatar/name/handle,
  text (facet links kept, other text escaped), up to 4 image thumbnails with
  alt, date, "View on Bluesky" link. No third-party embed script. A post that
  no longer resolves is omitted silently.
- The stream merges updates and Bluesky posts by date, newest first; posts
  are public (updates follow their own visibility).

### Decisions recorded during implementation

- **Invited tier is strict** (Bryan, 2026-10-31): invited only on an actual
  allowlist or late-pass match; an empty allowlist means nobody is invited;
  a handle matches only rows not yet pinned to a DID; lookups are read-only.
- **Imagery for comps:** real house photos from the venue's own website, used
  only in invited-view comps; production photos are uploaded via the console.
