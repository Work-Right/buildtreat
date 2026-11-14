# Scenario Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the organizer's anchor set in D1 and add a "pick a 3-night window → see who can/can't make it" roster to `/organizer`.

**Architecture:** New `anchors` table + two data-access functions in the existing server layer; one pure `windowRoster` function beside the other aggregates; two form actions mirroring the existing action pattern; the page seeds its anchor state from `load` and syncs toggles via programmatic action POSTs with optimistic update. The roster panel is the only new visual surface and goes through impeccable (comp → approval → build).

**Tech Stack:** SvelteKit 2 (Svelte 5 runes), Cloudflare D1, Playwright for verification. No unit-test runner exists in this repo.

**Spec:** `docs/superpowers/specs/2026-08-17-scenario-planner-design.md`

## Global Constraints

- pnpm only; commit `pnpm-lock.yaml` with any `package.json` change (no package changes expected).
- All SQL parameterized. No new dependencies.
- Verification convention (no unit runner): `pnpm check` (svelte-check, 0 errors) + `pnpm build` green per task; Playwright fixture checks in the final task. This replaces the per-task unit-test cycle — the repo has no test script, and project convention (CLAUDE.md) wins.
- Branch: `feat/scenario-planner` (already created; spec committed). Conventional commits. Chainlink issue #90.
- D1 binding is `DB`, database name `buildtreat`, migrations dir `migrations` (`wrangler.jsonc`).
- Wrangler needs `HOME` override in this sandbox: prefix commands with `env HOME="$PWD/.wrangler-home"` (see `.wrangler-home/`, per project memory).
- Preview fixtures (`?preview`) must keep rendering without a DB.

---

### Task 1: Anchors migration + server data access

**Files:**
- Create: `migrations/0004_anchors.sql`
- Modify: `src/lib/server/organizer.ts` (append after the late-passes section, ~line 208)

**Interfaces:**
- Produces: `listAnchors(db: D1Database): Promise<string[]>`, `setAnchor(db: D1Database, did: string, on: boolean): Promise<void>`, `clearAllAnchors(db: D1Database): Promise<void>` — consumed by Task 3.

- [ ] **Step 1: Write the migration**

`migrations/0004_anchors.sql`:

```sql
-- the Atmospheric Builders' Retreat — persistent scenario anchors
-- The organizer's flagged people. Global (shared by all organizers): one
-- planning view, not per-user scenarios. Rows always refer to respondents
-- (the toggle only exists on the responses table); un-anchoring deletes.
CREATE TABLE IF NOT EXISTS anchors (
	did TEXT PRIMARY KEY,
	created_at TEXT NOT NULL
);
```

- [ ] **Step 2: Apply locally**

Run: `env HOME="$PWD/.wrangler-home" pnpm wrangler d1 migrations apply buildtreat --local`
Expected: `0004_anchors.sql` listed and applied without error.

- [ ] **Step 3: Add the server functions**

Append to `src/lib/server/organizer.ts` after `hasLatePass` (before the "effective deadline" section):

```ts
/* ── scenario anchors ── */

/** Anchored respondent DIDs, oldest first. Global across organizers. */
export async function listAnchors(db: D1Database): Promise<string[]> {
	const rows = await db.prepare(`SELECT did FROM anchors ORDER BY created_at`).all<{ did: string }>();
	return rows.results.map((r) => r.did);
}

/** Idempotent both directions: re-anchoring or re-clearing a DID is a no-op. */
export async function setAnchor(db: D1Database, did: string, on: boolean): Promise<void> {
	if (on) {
		await db
			.prepare(`INSERT OR IGNORE INTO anchors (did, created_at) VALUES (?1, ?2)`)
			.bind(did, new Date().toISOString())
			.run();
	} else {
		await db.prepare(`DELETE FROM anchors WHERE did = ?1`).bind(did).run();
	}
}

export async function clearAllAnchors(db: D1Database): Promise<void> {
	await db.prepare(`DELETE FROM anchors`).run();
}
```

