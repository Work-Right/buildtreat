# Contributing to buildersretre.at

Welcome! This is the site for the Atmospheric Builders' Retreat
(December 4–7, 2026). It has three parts:

- **The retreat home** at `/`. Anyone can see the public story. Invited
  builders who sign in also see logistics, and they register at
  `/?register`.
- **The retreat info editor** at `/organizer/retreat`. This is where
  organizers write the sections, post updates, upload photos, and choose
  who appears in "Who's coming".
- **The organizer console** at `/organizer`. This has the allowlist,
  registrations, CSV exports, and email and Bluesky DM broadcasts.

It's a SvelteKit 2 / Svelte 5 app that runs on Cloudflare Workers. It
stores data in Cloudflare D1 (SQLite), KV and R2 (photos). Sign-in is
"Sign in with Atmosphere" (ATProto OAuth): we learn who you are from your
Bluesky/ATProto identity and never touch anyone's repo.

This guide covers how to get it running, how the code is laid out, and
how changes get from your laptop to the live site.

---

## Read this first: four rules

1. **This repository is public.** Everything you commit is visible to
   the world, and that includes commit messages.
2. **Never commit anything that identifies the venue.** That means the
   house name, its website, the town, the address, or photos of the
   house. The public site only ever says "near Palm Springs". The real
   details reach invited people by email, or as content Bryan enters
   through the editor. That content lives in the database, not the code.
3. **Never commit secrets** (API keys, `.env`, `.dev.vars`). You don't
   need any secrets for local development (see below).
4. **Never push to `main`.** Merging to `main` deploys straight to the
   live site. All work goes through a pull request, and Bryan merges.

---

## Setup

### What you need

- **Node.js 22 or newer.** We use 26.
- **pnpm.** The repo pins pnpm 10 in `package.json`. If you have a newer
  pnpm installed, it automatically switches to the pinned version for
  this repo. Don't use npm or yarn, because the production build
  installs strictly from `pnpm-lock.yaml`.
- A **Bluesky / ATProto account**, to sign in locally.

You do **not** need a Cloudflare account. Everything runs locally against
simulated D1, KV and R2.

### First-time setup

```sh
git clone https://github.com/Work-Right/buildtreat.git
cd buildtreat
pnpm install
```

Next, set up the local ignore rules and git hooks. The project's own
ignore rules live in a file called `.gitignore.local`, which isn't
committed, so a fresh clone doesn't have it yet. Create it, then run the
hook installer, which wires it into git:

```sh
cat > .gitignore.local <<'EOF'
.wrangler/
.wrangler-home/
.dev.vars
.playwright-browsers/
*.har
.worktrees/
.impeccable/mocks/private/
.impeccable/review/
docs/broadcasts/
EOF
./scripts/install-hooks.sh
```

The hooks block commits and pushes to `main`, and run the type check and
tests before every push. The hooks also try to run two tools Bryan uses
(`chainlink` and `deciduous`, described below). If you don't have them,
those steps print a warning and carry on. That's expected.

### Create the local database

```sh
pnpm exec wrangler d1 migrations apply buildtreat --local
```

This applies everything in `migrations/` to a local SQLite file under
`.wrangler/state/`. Run it again whenever someone adds a migration.

---

## Running it locally

```sh
pnpm dev --host 127.0.0.1
```

Then open **http://127.0.0.1:5173**. Use `127.0.0.1`, not `localhost`.
Local sign-in uses ATProto's loopback OAuth client, which only works on
`127.0.0.1`. On `localhost` you'll sign in and then appear signed out.

### Previews that need no sign-in or data

In dev only (these are compiled out of production), you can see every
state of the UI with fake data:

| URL | Shows |
|---|---|
| `/?preview` | the home page as a signed-in invited builder |
| `/?preview=registered`, `=declined`, `=register` | the registration states |
| `/?preview=notinvited`, `=member` | the not-invited and waitlist states |
| `/organizer?preview` | the organizer console with synthetic data |
| `/organizer/retreat?preview`, `/organizer/retreat/attendees?preview` | the editor and the attendee curation page |

