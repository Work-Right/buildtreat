# src/lib/server/site — retreat site content (server)

Everything behind `/` (the retreat home), `/media/site/[id]` and the
organizer's `/organizer/retreat` (+ `/attendees`) console. Server-only:
D1 (migrations `0010_site_content`, `0011_site_featured_posts`), the private
`SITE_MEDIA` R2 bucket, and the public Bluesky appview. All SQL
parameterized.

| File | Migration | Owns |
|---|---|---|
| `tier.ts` | — | `viewerTier` (organizer / invited / public; **fails closed**: any lookup error → public), `canSee` (the one visibility rule), `pageTier` (`?as=` honoured for organizers only). |
| `sections.ts` | `0010`, `0011` | Section/update rows (`kind` `'section' \| 'update'`, `published_at` for updates): `listSections` (page sections by position), `listUpdates` (newest publish date first), `validateSection` (an update requires a calendar publish date), `visibleTo`, `createSection`, optimistic `updateSection` (`'ok' \| 'conflict' \| 'missing'` on a stale `updatedAt`), `moveSection`, `retreatToday` (Pacific date). |
| `photos.ts` | `0010` | Photo validation (JPEG/PNG/WebP, ≤ 8 MB), R2 writes/deletes (`SITE_MEDIA`, keyed by row id), alt text, ordering, `deleteSection` (photos first) / `deleteSectionWithoutMedia` (R2 unbound → only photo-less sections), `servePhoto` (404 unless the parent section is visible; photos without alt are organizer-only). |
| `strip-metadata.ts` | — | `stripMetadata` / `stripReason`: keeps only an allowlist of structural JPEG/PNG/WebP parts (EXIF/GPS, XMP, IPTC, comments, text chunks, trailing data dropped) before bytes reach R2; unreadable or animated → refused. No decode/re-encode. |
| `image-size.ts` | — | `imageSize(bytes, type)`: pixel size read from the (stripped) bytes — the server never trusts browser-sent dimensions. |
| `featured.ts` | `0011` | Who's coming: confirmed-only curation (`setFeatured` with `BLURB_MAX` 140, `moveFeatured`, `listConsoleAttendees`), `shownAttendees` (shown AND still confirmed), `hydrateAttendees` (injected appview profile loader; no appview-verified handle → no card). |
| `appview-cache.ts` | — | `appviewProfileCache`: the `appview:`-prefixed KV view of `PROFILE_CACHE` that only the public-appview profile batch fills, so a PDS-fallback (unverified) handle can never reach an attendee card. |
| `verified-handle.ts` | — | `verifiedHandle(did, kv?)`: the appview-verified handle (via `loadBskyProfiles` + the `appview:` cache, 2.5 s timeout, never throws) or null; `cleanHandle` (rejects `handle.invalid`, grammar-checks). **The only handle allowed to match or pin an allowlist / late-pass row or decide a tier** — `/` load + `register`/`decline`/`joinWaitlist`, `/media/site/[id]`, `PUT /api/response`. `loadBskyProfile`'s handle can be a PDS claim: display only. |
| `bsky-posts.ts` | `0011` | Bluesky posts in the stream: strict `bsky.app` post-URL parser (`parsePostUrl`), `resolveDid` (`{ did } \| 'not-found' \| 'error'`) and `getPosts` **only** via `APPVIEW` (`public.api.bsky.app`; timeouts; ≤ 25 URIs per request, batches in parallel), `isPostUri`, KV cache 1 h (negative entries for posts the appview didn't return), safe view model (http(s) facet links as text segments; avatars/thumbnails only from `https://cdn.bsky.app/`), console rows. |
| `page.ts` | — | `loadSite` → `/`'s data: tier-filtered sections rendered with `renderMarkdown`, attendees, posts stream (visible updates + Bluesky posts, newest first by Pacific day), link preview from public content only. Attendees and posts never break the page. |
| `console-preview.ts` | — | Dev-only `?preview` fixtures for the console and attendees pages. Generic copy only. |
| `home-preview.ts` | — | Dev-only `?preview=registered` / `=declined` registration fixture for `/`. |

## Boundaries

- **Identity = verified handle.** Any allowlist / late-pass / tier lookup passes `{ did, handle: await verifiedHandle(did, PROFILE_CACHE) }`, never a `loadBskyProfile` handle (a self-hosted PDS can claim any handle). Null handle → DID-only matching.
- **One tier path.** Every section, update and photo read goes through `tier.ts` (`visibleTo` / `canSee`). Never add a second visibility check or a bypass.
- **Invited fails closed.** The invited tier unlocks the address: allowlist/late-pass lookup errors mean public.
- **Appview-only identity.** Handles, display names and avatars shown publicly come from the public appview, never `registrations.handle` or a pasted URL.
- **Fixed-host Bluesky fetch.** Never fetch a URL derived from input; organizer input is reduced to validated identifiers and sent to `APPVIEW` as encoded query params.
- **Metadata stripped before storage.** Upload bytes go through `strip-metadata.ts` before `addPhoto`; dimensions come from `image-size.ts` on the stripped bytes.
- No venue name, town or house photos in fixtures, tests or copy.

## Verify

```
pnpm test src/lib/server/site src/routes/organizer/retreat
pnpm check
```

Tests run every migration on in-memory `node:sqlite` (`server/test/sqlite-d1.ts`)
with a Map-backed R2 (`server/test/fake-r2.ts`); the route tests
(`routes/organizer/retreat/**/actions.test.ts`) call the real actions with a
constructed event (`server/test/event.ts`).
