# src/lib/server — server-only logic

Everything here runs only in the Worker. SvelteKit's illegal-import guard
rejects any runtime import of `$lib/server/*` from browser-reachable code,
so this is the trust boundary: D1 handles, env secrets, and validation that
must not be bypassable live here.

## Files

| File | Migration | Owns |
|---|---|---|
| `db.ts` | `0001_init` | Survey responses: `validateDraft` (throws `ValidationError`), `upsertResponse`, `getResponse`, `peekAllowlist` / `checkAllowlist`, and the shared `EMAIL_RE`. |
| `deadline.ts` | — | `deadlineStatus(env.DEADLINE)` → `{ deadline, display, closed }`. **Fails open**: an unset or unparsable deadline means "not closed". |
| `waitlist.ts` | `0003_waitlist` | Not-yet-invited sign-ups: `joinWaitlist`, `backfillWaitlistHandle`, `getWaitlistEntry`, `listWaitlist`, `promoteFromWaitlist(db, did, verify)` (re-verifies the stored handle via the injected resolver — production `verifiedHandle` — and refuses a mismatch or an allowlist row pinned to another DID), `isValidWaitlistEmail`. |
| `registration.ts` | `0006_registrations`, `0008_travel_support` | Dec 4–7 registrations: `Registration` / `RegistrationRow` + `rowToRegistration`, `getRegistration`, `upsertConfirmed`, `setDeclined`, `updateRegistrationFields` (organizer edits; never status or agreements), `listRegistrations`, and pure helpers `isRegistered`, `travelStatus`, `supportCounts`, `registrationCounts`, `noResponseHandles`. |
| `organizer/` | `0002`, `0004` | Organizer authorization, allowlist, late passes, reopen flag, survey/registration gates, anchors, page data, messaging actions, CSV — see `organizer/AGENTS.md`. |
| `site/` | `0010`, `0011` | Retreat site content: viewer tier, sections/updates, photos (R2 `SITE_MEDIA`, metadata stripped, sizes from bytes), who's coming, Bluesky posts (fixed appview host), `loadSite` — see `site/AGENTS.md`. |
| `test/` | — | Test-only helpers: `sqlite-d1.ts` (every migration on in-memory `node:sqlite`, D1-shaped), `fake-r2.ts`, `event.ts` (a RequestEvent for calling route loads/actions). |
| `messaging/` | `0005`, `0007`, `0009` | comail.at email + Bluesky DM transports, branded template, confirmation email, broadcast audiences and ledger — see `messaging/AGENTS.md`. |

Migrations live in `/migrations/*.sql` and are applied with wrangler
(`d1 migrations apply`). The D1 migrations ledger in production must stay in
sync with what's applied — see the repo memory notes before running one.

## Rules

- **Parameterized SQL only.** `db.prepare('… WHERE did = ?1').bind(did)`.
  Never interpolate a value into a query string, including column lists built
  from user input.
- **Validate on the server even when the client already did.**
  `validateDraft` and `registration.validateRegistration` are the gates; the
  client versions are UX.
- **Fail loud on reads that gate destructive writes.** Pattern from the
  organizer load: a failed anchor read sets `anchorsUnavailable` and disables
  Clear, rather than rendering an empty list that a click could "clear".
- **Env access goes through `platform.env`.** `DB`, `KV`, `SITE_MEDIA` (R2,
  optional until provisioned), `DEADLINE`, `REG_DEADLINE`, `ORGANIZER_DIDS`,
  `COMAIL_*`, `BSKY_DM_*`. Secrets are
  write-only wrangler secrets; code checks presence (`emailConfigured`,
  `dmConfigured`) and never logs values.
- **Handles are normalized once** (`replace(/^@/, '').toLowerCase()`) at the
  write site; reads compare normalized strings.
- **PII stays in D1.** Nothing here should write emails, names, or
  emergency contacts to logs, KV, or exports beyond the organizer CSVs.

## Verify

`pnpm test` covers the pure parts (`registration.test.ts`, `messaging/*.test.ts`,
`organizer/*.test.ts`) and, for `site/`, the real SQL: those tests run every
migration on `node:sqlite` via `test/sqlite-d1.ts`, and
`routes/organizer/retreat/**/actions.test.ts` call the real actions.
Elsewhere, for anything touching SQL, run `pnpm dev` against the local D1
(wrangler handles it) and exercise the route that calls it.