This is the fastest way to do visual work.

### Seeing the real flows as yourself

Sign-in works locally with your real Bluesky account. What you can see
depends on the local database and config.

**To see the invited view,** add your handle to the local allowlist:

```sh
pnpm exec wrangler d1 execute buildtreat --local \
  --command "INSERT INTO allowlist (handle) VALUES ('you.bsky.social')"
```

**To register:** the registration deadline has passed, so you also need
a "late pass":

```sh
pnpm exec wrangler d1 execute buildtreat --local \
  --command "INSERT INTO late_passes (handle, granted_at) VALUES ('you.bsky.social', '2026-11-01T00:00:00Z')"
```

**To get into the organizer pages,** create a file called `.dev.vars` in
the repo root with your DID. Find your DID at
`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=you.bsky.social`.

```sh
ORGANIZER_DIDS="did:plc:your-did-here"
```

`.dev.vars` overrides the settings in `wrangler.jsonc` on your machine
only. Never edit `ORGANIZER_DIDS` in `wrangler.jsonc` to give yourself
local access, because that file is the production config.

Organizers can also preview the home page as other people would see it,
at `/?as=public` and `/?as=invited`.

Email and Bluesky DM sending don't work locally, because they need
production secrets. The code checks for those and skips sending. You
won't break anything by clicking around.

---

## How the code is organized

```
src/
  routes/          pages, form actions and endpoints (thin: they call into lib/)
  hooks.server.ts  host redirect, OAuth workaround, sign-in
  lib/
    content.ts     ALL product copy and facts (dates, labels, questions)
    site/          the retreat home, plus console/ (the retreat info editor)
    registration/  the Dec 4–7 registration flow
    organizer/     organizer console components
    auth/          sign-in sheet and OAuth config
    markdown/      renders organizer-written section text
    ui/            shared primitives (icons, rails, feed items)
    survey/        the original availability survey (retired, still in the code)
    server/        everything that touches the database or secrets
migrations/        D1 schema, applied in order
static/            fonts, images
```

**Every folder under `src/` has an `AGENTS.md`.** They were written for AI
coding agents, but they're the best map of the code for humans too. Each
one says what the files do, the rules that matter in that folder, and how
to check your work. Start with `src/AGENTS.md`. The `CLAUDE.md` file next
to each one is a one-line pointer, so ignore those.

Other useful docs:

- `PRODUCT.md`: who the site is for, plus the product facts.
- `DESIGN.md`: the visual system ("The Dusk Feed"). Read it before any
  UI work.
- `docs/superpowers/specs/` and `plans/`: the design notes for each major
  feature. `2026-10-31-retreat-site-design.md` covers the current home
  page.

---

## Conventions

- **Svelte 5 runes only:** `$props()`, `$state`, `$derived`, `$effect`.
  Don't use `$:`, stores for component state, or `createEventDispatcher`.
  Pass callbacks as props.
- **Don't `bind:` a prop of a child component on a page that sets a
  `<title>`.** It drops the title during server rendering, a SvelteKit
  quirk we've been bitten by. Use a value plus a callback instead. Binding
  DOM properties like `bind:clientHeight` is fine.
- **`$lib/server/*` is server-only.** Client code can `import type` from
  it but never import values. Routes are the bridge: compute in `load` and
  pass the result down as data.
- **Every SQL query is parameterized** (`.bind(...)`). Never build SQL
  from strings.
- **Copy lives in `src/lib/content.ts`,** not in components. Product
  facts come from `PRODUCT.md`.
- **Visibility is decided on the server.** The home page components never
  filter sections or photos. The server only sends what the viewer may
  see, and photos are re-checked when they're fetched
  (`/media/site/[id]`). Keep it that way.