- [ ] **Step 4: Verify**

Run: `pnpm check`
Expected: `0 ERRORS 0 WARNINGS`

- [ ] **Step 5: Commit**

```bash
git add migrations/0004_anchors.sql src/lib/server/organizer.ts
git commit -m "feat: anchors table + server data access for persistent scenario anchors (#90)"
```

---

### Task 2: `windowRoster` aggregate

**Files:**
- Modify: `src/lib/organizer/aggregate.ts` (after `windowFitCount`, ~line 122)

**Interfaces:**
- Consumes: existing `windowSlots(start)`, `slotSet(ranges)` from the same file.
- Produces: `windowRoster(respondents: { did: string; ranges: AvailabilityRange[] }[], start: string): WindowRoster` with `interface WindowRoster { start: string; end: string; available: string[]; unavailable: string[] }` — consumed by Task 5.

- [ ] **Step 1: Implement**

Insert after `windowFitCount`:

```ts
export interface WindowRoster {
	/** Arrival day of the 3-night window. */
	start: string;
	/** Departure day (start + 3). */
	end: string;
	/** DIDs whose slots cover every required window slot. */
	available: string[];
	/** DIDs who gave dates but miss at least one required slot. */
	unavailable: string[];
}

/**
 * Who can make the 3-night window starting `start` — same fit definition as
 * windowFitCount, partitioned into names instead of a count. Respondents
 * with no ranges never entered dates and appear in neither list.
 */
export function windowRoster(
	respondents: { did: string; ranges: AvailabilityRange[] }[],
	start: string
): WindowRoster {
	const need = windowSlots(start);
	const s = parseIso(start);
	const dep = new Date(Date.UTC(s.y, s.m - 1, s.d + 3));
	const end = iso(dep.getUTCFullYear(), dep.getUTCMonth() + 1, dep.getUTCDate());
	const available: string[] = [];
	const unavailable: string[] = [];
	for (const r of respondents) {
		if (r.ranges.length === 0) continue;
		const slots = slotSet(r.ranges);
		(need.every((k) => slots.has(k)) ? available : unavailable).push(r.did);
	}
	return { start, end, available, unavailable };
}
```

- [ ] **Step 2: Verify**

Run: `pnpm check`
Expected: `0 ERRORS 0 WARNINGS`

- [ ] **Step 3: Commit**

```bash
git add src/lib/organizer/aggregate.ts
git commit -m "feat: windowRoster — who fits a 3-night window, by DID (#90)"
```

---

### Task 3: Load + form actions

**Files:**
- Modify: `src/routes/organizer/+page.server.ts`

**Interfaces:**
- Consumes: `listAnchors`, `setAnchor`, `clearAllAnchors` (Task 1).
- Produces: `OrganizerPageData.anchors: string[]`; actions `?/toggleAnchor` (fields `did`, `on` = `'1'|'0'`) and `?/clearAnchors` — consumed by Task 4.

- [ ] **Step 1: Wire the load**

1. Add `listAnchors, setAnchor, clearAllAnchors` to the `$lib/server/organizer` import.
2. Add `anchors: string[];` to `OrganizerPageData` and `anchors: [],` to `EMPTY`.
3. In `load`, extend the `Promise.all`:

```ts
const [responses, allowlist, latePasses, waitlist, reopened, anchors] = await Promise.all([
	getAllResponses(db),
	listAllowlist(db),
	listLatePasses(db),
	listWaitlist(db),
	isReopened(db),
	listAnchors(db).catch((e) => {
		console.error('anchor load failed', e);
		return [] as string[];
	})
]);
```

and add `anchors,` to the returned object.
4. In `previewData()`, add to the returned object: `anchors: ['did:plc:preview2', 'did:plc:preview5'],` (two fixture DIDs with ranges — gives Playwright a deterministic persisted-anchor state). Update the function's return type omission list only if svelte-check demands it.

- [ ] **Step 2: Add the actions**

Append inside `export const actions`:

