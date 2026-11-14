# Registration flow — design

**Date:** 2026-08-25
**Status:** Approved by Bryan (conversation, 2026-08-25)
**Scope:** Attendance confirmation + registration form + organizer roster.
The retreat date is locked; registration replaces the survey as the site's
front door for allowlisted users.

## Locked facts

- **Retreat dates:** Dec 4–7, 2026 (Fri–Mon, 3 nights).
- **Location:** Palm Springs or the Coachella Valley — exact venue is booked
  (VRBO/AvantStay) once the headcount locks. Copy must say this honestly.
- **Registration deadline:** Sep 7, 2026, 11:59:59 PM Pacific
  (`REG_DEADLINE = "2026-09-08T06:59:59Z"`, wrangler var, mirroring the
  existing `DEADLINE` pattern). After it: new confirmations closed with a
  "ping Bryan" message; **travel edits stay open indefinitely** — travel
  solidifies late by design. Declines stay open too (we always want to know).

## Approaches considered

1. **Fixed-schema form, existing design language — chosen.** The fields are
   known and stable; editable copy lives in `content.ts`. No new deps.
2. **Organizer form-builder (component library).** Dynamic field schema +
   renderer + EAV answer storage. 3–4x the work for one known form; every
   change still goes through Bryan anyway. Rejected.

## Schema — migration `0006_registrations.sql`

```sql
CREATE TABLE IF NOT EXISTS registrations (
	did TEXT PRIMARY KEY,
	handle TEXT,
	name TEXT NOT NULL,
	email TEXT NOT NULL,
	status TEXT NOT NULL,             -- 'confirmed' | 'declined'
	phone TEXT,
	emergency_name TEXT,
	emergency_phone TEXT,
	dietary TEXT,                     -- JSON array of option ids
	dietary_other TEXT,
	accessibility TEXT,
	notes TEXT,
	travel_arrival TEXT,              -- free text: when/where they arrive
	travel_departure TEXT,
	travel_mode TEXT,                 -- 'flying' | 'driving' | 'train' | 'other' | NULL
	travel_details TEXT,              -- flight numbers, rideshare offers, etc.
	waiver_version TEXT,
	coc_version TEXT,
	agreed_at TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);
```

One row per DID, upserted. **"Registered" is derived, not stored**: a row
with `status = 'confirmed'` and `agreed_at` set is a complete registration.
A confirmed row without `agreed_at` cannot exist through the UI (agreements
are required to submit), but the derivation keeps the invariant honest.
Name/email prefill from the survey `responses` row when present; both
editable (someone's contact email for logistics may differ from their
survey email). Same `EMAIL_RE` validation as the survey.

## Content — `content.ts` additions

- `retreatDates`: `{ start: '2026-12-04', end: '2026-12-07', display: 'December 4–7, 2026', nights: 3 }`.
- `retreatLocation`: display line + the venue-pending explanation.
- `dietaryOptions`: `vegetarian`, `vegan`, `gluten_free`, `dairy_free`,
  `kosher`, `halal`, `nut_allergy`, `shellfish_allergy` + free-text other.
- `travelModes`: flying / driving / train / other.
- `waiver`: `{ version: 'v1', title, body }` — hold-harmless draft written
  by Claude, **clearly marked as a non-lawyer draft** in a code comment;
  Bryan swaps text freely; version bumps force nothing retroactively (a
  future re-agreement flow would key off version mismatch, out of scope).
- `codeOfConduct`: `{ version: 'v1', title, body }` — same terms.

## User flow (front door)

Access rule: signed-in + allowlisted (same gate as the survey used;
`surveyGate` logic reused). Newly-allowlisted people land here directly and
never see the survey. Waitlist flow for non-allowlisted is unchanged.

1. **Announcement state** (no registration row): the locked dates + location
   line + deadline, then two actions: **I'm in** → opens the form;
   **Can't make it** → saves `status='declined'` immediately (one tap, no
   form), with an undo path (switching back reopens the form).
