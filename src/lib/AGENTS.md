# src/lib — shared modules

Everything importable as `$lib/...`. Root-level files are the few things every
surface shares; feature folders own the rest.

## Files at this level

| File | What it is |
|---|---|
| `content.ts` | **Single source of product truth.** Retreat facts (`retreat`, `retreatDates`, `retreatLocation`), survey questions (`interestQuestion`, `travelQuestion`, `datesQuestion`, `locationQuestion`, `youQuestion`), the survey feed order (`feedItems`, `itemTitles`), registration copy (`registration`, `dietaryOptions`, `travelModes`, `waiver`, `codeOfConduct`), waitlist copy. Facts come from `PRODUCT.md`; change them there first. |
| `dates.ts` | Naive ISO-date (`YYYY-MM-DD`) helpers with no timezone math: `iso`, `parseIso`, `addDays`, `diffDays`, `compareIso`, `dayOfWeek`, the survey window (`windowMonths`, `inWindow`, `clampToWindow`), range ops (`inRange`, `rangesOverlap`, `normalizeRanges`, `rangeNights`), and display (`formatDay`, `formatRange`, `portionLabel`). Shared by client and server. |
| `types.ts` | `KnownUser` — the identity shape the `abr_known` cookie carries between visits. |
| `index.ts` | Empty SvelteKit template file. Not a barrel; leave it alone. |
| `assets/` | `favicon.svg`. |

## Folders

| Folder | Owns | Guide |
|---|---|---|
| `ui/` | feed chrome and primitives shared by every surface | `ui/AGENTS.md` |
| `survey/` | availability-survey feed items + `SurveyState` | `survey/AGENTS.md` |
| `auth/` | ATProto OAuth client config + sign-in sheet | `auth/AGENTS.md` |
| `registration/` | Dec 4–7 registration model + feed items | `registration/AGENTS.md` |
| `site/` | the retreat home at `/` (regions, sections, who's coming, posts stream) + `console/`, the `/organizer/retreat` editor | `site/AGENTS.md` |
| `markdown/` | `renderMarkdown` for organizer-written sections (client preview + server render) | `markdown/AGENTS.md` |
| `organizer/` | organizer console components + pure aggregates | `organizer/AGENTS.md` |
| `server/` | D1 access and everything server-only | `server/AGENTS.md` |

## Rules

- **No barrel files.** Import the file you mean:
  `$lib/survey/dates/DatesItem.svelte`, `$lib/server/organizer/admin`.
  Two narrow re-exports are deliberate: `server/messaging/broadcasts`
  re-exports `audiences.ts` (one import site for broadcast types), and
  `server/messaging/bsky-dm` re-exports the DM length limit from
  `organizer/dm-text.ts` (shared with the compose UI).
- **Client → server direction only via routes.** Client folders (`ui`,
  `survey`, `auth`, `registration`, `site`, `markdown`, `organizer`) never import values from
  `server/`. `import type` is fine. If a client component needs a derived
  server value, compute it in the route's `load` and pass it as data (see
  `server/organizer/page-data.ts` for the pattern).
- **Pure logic gets a colocated `*.test.ts`.** `dates.ts`-style helpers,
  aggregates, CSV, validation — anything with no DOM and no D1 handle.
- **Types flow from `content.ts`.** `InterestValue`, `TravelValue`,
  `DayPortion`, `AvailabilityRange`, `FeedItemId`, `DietaryId`, `TravelMode`
  are all declared there; don't redeclare them near their use site.