```ts
	toggleAnchor: async ({ request, locals, platform }) => {
		requireOrganizer(locals, platform);
		const db = platform?.env?.DB;
		if (!db) return fail(503, { message: 'Storage is not available right now' });
		const form = await request.formData();
		const did = String(form.get('did') ?? '');
		const on = String(form.get('on') ?? '') === '1';
		if (!did) return fail(400, { message: 'Missing respondent' });
		const known = await db
			.prepare(`SELECT 1 AS x FROM responses WHERE did = ?1`)
			.bind(did)
			.first<{ x: number }>();
		if (!known) return fail(400, { message: 'Not a respondent' });
		try {
			await setAnchor(db, did, on);
		} catch (e) {
			console.error('toggleAnchor failed', e);
			return fail(500, { message: 'Could not save the anchor — try again' });
		}
		return { anchorDid: did, anchorOn: on };
	},

	clearAnchors: async ({ locals, platform }) => {
		requireOrganizer(locals, platform);
		const db = platform?.env?.DB;
		if (!db) return fail(503, { message: 'Storage is not available right now' });
		try {
			await clearAllAnchors(db);
		} catch (e) {
			console.error('clearAnchors failed', e);
			return fail(500, { message: 'Could not clear anchors — try again' });
		}
		return { anchorsCleared: true };
	}
```

- [ ] **Step 3: Verify**