2. **The form** (status will be `'confirmed'`): sections in order —
   contact (name, email, phone), dietary (checkboxes + other), emergency
   contact (name + phone, required), accessibility needs (textarea,
   optional, asked plainly), anything-else notes (optional), travel
   (optional at registration: arrival, departure, mode, details), then
   agreements: two required checkboxes, each with the full text expandable
   inline (`<details>`), versions + `agreed_at` stamped server-side at
   submit. Required to submit: name, email, emergency name + phone, both
   agreements. Everything else optional.
3. **Registered state**: summary of their answers, edit affordance for
   everything, travel section visually emphasized as "update as plans firm
   up". Post-deadline this state remains fully editable except status
   cannot flip from declined→confirmed (deadline message instead).
4. **Survey answers**: reachable read-only from a quiet link ("your
   availability survey answers"), rendering existing summary components.
   The survey stops being a destination.

Deadline behavior matrix:
- Before Sep 7: everything open.
- After: no NEW confirmations (announcement state shows closed + contact
  message); existing registrations stay editable (travel, dietary, etc.);
  declines always recordable; organizer mutations unaffected.

## Server

`src/lib/server/registration.ts` — D1 access + validation, mirroring
`waitlist.ts` conventions (parameterized, typed rows, JSDoc):
- `getRegistration(db, did)`
- `upsertRegistration(db, input)` — validates, stamps versions/agreed_at on
  confirmed submissions, preserves `created_at`/first `agreed_at`.
- `declineRegistration(db, who)` — minimal row, no agreements needed.
- `listRegistrations(db)` — organizer roster.
- `registrationCounts(rows)` — pure: confirmed / declined / no-response
  (derived against the allowlist), for the venue headcount.
- Validation helpers are pure and unit-tested (phone: lenient, non-empty
  trimmed; dietary ids validated against the content list).

Actions live on the home `+page.server.ts` (`?/register`, `?/decline`)
following existing action conventions; deadline enforced server-side via
`REG_DEADLINE` with the same `deadlineStatus` helper pattern.

## Organizer — Registrations section on `/organizer`

- **Headcount block** (the venue decision instrument): confirmed /
  declined / no response, with the deadline countdown.
- **Roster table**: name, handle, dietary summary, accessibility flag,
  travel status (none / partial / complete), agreement versions, updated_at.
  Expandable row detail for full answers.
- **`registrations.csv`** export route following `responses.csv` pattern
  (organizer-gated), with all columns — this is what gets handed to the
  venue/caterer.
- **No response yet** list = allowlisted DIDs/handles minus registration
  rows minus waitlist-only folks — the nudge list for a reminder broadcast.
- Preview fixtures extended with synthetic registrations.

## Confirmation email (best-effort)

On a completed registration, send a confirmation via `sendEmail` (existing
comail transport, no category): dates, location line, what-happens-next,
their travel answers. Failure is logged and NEVER blocks the registration
response. Note: comail is in ramping tier until Sep 2 (50/day) — fine for
registration volume; the wedged warming-queue issue (chainlink #93) must be
resolved with comail before launch or confirmations silently queue.

## Design/mocks process

Impeccable comp round before implementation, extending the existing
DESIGN.md system (not a new direction): announcement state, form, registered
state (+ organizer section inherits organizer language). Bryan gates the
comp choice; finish review runs against the approved comp post-build.

## Testing

- Vitest: validation helpers, `registrationCounts`, deadline gate logic,
  dietary id validation, upsert serialization (pure parts).
- svelte-check + autofixer on new components; visual `?preview` check.

## Out of scope

- Room-share/lodging preferences (explicitly skipped).
- Payments/deposits.
- Re-agreement flow on waiver/CoC version bump.
- Broadcast changes (announcement email is composed in the existing panel).
- Survey reopening or edits.
