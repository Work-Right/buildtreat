# Waitlist signup — design spec

**Date:** 2026-08-11 · **Issue:** chainlink #75 · **Status:** approved shape,
pending surface design (impeccable `shape`)

## Problem

The retreat invited a select group directly; that group is enforced by the
`allowlist` table and the survey's sign-in gate. Uninvited people who sign in
today hit a dead-end `notInvited` state ("this survey is invite-only, @you
isn't on the list"). Bryan is announcing the invite-first approach via a blog
post and wants uninvited-but-interested people to register lightweight
interest, so he can promote them once the dates are locked and have them fill
out the full survey then.

## Goals

- Let an uninvited, signed-in visitor add themselves to a waitlist with
  minimal friction.
- Give the organizer a way to see the waitlist and promote people into the
  real survey.
- Never show a "bait-and-switch" rejection: the hero must set honest,
  two-track expectations *before* sign-in, and the uninvited state must read
  as an invitation, not a wall.

## Non-goals (YAGNI)

- **No availability collection on the waitlist.** Availability is the survey's
  most expensive question and, pre-date-lock, it's against an unknown window.
  It's deferred to the real survey, which a promoted person fills out after
  the date is locked — at which point "availability" is a cheap yes/no against
  a concrete date, not the full range picker.
- **No coarse month-triage hint.** Considered (Sep/Oct/Nov checkboxes for
  promote-order triage) and cut, to keep the form to its minimum.
- **No email/notification automation in this iteration.** The waitlist stores
  an email so the organizer can reach people; the act of emailing promoted
  people is manual/out-of-band for now. (Automating it can be a later
  iteration.)
- No separate `/waitlist` route — the entry point is the existing hero.

## Identity & the promote path

Waitlisters sign in with ATProto (same as the survey), which yields a verified
`handle` + `did`. **Promotion = inserting their handle into the `allowlist`
table.** The existing survey gate then admits them with the identity they
already have; nothing new in the auth path. This is the core reuse that makes
the feature small.

## Data model

New migration `0003_waitlist.sql`:

```sql
CREATE TABLE IF NOT EXISTS waitlist (
    did TEXT PRIMARY KEY,
    handle TEXT,
    email TEXT NOT NULL,
    created_at TEXT NOT NULL,
    promoted_at TEXT            -- set when the organizer promotes them
);
```

- `did` is the primary key: one waitlist entry per identity, and re-signing-in
  is idempotent (upsert on `did`).
- `handle` is stored for display and because promotion writes it into
  `allowlist(handle, …)`.
- `email` is required (the only captured field beyond sign-in) — it's how the
  organizer reaches a promoted person, and it pre-fills the survey's email
  later.
- `promoted_at` distinguishes "waiting" from "promoted" without a second table.

## Surface: the hero, three signed states + one pre-sign-in reframe

The waitlist lives entirely in the existing hero (`HeroItem.svelte`), which
already branches on `signedIn` / `notInvited` / `closed`. Changes:

1. **Pre-sign-in (audience unknown) — reframe the promise.** Today the CTA
   implies "sign in → survey," which bait-and-switches uninvited people. Add a
   short two-track line near the "Sign in with Atmosphere" action so both
   audiences know where they'll land: invited builders continue to the survey;
   everyone else adds their name to the waitlist. The button label stays "Sign
   in with Atmosphere" (brand commitment). Exact copy is impeccable's job.

2. **Signed-in + not invited + not yet on waitlist — invitation, not a wall.**
   Replace the current "invite-only, you're not on the list" rejection with a
   warm framing ("first invites went to a small group — there's room on the
   waitlist, we'd love your name on it") plus the single email field and a
   "Join the waitlist" action. Keep a small secondary "think this is a
   mistake? DM @chaosgreml.in" as the escape hatch for genuinely-should-be-
   invited people — not as the headline.

3. **Signed-in + already on waitlist — confirmation.** A returning waitlister
   who signs in again sees "You're on the list — we'll be in touch as spots
   open," never the form a second time.

The invited and already-submitted states are unchanged.

## Data flow

- **Load** (`+page.server.ts`): when a signed-in user is `!allowed`, also look
  up whether their `did` is in `waitlist` → pass `waitlistState:
  'none' | 'member'` to the hero.
- **Join** (form action, e.g. `?/joinWaitlist`): requires an authenticated
  session; validates email; upserts `waitlist(did, handle, email, created_at)`.
  Idempotent on `did`.
- **Organizer** (`/organizer`): a new "Waitlist" section — count + a list of
  `handle · email · joined`, each with a one-click **Promote** action that
  inserts the handle into `allowlist` and stamps `promoted_at`. Gated by the
  existing `ORGANIZER_DIDS` check. Promoted rows read as promoted (or filter
  out) so the organizer sees who's still waiting.

## Error handling & edge cases

- Join without a valid session → rejected (the action requires auth; the UI
  only shows the form to signed-in uninvited users).
- Invalid/empty email → inline validation, same grammar as the survey's email
  field (`EMAIL_RE`).
- Double-join / re-sign-in → upsert on `did`, no duplicate; UI shows the
  member confirmation state.
- Someone on the waitlist who later gets promoted and signs in → `allowed` is
  now true → they fall through to the normal survey. (The waitlist row's
  `promoted_at` is set; they no longer match the `notInvited` branch.)
- Deadline/closed state takes precedence over the waitlist affordance where it
  already does (the `closed` branch), consistent with current behavior.

## Testing

- Unit: email validation reuse; waitlist upsert idempotency on `did`;
  promote writes the handle into `allowlist` and stamps `promoted_at`.
- Server: load returns the correct `waitlistState` (`none`/`member`) for an
  uninvited user, and a promoted user is `allowed` (never reaches the waitlist
  branch); join action rejects unauthenticated and invalid-email requests.
- Browser (`?preview` parity where feasible): the three hero states render;
  join flow shows confirmation; organizer promote moves a row.

## Reuse / touch list

- `migrations/0003_waitlist.sql` (new)
- `src/lib/components/HeroItem.svelte` (pre-sign-in reframe + two new states)
- `src/routes/+page.server.ts` (waitlistState in load; `joinWaitlist` action)
- `src/lib/server/` (a `waitlist.ts` data-access module, mirroring
  `organizer.ts` conventions; parameterized queries)
- `src/routes/organizer/+page.svelte` + server (Waitlist section + promote
  action)
- `src/lib/content.ts` (waitlist copy, once impeccable drafts it)

## Open item for the surface phase

All user-facing copy (the two-track pre-sign-in line, the invitation rewrite,
the confirmation state) is deliberately left to **impeccable `shape`**, which
designs it inside the Dusk Feed world (DESIGN.md) rather than being written
ad hoc here.