Run: `pnpm check`
Expected: `0 ERRORS 0 WARNINGS` (the page still compiles because it doesn't read `data.anchors` yet).

- [ ] **Step 4: Commit**

```bash
git add src/routes/organizer/+page.server.ts
git commit -m "feat: anchors in organizer load + toggle/clear form actions (#90)"
```

---

### Task 4: Persistent anchor state in the page

**Files:**
- Modify: `src/routes/organizer/+page.svelte` (anchor scenario block, lines ~49-68, and the scenario-bar Clear button ~line 329)

**Interfaces:**
- Consumes: `data.anchors`, `?/toggleAnchor`, `?/clearAnchors` (Task 3).
- Produces: unchanged `anchors: string[]` reactive state — every existing derived (`anchorPeople`, `anchorSets`, `overlap`, heatmap rings, window-fit chips) keeps working untouched.

- [ ] **Step 1: Seed from load and sync via the action**

Replace the anchor block (`let anchors = $state<string[]>([]);` and `toggleAnchor`) with:

```ts
	import { applyAction, deserialize } from '$app/forms';
	// (merge into the existing $app/forms import that already has `enhance`)

	let anchors = $state<string[]>(data.anchors);
	let anchorBusy = $state(false);

	/** Optimistic toggle, persisted via ?/toggleAnchor; rolls back on failure. */
	async function toggleAnchor(did: string) {
		const on = !anchors.includes(did);
		const prev = anchors;
		anchors = on ? [...anchors, did] : anchors.filter((d) => d !== did);
		const body = new FormData();
		body.set('did', did);
		body.set('on', on ? '1' : '0');
		try {
			const res = await fetch('?/toggleAnchor', { method: 'POST', body });
			const result = deserialize(await res.text());
			if (result.type === 'failure' || result.type === 'error') anchors = prev;
		} catch {
			anchors = prev;
		}
	}

	async function clearAnchors() {
		if (anchorBusy) return;
		anchorBusy = true;
		const prev = anchors;
		anchors = [];
		try {
			const res = await fetch('?/clearAnchors', { method: 'POST', body: new FormData() });
			const result = deserialize(await res.text());
			if (result.type === 'failure' || result.type === 'error') anchors = prev;
		} catch {
			anchors = prev;
		} finally {
			anchorBusy = false;
		}
	}
```

Notes for the implementer:
- In `?preview` mode there is no DB; guard both functions with `if (data.preview) { /* local-only update, skip the fetch */ }` so the preview stays interactive — preview keeps the old ephemeral behavior after the optimistic update line.
- Wire the scenario bar's Clear button (`onclick={() => (anchors = [])}` at ~line 329) to `clearAnchors` and add `disabled={anchorBusy}`.
- `applyAction` is imported only if svelte-check flags the unused import — otherwise drop it from the snippet.

- [ ] **Step 2: Verify in the browser**

Run: `pnpm dev` then open `http://localhost:5173/organizer?preview`
Expected: two anchors pre-lit from fixtures, overlap rings render, toggling works instantly, Clear empties the bar.

- [ ] **Step 3: Verify checks**

Run: `pnpm check && pnpm build`
Expected: both green.

- [ ] **Step 4: Commit**

```bash
git add src/routes/organizer/+page.svelte
git commit -m "feat: anchors persist — seed from load, sync toggles through the action (#90)"
```

---

### Task 5: Window-roster panel (impeccable) + verification

**Files:**
- Modify: `src/routes/organizer/+page.svelte` (windows section, ~lines 336-355)
- Possibly create: `src/lib/components/organizer/WindowRoster.svelte` (impeccable's call)

**Interfaces:**
- Consumes: `windowRoster` (Task 2), existing `windows` derived, `anchors` state (Task 4).

- [ ] **Step 1: Design gate — invoke impeccable**

Invoke the `impeccable` skill scoped to: "add a window-roster panel to the organizer windows list — selecting one of the top-5 windows reveals who can/can't make it by name, anchored people marked — inside the existing one-ink Dusk/Operate organizer world per DESIGN.md." Produce comps, get **Bryan's approval** on one before writing panel code. Do not proceed past this step without approval.

- [ ] **Step 2: Build the approved comp**

Implementation skeleton the comp will refine (state + data flow are fixed regardless of visual treatment):

```ts
	let selectedWindow = $state<string | null>(null); // window start iso, or null

	const roster = $derived(
		selectedWindow === null
			? null
			: windowRoster(
					filtered.map((r) => ({ did: r.did, ranges: r.ranges })),
					selectedWindow
				)
	);
	const rosterName = (did: string) => {
		const r = data.responses.find((x) => x.did === did);
		return r ? (r.handle ? `@${r.handle}` : r.name) : did;
	};
```

Each `<li>` in the windows `<ol>` gets a select affordance (per comp) setting `selectedWindow = selectedWindow === w.start ? null : w.start`; the roster region renders `roster.available`/`roster.unavailable` name lists with anchored DIDs marked (`anchors.includes(did)`), styled per the approved comp. Add `windowRoster` to the `$lib/organizer/aggregate` import.

- [ ] **Step 3: Playwright verification (fixtures)**

With `pnpm dev` running, drive `http://localhost:5173/organizer?preview` via the project's Playwright setup (`.playwright-browsers/`, pattern from `scripts/shot.mjs`):
1. Toggle an anchor on a respondent row → ring lights; select the top window → roster shows both lists, anchored names marked; counts sum to the window's `count`/`of` figures.
2. Half-day edge: pick a fixture respondent whose range ends `first_half` on the window's last full day and assert they're in "can't make it".
Reload check (real persistence) is deferred to prod smoke — preview mode is DB-less by design.

- [ ] **Step 4: Finish review**

Run the impeccable finish reviewer against the approved comp; apply material findings.

- [ ] **Step 5: Verify checks**

Run: `pnpm check && pnpm build`
Expected: both green.

- [ ] **Step 6: Commit**

```bash
git add src/routes/organizer/+page.svelte src/lib/components/organizer/WindowRoster.svelte
git commit -m "feat: window roster — pick a 3-night window, see who can make it (#90)"
```

---

### Post-merge (Bryan + assistant, not part of branch work)

1. Open PR from `feat/scenario-planner`; CodeRabbit incremental review; merge.
2. Apply migration to prod: `env HOME="$PWD/.wrangler-home" pnpm wrangler d1 migrations apply buildtreat --remote`
3. Smoke on buildersretre.at/organizer: toggle an anchor, reload, still lit; roster renders on real data.
4. `deciduous` nodes for the arc; chainlink #90 closed (expect the changelog auto-append — restore it; the real entry ships in the PR).