- **Design system:** one dark ground, white text at fixed opacity steps,
  Big Shoulders for display type and Hanken Grotesk for body text,
  hairline rules, and a white pill button for real actions. No cards, no
  shadows, no second color. Use the tokens in `src/app.css` rather than
  inventing new ones. Details are in `DESIGN.md`.
- **Keep files under about 450 lines.** When a file gets big, split it by
  responsibility.
- **Formatting:** there's no formatter config, so match the surrounding
  code (tabs, single quotes, semicolons).

---

## Checking your work

Run these before opening a PR. All three should pass cleanly:

```sh
pnpm check   # type check + Svelte check: 0 errors, 0 warnings is the bar
pnpm test    # vitest
pnpm build   # production build for Cloudflare
```

There's no CI that runs these on GitHub yet, so please run them yourself.
The pre-push hook runs the type check and tests for you.

**Tests** sit next to the code they test (`*.test.ts`). Database code is
tested against a real SQLite database with every migration applied:
`sqliteD1()` in `src/lib/server/test/sqlite-d1.ts`. It runs on Node's
built-in `node:sqlite`, so there's nothing to mock. Look at
`src/routes/organizer/retreat/actions.test.ts` for how form actions are
tested end to end.

For UI changes, look at the page at phone width (393px) and at desktop
width (1440px). The `?preview` URLs above help with that.

---

## Changing the database

Schema changes are new numbered files in `migrations/`
(`0012_something.sql`, and so on). Never edit a migration that has
already shipped. Apply it locally with the `migrations apply --local`
command above, and add tests.

**Call out any new migration in your PR description.** Production
migrations are applied by hand, by Bryan, **before** the PR merges. The
code that needs the new schema deploys as soon as it merges, so the
schema has to be there first.

---

## From branch to live site

1. **Branch from `main`.** Name it like `feat/…`, `fix/…`, `docs/…` or
   `chore/…`.
2. **Commit with conventional commit messages,** for example
   `feat(site): add travel FAQ section` or
   `fix(organizer): keep the filter when paging`. Commit often.
3. **Stage files by name** (`git add src/lib/site/Foo.svelte`), not
   `git add .`. That keeps local files out of the public repo.
4. **Open a pull request against `main`.** Say what changed and why, how
   you tested it, and whether it includes a migration.
5. **CodeRabbit,** an AI reviewer, reviews every PR automatically and
   reviews again on each push. Reply on each of its comment threads:
   either fix the issue and say so, or explain why you're not changing
   it. Don't ask it for a full re-review, because it's rate-limited.
6. **Bryan reviews and merges.** PRs are squash-merged.
7. **Merging deploys.** Cloudflare Workers Builds builds `main` and
   deploys it to buildersretre.at within a minute or two. There's no
   staging environment, which is why the checks above matter.

If your branch falls behind `main`, merge `main` into it
(`git merge origin/main`) rather than rebasing.

---

## Things you can ignore

The repo carries tooling for Bryan's AI-assisted workflow. You don't need
any of it to contribute:

- `CLAUDE.md`, the `CLAUDE.md` shims, `.claude/`, `.github/agents/` and
  `.github/skills/`: configuration for AI coding agents.
- `.chainlink/`: Bryan's local issue tracker.
- `.deciduous/`, `docs/graph-data.json` and `docs/git-history.json`: a
  decision log. The two JSON files are regenerated automatically, so
  never hand-edit them. If a merge conflicts only on them, take either
  side.
- `.impeccable/` and `.superpowers/`: design and planning working files.
- `LAUNCH.md`: the original launch runbook.

If you use Claude Code in this repo, be aware that its hooks expect the
`chainlink` issue tracker to be installed and will block edits without
it. Ask Bryan before relying on it here.

---

## Questions

Ask Bryan (@chaosgreml.in). He owns product decisions, anything touching
production data or secrets, and the venue details.
