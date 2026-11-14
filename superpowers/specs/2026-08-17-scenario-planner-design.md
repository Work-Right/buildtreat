# Scenario planner: persistent anchors + window roster

**Date:** 2026-08-17
**Status:** Approved by Bryan (chainlink #90)

## What this is

The organizer view gains a two-direction scenario planner:

1. **People → dates** (exists today, made persistent): flag respondents as
   *anchors* and see which dates they all share and which 3-night windows fit
   all of them. Today the anchor set is ephemeral client state that dies on
   reload; this feature persists it in D1.
2. **Date → people** (new): pick a candidate 3-night window and see *who* can
   make it and who can't, by name — not just the count.

## Decisions made

| Decision | Choice | Why |
| --- | --- | --- |
| Scope | Backend + wire into existing `/organizer` UI | The anchor UI already exists; this completes the loop |
| Date unit | 3-night retreat window (arrival eve → departure morn) | Matches the booking unit; reuses `windowSlots` semantics |
| Anchor model | Persistent replaces ephemeral | One concept; toggle writes to DB, survives reload |
| Anchor scope | Global (shared across organizers) | Organizer set is a tiny trusted DID list; one shared planning view |
| Storage | Dedicated `anchors` table | Matches the `late_passes`/`allowlist` pattern |
| Roster verdict | Binary available / not-available per window | YAGNI: no near-miss scoring |

## Data model

`migrations/0004_anchors.sql`:

```sql
-- the Atmospheric Builders' Retreat — persistent scenario anchors
-- The organizer's flagged people. Global (shared by all organizers): one
-- planning view, not per-user scenarios. A DID is anchorable only from the
-- responses table, so rows always refer to respondents; un-anchoring deletes.
CREATE TABLE IF NOT EXISTS anchors (
	did TEXT PRIMARY KEY,
	created_at TEXT NOT NULL
);
```

Applied to prod D1 after merge, per the 0002/0003 precedent.

## Server layer (`src/lib/server/organizer.ts`)

Two functions in the existing data-access style (parameterized, no thrown
errors surfaced to the page):

- `listAnchors(db: D1Database): Promise<string[]>` — anchored DIDs, insertion
  order.
- `setAnchor(db: D1Database, did: string, on: boolean): Promise<void>` —
  `INSERT OR IGNORE INTO anchors ...` when on, `DELETE FROM anchors WHERE
  did = ?` when off. Idempotent both directions.

## Aggregate layer (`src/lib/organizer/aggregate.ts`)

One new pure function, same half-day-slot vocabulary as the rest of the file:

```ts
export interface WindowRoster {
	start: string; // arrival day
	end: string;   // departure day
	available: string[];   // DIDs whose slots cover every windowSlots(start) slot
	unavailable: string[]; // responded-with-dates DIDs missing ≥1 slot
}
export function windowRoster(
	respondents: { did: string; ranges: AvailabilityRange[] }[],
	start: string
): WindowRoster;
```

Definition of "fits the window" is exactly `windowFitCount`'s: every slot in
`windowSlots(start)` present in the respondent's `slotSet`. Respondents with
zero ranges are excluded from both lists (they never entered dates).
Runs client-side like the rest of the aggregates — the organizer page already
holds all responses; the page maps DIDs to names/handles for display.

## Form action (`src/routes/organizer/+page.server.ts`)

`?/toggleAnchor` and `?/clearAnchors`, mirroring the existing actions.
`?/toggleAnchor`:

1. Organizer-gated (the whole page already is).
2. `fail(503)` when `platform.env.DB` is missing.
3. Validate: `did` present, and matches a row in `responses` (reject unknown
   DIDs with `fail(400)`).
4. `setAnchor(db, did, on)` where `on` comes from the form (`'1'`/`'0'`).
5. On DB error: log + `fail(500)` with a friendly message — never crash the
   page (same posture as the waitlist action).

`load` additionally returns `anchors: string[]` from `listAnchors` (empty
array when the DB read fails, logged — the page degrades to no anchors rather
than erroring).

## UI (`src/routes/organizer/+page.svelte` + components)

1. **Persistent anchors:** `let anchors = $state(data.anchors)` (was `[]`).
   The existing toggle in `ResponsesTable` submits `?/toggleAnchor` via
   `use:enhance` with optimistic local update and rollback on failure. All
   downstream deriveds (`fullOverlap`, heatmap rings, window-fit chips,
   scenario bar) already consume `anchors` and need no changes. "Clear"
   submits a dedicated `?/clearAnchors` action (one `DELETE FROM anchors`
   round trip; same gating and failure posture as `?/toggleAnchor`).
2. **Window roster panel (new):** in the windows section, each of the top-5
   windows becomes selectable; selecting one shows the roster — "Can make it
   (n)" and "Can't make it (n)" name lists from `windowRoster`. Anchored
   people are visually marked in the roster. Impeccable shapes this panel
   during the build (visualize → comp approval) inside the existing one-ink
   Dusk/Operate organizer world — no new route, no new visual system.

## Error handling summary

- DB unavailable: load degrades (no anchors), toggle fails with 503 message.
- Unknown DID in toggle: 400, no write.
- Toggle race (two organizers): last write wins; `INSERT OR IGNORE`/`DELETE`
  are idempotent so no constraint errors.
- Corrupt/absent ranges: `windowRoster` treats no-ranges respondents as
  "didn't enter dates" and lists them in neither bucket.

## Testing & verification

Project has no unit-test runner; convention is:

- `pnpm check` (svelte-check) and `pnpm build` green.
- Playwright against preview fixtures: (a) toggle an anchor, reload, the
  anchor is still lit and overlap rings render; (b) select a fixture window,
  the roster partitions names correctly, including a half-day edge case
  (someone whose range ends `first_half` on the window's last full day must
  appear in "can't make it").
- Post-merge: apply migration 0004 to prod D1, smoke-test on
  buildersretre.at/organizer.

## Out of scope (deliberate)

- Near-miss scoring ("misses only 1 slot").
- Per-organizer anchor sets.
- A dedicated planner route.
- Anchoring people who haven't responded.
