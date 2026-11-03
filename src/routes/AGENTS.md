# src/routes — pages, actions, endpoints

The only place client and server meet. Route files are thin: `load` gathers
data from `$lib/server`, actions validate and call one server function,
pages compose components from `$lib`. Logic that grows past a screen belongs
in a `$lib` module, not here.

## Map

| Path | Kind | What it does |
|---|---|---|
| `+layout.svelte` | layout | Fonts (Big Shoulders, Hanken Grotesk), `app.css`, favicon, the fallback `<title>`. Pages own their `<main>` (`lib/site/RetreatHome` on `/`). |
| `+page.server.ts` | load + actions | The builder surface. `load` (sent `cache-control: private, no-store`) resolves the visitor (DID → display profile; every allowlist / late-pass / tier match uses the appview-verified handle from `lib/server/site/verified-handle.ts`, never the display profile's possibly PDS-claimed handle), allowlist status, saved response, survey gate (deadline / late pass / reopened), and registration state + gate (`REG_DEADLINE` / late pass); sets the `abr_known` cookie (`readKnownUser`). Every branch also returns `site` from `loadSite` (`lib/server/site/page.ts`: tier, sections, attendees via the `appview:` profile cache, posts via the fixed-host Bluesky fetch). Dev `?preview` fixtures: registration row in `lib/server/site/home-preview.ts`. Actions: `joinWaitlist`, `register` (parse → validate → `upsertConfirmed` → confirmation email), `decline`. |
| `+page.svelte` | page | `?register` (for allowed users) → `lib/registration/RegistrationFlow`; otherwise the retreat home `lib/site/RetreatHome`. Mounts `SignInSheet` with `open` + `onclose` (never `bind:` — it drops the page `<title>`). |
| `media/site/[id]/+server.ts` | GET | Retreat-site photo bytes from R2 (`SITE_MEDIA`) via `servePhoto`: resolves the viewer's tier, 404 unless the parent section is visible to them (photos without alt are organizer-only); `cache-control: private`. 404 when R2 or D1 is unbound. |
| `api/response/+server.ts` | PUT | Saves a survey draft. 401 without a session, 503 without D1, 400 on `ValidationError`; otherwise `upsertResponse`. |
| `api/invited/+server.ts` | GET | `?handle=` → `{ invited }`. Resolves the handle **only via `public.api.bsky.app`** — a direct `actorToDid` here would be an SSRF primitive on an unauthenticated endpoint. Keep it that way. |
| `organizer/+page.server.ts` | load + actions | Organizer console data and the admin actions (allowlist, late passes, reopen, waitlist promote, anchors). The messaging actions (email + DM test/broadcast, retry) are spread in from `lib/server/organizer/broadcast-actions.ts`. Shared types and `requireOrganizer` live in `lib/server/organizer/page-data.ts`; the dev `?preview` fixture in `lib/server/organizer/preview.ts`. |
| `organizer/+page.svelte` | page | Composes the console from `lib/organizer/*` sections and panels. |
| `organizer/registrations/[did]/` | load + action | `save` action: the organizer edits one attendee's registration fields (`updateRegistrationFields`), never status or agreements. Signed out → redirect to `/organizer`; non-organizer → 404. |
| `organizer/retreat/` | load + actions + page | Retreat info console: sections and updates (create — `kind=update` makes an update dated today in Pacific time — save with `kind`/`publishedAt`, move, delete), Bluesky posts in the stream (`bskyAdd` parses the pasted link first — malformed → 400 — then resolves it via `public.api.bsky.app` only: unknown handle (appview 400) → 400, resolver failure → 502 "Couldn’t reach Bluesky", a post that doesn't load → 404; `bskyRemove` takes an AT-URI, else 400; results carry `bsky: true`) and photos (upload/photoAlt/photoMove/photoDelete) via `lib/server/site/*`, UI from `lib/site/console/`. Upload refuses more than 6 files or 24 MB per request before reading any bytes ("Upload at most 6 photos (24 MB) at a time"), reads only `photo` files, keeps only an allowlist of structural image parts, dropping metadata and anything after EOI (`lib/server/site/strip-metadata.ts`; unparseable → "Couldn’t read that image") and reads dimensions from the stripped bytes (`lib/server/site/image-size.ts`). Selection is `?section=id`. Dev `?preview` fixture in `lib/server/site/console-preview.ts`. Signed out → `/organizer`; non-organizer → 404. Action-level tests: `actions.test.ts`. |
| `organizer/retreat/attendees/` | load + actions + page | Who's coming curation: confirmed registrants (`lib/server/site/featured.ts`) with avatars from `consoleAvatars` (public appview, `appview:` cache; failure → glyphs), actions `toggle` (show/hide), `blurb` (≤ 140), `move` (reorders the shown list). Rows from `lib/site/console/AttendeeRow`. Dev `?preview` → `attendeesPreview()` in `console-preview.ts`. Signed out → `/organizer`; non-organizer → 404. Action-level tests: `attendees/actions.test.ts`. |
| `organizer/{responses,registrations,availability}.csv/+server.ts` | GET | Organizer-only CSV downloads via `lib/server/organizer/csv.ts`. |

`src/hooks.server.ts` runs before all of these:
`sequence(canonicalize, returnToFix, atproto.handle)` — redirect the
workers.dev host to the canonical domain, patch the OAuth `returnTo` cookie
(upstream workaround), then mount ATProto auth so `locals.did` is available.

## Rules

- **Access policy for `/organizer`:** signed out → minimal gate, no data;
  signed in but not in `ORGANIZER_DIDS` → 404 (indistinguishable from no
  route); organizer → everything. `requireOrganizer` enforces this at the
  top of `load` and every action.
- **Every action starts the same way:** auth check, `platform?.env?.DB`
  guard returning `fail(503, …)`, then parse `formData`. Match the pattern.
- **Return shapes are contracts.** Pages read `form?.message`,
  `form?.anchorDid` / `anchorOn`, `form?.anchorsCleared`, `form?.errors`.
  Adding a field is fine; renaming one means updating the page.
- **Reads that gate destructive writes fail loud** (`anchorsUnavailable`,
  `registrationsUnavailable`) rather than returning an empty array.
- **`dev`-only branches are compile-time.** `?preview` uses
  `$app/environment`'s `dev`, which is `false` in production builds, so the
  branch is eliminated — don't replace it with a runtime env check.
- **No SQL in routes.** The one exception (`toggleAnchor`'s respondent
  existence check) predates the split; prefer adding a function in
  `lib/server/organizer/admin.ts` over adding another.
- Endpoints return JSON via `json()` and never echo the request body.

## Verify

`pnpm check`, `pnpm test`, `pnpm build`. `pnpm dev` then `/`, `/organizer`
(signed out gate), `/organizer?preview` (synthetic data, dev only). Form
actions should work with JavaScript disabled — every `<form>` has a real
`action` and the page re-renders from `form` data.
