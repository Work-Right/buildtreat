# src/ — the app

SvelteKit 2 + Svelte 5 (runes) on Cloudflare Workers, D1 for storage, KV for
OAuth session state, comail.at for outbound email, the Bluesky chat service
for organizer DMs. Three surfaces, one worker:

| Surface | Route | Who | What |
|---|---|---|---|
| Retreat home + registration | `/` (`/?register`) | everyone; invited builders (ATProto sign-in) see more | the "Dusk to night" retreat home (`lib/site/`): organizer-edited sections (public / invited), status strip, who's coming, posts stream (updates + Bluesky posts); the Dec 4–7 registration flow at `/?register` |
| Retreat info editor | `/organizer/retreat` (+ `/attendees`) | DIDs in `ORGANIZER_DIDS` | sections, updates, photos, Bluesky posts in the stream; who's coming curation (`lib/site/console/`, `lib/server/site/`) |
| Organizer console | `/organizer` | DIDs in `ORGANIZER_DIDS` | heatmap, windows, responses, allowlist, late passes, waitlist, registrations (+ per-attendee edit), email and Bluesky DM broadcasts |

## Map

```
src/
  app.css            global tokens + the five shared classes (.kicker .display .pill .ledger .visually-hidden)
  hooks.server.ts    host canonicalization → OAuth returnTo fix → ATProto auth handle
  routes/            SvelteKit pages, actions, and endpoints         → routes/AGENTS.md
  lib/
    content.ts       product truth (dates, venue, copy, question text) — facts come from PRODUCT.md
    dates.ts         naive ISO-date helpers shared by client and server
    types.ts         cross-surface identity types
    ui/              feed chrome + primitives (Icon, Rail, FeedItem…) → lib/ui/AGENTS.md
    survey/          availability survey feed items + SurveyState     → lib/survey/AGENTS.md
    auth/            ATProto OAuth config + sign-in sheet             → lib/auth/AGENTS.md
    registration/    Dec 4–7 registration model + feed items          → lib/registration/AGENTS.md
    site/            the retreat home at `/` (regions, sections, nav) + console/ editor → lib/site/AGENTS.md
    markdown/        section markdown renderer (markdown-it, html off) → lib/markdown/AGENTS.md
    organizer/       organizer console components + pure aggregates  → lib/organizer/AGENTS.md
    server/          D1 access + server-only logic ($lib/server guard) → lib/server/AGENTS.md
```

Each folder's `AGENTS.md` says what lives there, the boundaries that matter,
and what to run before you call a change done. The `CLAUDE.md` beside it is
a one-line `@AGENTS.md` import so Claude Code loads the guide on demand —
keep the content in `AGENTS.md` (Codex and other agents read that name), and
give any new folder both files.

## Conventions that hold everywhere

- **Soft cap: 400–500 lines per file.** When a file approaches it, split by
  responsibility (a section component, a pure helper module) — not by
  technical layer.
- **`$lib/server/*` is server-only.** SvelteKit blocks any runtime import of
  it from browser-reachable code. Route `+page.server.ts` files and
  `+server.ts` endpoints are the only bridge; `import type` from `$lib/server`
  is fine in client code because it's erased at compile time.
- **All D1 SQL is parameterized.** No string-built queries, ever.
- **Svelte 5 runes only.** `$props()`, `$state`, `$derived`, `$bindable`,
  callback props. No `createEventDispatcher`, no `$:` labels, no stores for
  component-local state.
- **Scoped styles stay scoped.** Shared section styling (`.section-head`,
  `.section-title`, …) is deliberately duplicated per component rather than
  hoisted to a global class. Only the five classes in `app.css` are global.
- **Design system is DESIGN.md** ("The Dusk Feed"): one ground `#0b0908`,
  white ink at opacity steps, Big Shoulders display / Hanken Grotesk body,
  hairline ledgers, the white pill for real actions. No cards, no shadows,
  no second color. Don't invent tokens; extend the ones in `app.css`.
- **Copy is product truth.** Dates, venue, deadlines, and question wording
  live in `lib/content.ts` and come from `PRODUCT.md`. Don't restate them
  in components.

## Verify

```
pnpm check      # svelte-kit sync + svelte-check (0 errors, 0 warnings is the bar)
pnpm test       # vitest — pure modules under lib/ have colocated *.test.ts
pnpm build      # vite build against the Cloudflare adapter
pnpm dev        # local; /organizer?preview renders synthetic data in dev only
```

Screenshots: `node scripts/shot.mjs <url> <out.png> <w> <h> [full]` with
`PLAYWRIGHT_BROWSERS_PATH=$PWD/.playwright-browsers`.
