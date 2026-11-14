# Registration Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the survey as the front door with a registration flow — date announcement → confirm → form (contact, dietary, emergency, accessibility, notes, travel, agreements) → editable registered state — plus an organizer roster with headcount and CSV.

**Architecture:** A shared pure model (`src/lib/registration.ts`) parses/validates the form for both server actions and UI; a D1 data layer (`src/lib/server/registration.ts`) owns one upserted row per DID; the home route gains `registrationMode` data plus `?/register` and `?/decline` actions; the page branches into a new `RegistrationFlow` component tree (announcement feed item → free-scroll document) built to the approved coded comps; the organizer page gains a Registrations panel + CSV route. Confirmation email reuses the comail transport, best-effort.

**Tech Stack:** SvelteKit 2 / Svelte 5 runes on Cloudflare Workers, D1, vitest 4 (existing), Playwright screenshots via `scripts/shot.mjs`.

**Spec:** `docs/superpowers/specs/2026-08-25-registration-design.md` · **Approved comps:** `.impeccable/mocks/reg-ann-a.png` (announcement), `.impeccable/mocks/reg-form-a.png` (form) — sources `reg-ann-a.html`, `reg-form-a.html`, `reg-base.css` in the same folder. **Surface brief:** `.impeccable/surfaces/src-routes-page-svelte.md` (Registration era section + fidelity inventory).

## Global Constraints

- Retreat dates: **Dec 4–7, 2026**; display `December 4–7, 2026`; location line `Palm Springs or Coachella Valley` with the venue-pending honesty `Venue locks with the headcount` visible wherever the date is announced.
- Registration deadline var: `REG_DEADLINE = "2026-09-08T06:59:59Z"` (Sep 7, 11:59:59 PM Pacific). After it: no NEW confirmations; existing registrations stay editable; declines always recordable.
- "Registered" is derived: `status = 'confirmed' AND agreed_at IS NOT NULL`. Never a stored flag.
- Required to submit a confirmation: name, email (`EMAIL_RE`), emergency name + phone, both agreements. Everything else optional.
- One UI color (white at opacity steps), no cards/boxes/shadows, hairline ledgers, underline inputs, the white pill as the only filled container, chips 999px outline → solid Ink selected, ring checkboxes 1.15rem/1.75px with the punched-dot selected state. Kicker atom for labels/section heads only (never an eyebrow above a heading, except the hero's existing one).
- All D1 SQL parameterized. Tabs for indentation. Conventional commits. Stage files explicitly (never `git add -A`/`.`). Branch `feat/registration`; push to branch only. `pnpm test` and `pnpm check` green at the end of every task.
- Pure modules under `src/lib` use **relative imports** (`./content`, `../content`) so vitest resolves them without an alias config.
- Copy voice: sentence case, warm, no legalese outside the agreement bodies. The waiver/CoC bodies are Claude drafts marked as such in a code comment.

---

### Task 1: Lock the date + registration content + config plumbing

Content and config only — no behavior. Everything later tasks render comes from here.

**Files:**
- Modify: `src/lib/content.ts` (hero facts → locked date; append registration content)
- Modify: `src/app.d.ts` (env `REG_DEADLINE?: string`)
- Modify: `wrangler.jsonc` (var `REG_DEADLINE`)

**Interfaces:**
- Produces (exact, from `src/lib/content.ts`):

```ts
export const retreatDates: { start: '2026-12-04'; end: '2026-12-07'; display: 'December 4–7, 2026'; short: 'Dec 4–7'; nights: 3; arrive: 'Friday'; depart: 'Monday morning' };
export const retreatLocation: { display: 'Palm Springs or Coachella Valley'; pending: 'Venue locks with the headcount'; explainer: string };
export const dietaryOptions: readonly { id: DietaryId; label: string }[]; export type DietaryId = 'vegetarian'|'vegan'|'gluten_free'|'dairy_free'|'kosher'|'halal'|'nut_allergy'|'shellfish_allergy';
export const travelModes: readonly { id: TravelMode; label: string }[]; export type TravelMode = 'flying'|'driving'|'train'|'other';
export const waiver: { version: 'v1'; title: string; body: string };
export const codeOfConduct: { version: 'v1'; title: string; body: string };
export const registration: { kicker; ack: [string, string]; facts: { label: string; value: string; muted?: boolean }[]; confirm; decline; declinedLead; declinedBody; declinedUndo; closedLead; closedBody; formKicker; formTitle; formSub; sections: {...}; agreements: {...}; submit; submitHint; registeredTitle; registeredSub; travelNudge; edit; surveyLink; emailSubject };
```

- [ ] **Step 1: Update the hero facts in `src/lib/content.ts`**

Replace the `acknowledgment` and `facts` entries of `retreat` (keep everything else in the object):

```ts
	acknowledgment: ['The date is set.', 'December 4–7 — register to lock your spot.'] as [string, string],
	facts: [
		{ label: 'What', value: '3 nights · 2 full days' },
		{ label: 'Where', value: 'Palm Springs or Coachella Valley' },
		{ label: 'When', value: 'December 4–7, 2026' },
		{ label: 'Your Costs', value: 'Travel only. Lodging & food all taken care of' }
	],
```

- [ ] **Step 2: Append the registration content to `src/lib/content.ts`** (at the end of the file)

```ts
/* ── Registration era (date locked 2026-08-25) ──────────────────────────
 * Spec: docs/superpowers/specs/2026-08-25-registration-design.md
 */

export const retreatDates = {
	start: '2026-12-04',
	end: '2026-12-07',
	display: 'December 4–7, 2026',
	short: 'Dec 4–7',
	nights: 3,
	arrive: 'Friday',
	depart: 'Monday morning'
} as const;

export const retreatLocation = {
	display: 'Palm Springs or Coachella Valley',
	pending: 'Venue locks with the headcount',
	explainer:
		'We book the house once we know how many are coming — Palm Springs or the Coachella Valley, decided by the final count.'
} as const;

export const dietaryOptions = [
	{ id: 'vegetarian', label: 'Vegetarian' },
	{ id: 'vegan', label: 'Vegan' },
	{ id: 'gluten_free', label: 'Gluten-free' },
	{ id: 'dairy_free', label: 'Dairy-free' },
	{ id: 'kosher', label: 'Kosher' },
	{ id: 'halal', label: 'Halal' },
	{ id: 'nut_allergy', label: 'Nut allergy' },
	{ id: 'shellfish_allergy', label: 'Shellfish allergy' }
] as const;
export type DietaryId = (typeof dietaryOptions)[number]['id'];

export const travelModes = [
	{ id: 'flying', label: 'Flying' },
	{ id: 'driving', label: 'Driving' },
	{ id: 'train', label: 'Train' },
	{ id: 'other', label: 'Other' }
] as const;
export type TravelMode = (typeof travelModes)[number]['id'];

/**
 * DRAFT agreement texts written by Claude, not a lawyer. Bryan may swap the
 * bodies at will; bump `version` when the substance changes so each
 * registration records which text it agreed to.
 */
export const waiver = {
	version: 'v1',
	title: 'Liability waiver',
	body: `I'm choosing to attend the Atmospheric Builders' Retreat (December 4–7, 2026, in the Palm Springs / Coachella Valley area) voluntarily.

I understand the retreat involves travel, shared lodging, group meals, and informal activities, and that these carry ordinary risks — including illness, injury, and loss of or damage to my belongings. I accept those risks for myself.

To the fullest extent the law allows, I release the organizers — Bryan Guffey, Bluesky Social, PBC, and anyone helping them run the retreat — from claims for injury, illness, loss, or damage arising from my participation, except where caused by their gross negligence or willful misconduct.

If I'm hurt or become ill, I consent to reasonable first aid and emergency care, and I understand I'm responsible for the cost of my own medical treatment. I confirm I have, or will arrange, any travel or health coverage I want for this trip.

I'll take reasonable care of the house and the people in it, and I'll cover damage I cause.`
} as const;

export const codeOfConduct = {
	version: 'v1',
	title: 'Code of conduct',
	body: `The retreat is a small group of builders living and working together for three nights. It only works if everyone feels safe and welcome.

Be kind and generous. Assume good faith. Make room for people quieter than you.

Harassment of any kind isn't tolerated — including unwelcome comments about someone's identity, unwanted physical contact or attention, deliberate intimidation, and photographing or recording people without consent. If someone asks you to stop, stop.

Respect boundaries in shared space: quiet hours, closed doors, other people's food and belongings, and anyone's choice not to drink.

If something happens — to you or to someone else — tell Bryan (@chaosgreml.in) in person, by DM, or by text at the number on the itinerary. Reports are handled discreetly. Anyone asked to leave for violating this code covers their own way home.`
} as const;

export const registration = {
	kicker: 'The date is set',
	ack: ['You helped pick the days.', 'Here they are.'] as [string, string],
	dateLines: ['December', '4–7, 2026.'] as [string, string],
	facts: [
		{ label: 'Palm Springs or Coachella Valley', value: '' },
		{ label: 'Venue locks with the headcount', value: '', muted: true },
		{ label: 'Lodging & food covered', value: 'Bluesky' },
		{ label: 'Register by Sept 7', value: '' }
	] as { label: string; value: string; muted?: boolean }[],
	confirm: 'I’m in',
	decline: 'I can’t make it',
	declinedLead: 'Noted — we’ll miss you.',
	declinedBody: 'If your December opens up, come back here and change your answer.',
	declinedUndo: 'Actually, I can come',
	closedLead: 'Registration closed Sept 7.',
	closedBody: 'We’ve locked the headcount to book the house. If you can still make it, DM',
	formKicker: 'Registration',
	formTitle: 'You’re in.',
	formSub: 'December 4–7, Palm Springs or the Coachella Valley. Six short sections. Travel can wait until you know.',
	sections: {
		contact: { head: 'Contact', name: 'Name', email: 'Email', phone: 'Phone', phoneHint: 'For day-of texts' },
		food: { head: 'Food', hint: 'Pick any', other: 'Anything else about food', otherHint: 'Allergies, strong dislikes, coffee opinions' },
		emergency: { head: 'Emergency contact', name: 'Name', nameHint: 'Who we call', phone: 'Phone', phoneHint: '+1' },
		accessibility: { head: 'Accessibility', hint: 'Optional', label: 'Anything we should plan for', placeholder: 'Mobility, sensory, sleep, medical — whatever helps us set the house up right' },
		notes: { head: 'Anything else', hint: 'Optional', placeholder: 'Notes for the organizers' },
		travel: { head: 'Travel', hint: 'Optional now · update anytime', arriving: 'Arriving', arrivingHint: 'Fri afternoon, PSP', leaving: 'Leaving', leavingHint: 'Mon morning', details: 'Details', detailsHint: 'Flight numbers, rideshare offers' },
		agreements: { head: 'Agreements', waiver: 'I’ve read the liability waiver', coc: 'I’ll follow the code of conduct', read: 'read it' }
	},
	submit: 'Register',
	submitHint: 'You can change everything later.',
	saving: 'Saving…',
	registeredTitle: 'You’re registered.',
	registeredSub: 'December 4–7. We’ll email the venue and itinerary once the house is booked.',
	travelNudge: 'Update as plans firm up',
	edit: 'Edit',
	surveyLink: 'Your availability survey answers',
	errors: {
		name: 'Tell us your name',
		email: 'Enter a valid email',
		emergencyName: 'Who should we call?',
		emergencyPhone: 'A phone number for them',
		agreeWaiver: 'Please read and agree to the waiver',
		agreeCoc: 'Please agree to the code of conduct',
		dietary: 'Unknown food option',
		travelMode: 'Unknown travel mode'
	}
} as const;
```

- [ ] **Step 3: Declare `REG_DEADLINE`**

In `src/app.d.ts`, inside `Platform.env` after `DEADLINE?: string;`:

```ts
			REG_DEADLINE?: string;
```

In `wrangler.jsonc` `vars`, after the `DEADLINE` entry:

```jsonc
		// Registration deadline: Sep 7 2026, 11:59:59 PM Pacific (PDT = UTC-7).
		// After this, no NEW confirmations; edits and declines stay open.
		"REG_DEADLINE": "2026-09-08T06:59:59Z",
```

- [ ] **Step 4: Verify**

Run: `pnpm check` — Expected: 0 errors. Run: `pnpm test` — Expected: 15 passed (unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/lib/content.ts src/app.d.ts wrangler.jsonc
git commit -m "feat: lock Dec 4-7 date, registration content, REG_DEADLINE var"
```

---

### Task 2: Shared registration model + validation (pure, TDD)

**Files:**
- Create: `src/lib/registration.ts`
- Test: `src/lib/registration.test.ts`

**Interfaces:**
- Consumes: `dietaryOptions`, `travelModes`, `registration.errors` from `./content`.
- Produces (exact):

```ts
export const EMAIL_RE: RegExp;
export interface RegistrationInput {
	name: string; email: string; phone: string;
	emergencyName: string; emergencyPhone: string;
	dietary: string[]; dietaryOther: string;
	accessibility: string; notes: string;
	travelArrival: string; travelDeparture: string; travelMode: TravelMode | null; travelDetails: string;
	agreeWaiver: boolean; agreeCoc: boolean;
}
export type RegistrationErrors = Partial<Record<'name'|'email'|'emergencyName'|'emergencyPhone'|'agreeWaiver'|'agreeCoc'|'dietary'|'travelMode', string>>;
export function emptyRegistration(): RegistrationInput;
export function parseRegistrationForm(form: FormData): RegistrationInput;
export function validateRegistration(input: RegistrationInput): { ok: true; value: RegistrationInput } | { ok: false; errors: RegistrationErrors };
export function isDietaryId(id: string): id is DietaryId;
export function isTravelMode(id: string): id is TravelMode;
```

- [ ] **Step 1: Write the failing tests** — `src/lib/registration.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import {
	emptyRegistration,
	isDietaryId,
	isTravelMode,
	parseRegistrationForm,
	validateRegistration,
	type RegistrationInput
} from './registration';

function complete(): RegistrationInput {
	return {
		...emptyRegistration(),
		name: 'Maren Costa',
		email: 'maren@costa.dev',
		emergencyName: 'Sam Costa',
		emergencyPhone: '+1 555 0100',
		agreeWaiver: true,
		agreeCoc: true
	};
}

describe('parseRegistrationForm', () => {
	it('reads every field, trims text, collects dietary checkboxes, and maps agreement checkboxes', () => {
		const fd = new FormData();
		fd.set('name', '  Maren Costa ');
		fd.set('email', 'maren@costa.dev');
		fd.set('phone', '555-0100');
		fd.set('emergencyName', 'Sam');
		fd.set('emergencyPhone', '555-0101');
		fd.append('dietary', 'vegetarian');
		fd.append('dietary', 'nut_allergy');
		fd.set('dietaryOther', 'no cilantro');
		fd.set('accessibility', 'ground floor please');
		fd.set('notes', 'bringing a guitar');
		fd.set('travelArrival', 'Fri 3pm');
		fd.set('travelDeparture', 'Mon 9am');
		fd.set('travelMode', 'driving');
		fd.set('travelDetails', 'can carpool from LA');
		fd.set('agreeWaiver', 'on');
		// agreeCoc omitted → false
		expect(parseRegistrationForm(fd)).toEqual({
			name: 'Maren Costa',
			email: 'maren@costa.dev',
			phone: '555-0100',
			emergencyName: 'Sam',
			emergencyPhone: '555-0101',
			dietary: ['vegetarian', 'nut_allergy'],
			dietaryOther: 'no cilantro',
			accessibility: 'ground floor please',
			notes: 'bringing a guitar',
			travelArrival: 'Fri 3pm',
			travelDeparture: 'Mon 9am',
			travelMode: 'driving',
			travelDetails: 'can carpool from LA',
			agreeWaiver: true,
			agreeCoc: false
		});
	});

	it('treats a missing or empty travel mode as null and caps long text', () => {
		const fd = new FormData();
		fd.set('notes', 'x'.repeat(5000));
		const parsed = parseRegistrationForm(fd);
		expect(parsed.travelMode).toBeNull();
		expect(parsed.notes).toHaveLength(2000);
	});
});

describe('validateRegistration', () => {
	it('accepts a complete confirmation', () => {
		const res = validateRegistration(complete());
		expect(res.ok).toBe(true);
	});

	it('requires name, valid email, emergency name + phone, and both agreements', () => {
		const res = validateRegistration({ ...emptyRegistration(), email: 'nope' });
		expect(res.ok).toBe(false);
		if (res.ok) return;
		expect(Object.keys(res.errors).sort()).toEqual(
			['agreeCoc', 'agreeWaiver', 'email', 'emergencyName', 'emergencyPhone', 'name'].sort()
		);
	});

	it('rejects unknown dietary ids and travel modes', () => {
		const res = validateRegistration({
			...complete(),
			dietary: ['vegan', 'glass'],
			travelMode: 'teleport' as never
		});
		expect(res.ok).toBe(false);
		if (res.ok) return;
		expect(res.errors.dietary).toBeDefined();
		expect(res.errors.travelMode).toBeDefined();
	});

	it('leaves travel and optional fields free', () => {
		const res = validateRegistration({ ...complete(), travelArrival: '', travelMode: null, accessibility: '' });
		expect(res.ok).toBe(true);
	});
});

describe('id guards', () => {
	it('recognise content ids only', () => {
		expect(isDietaryId('kosher')).toBe(true);
		expect(isDietaryId('paleo')).toBe(false);
		expect(isTravelMode('train')).toBe(true);
		expect(isTravelMode('boat')).toBe(false);
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test` — Expected: FAIL, cannot resolve `./registration`.

- [ ] **Step 3: Implement `src/lib/registration.ts`**

```ts
import { dietaryOptions, registration, travelModes, type DietaryId, type TravelMode } from './content';

/**
 * Registration form model shared by the server action and the UI. Pure:
 * no SvelteKit or D1 imports, so it runs under vitest unchanged.
 * Spec: docs/superpowers/specs/2026-08-25-registration-design.md
 */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SHORT = 320;
const LONG = 2000;

export interface RegistrationInput {
	name: string;
	email: string;
	phone: string;
	emergencyName: string;
	emergencyPhone: string;
	dietary: string[];
	dietaryOther: string;
	accessibility: string;
	notes: string;
	travelArrival: string;
	travelDeparture: string;
	travelMode: TravelMode | null;
	travelDetails: string;
	agreeWaiver: boolean;
	agreeCoc: boolean;
}

export type RegistrationErrors = Partial<
	Record<
		'name' | 'email' | 'emergencyName' | 'emergencyPhone' | 'agreeWaiver' | 'agreeCoc' | 'dietary' | 'travelMode',
		string
	>
>;

const DIETARY_IDS = new Set<string>(dietaryOptions.map((o) => o.id));
const TRAVEL_MODES = new Set<string>(travelModes.map((m) => m.id));

export function isDietaryId(id: string): id is DietaryId {
	return DIETARY_IDS.has(id);
}

export function isTravelMode(id: string): id is TravelMode {
	return TRAVEL_MODES.has(id);
}

export function emptyRegistration(): RegistrationInput {
	return {
		name: '',
		email: '',
		phone: '',
		emergencyName: '',
		emergencyPhone: '',
		dietary: [],
		dietaryOther: '',
		accessibility: '',
		notes: '',
		travelArrival: '',
		travelDeparture: '',
		travelMode: null,
		travelDetails: '',
		agreeWaiver: false,
		agreeCoc: false
	};
}

function text(form: FormData, key: string, max: number): string {
	const v = form.get(key);
	return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function flag(form: FormData, key: string): boolean {
	const v = form.get(key);
	return v === 'on' || v === 'true' || v === '1';
}

/** Read the posted form. No validation here — see validateRegistration. */
export function parseRegistrationForm(form: FormData): RegistrationInput {
	const mode = text(form, 'travelMode', 32);
	return {
		name: text(form, 'name', SHORT),
		email: text(form, 'email', SHORT),
		phone: text(form, 'phone', 64),
		emergencyName: text(form, 'emergencyName', SHORT),
		emergencyPhone: text(form, 'emergencyPhone', 64),
		dietary: form
			.getAll('dietary')
			.filter((v): v is string => typeof v === 'string')
			.map((v) => v.trim())
			.filter(Boolean),
		dietaryOther: text(form, 'dietaryOther', LONG),
		accessibility: text(form, 'accessibility', LONG),
		notes: text(form, 'notes', LONG),
		travelArrival: text(form, 'travelArrival', SHORT),
		travelDeparture: text(form, 'travelDeparture', SHORT),
		travelMode: mode ? (mode as TravelMode) : null,
		travelDetails: text(form, 'travelDetails', LONG),
		agreeWaiver: flag(form, 'agreeWaiver'),
		agreeCoc: flag(form, 'agreeCoc')
	};
}

/** Rules for a CONFIRMED registration. Declines skip this entirely. */
export function validateRegistration(
	input: RegistrationInput
): { ok: true; value: RegistrationInput } | { ok: false; errors: RegistrationErrors } {
	const errors: RegistrationErrors = {};
	const e = registration.errors;
	if (!input.name) errors.name = e.name;
	if (!EMAIL_RE.test(input.email)) errors.email = e.email;
	if (!input.emergencyName) errors.emergencyName = e.emergencyName;
	if (!input.emergencyPhone) errors.emergencyPhone = e.emergencyPhone;
	if (!input.agreeWaiver) errors.agreeWaiver = e.agreeWaiver;
	if (!input.agreeCoc) errors.agreeCoc = e.agreeCoc;
	if (input.dietary.some((id) => !isDietaryId(id))) errors.dietary = e.dietary;
	if (input.travelMode !== null && !isTravelMode(input.travelMode)) errors.travelMode = e.travelMode;
	return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: input };
}
```

- [ ] **Step 4: Run tests** — `pnpm test` — Expected: PASS, 22 tests. `pnpm check` — 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/registration.ts src/lib/registration.test.ts
git commit -m "feat: shared registration model and validation"
```

---

### Task 3: Migration 0006 + registration data layer

**Files:**
- Create: `migrations/0006_registrations.sql`
- Create: `src/lib/server/registration.ts`
- Test: `src/lib/server/registration.test.ts` (pure parts: row mapping, counts, travel status)

**Interfaces:**
- Consumes: `RegistrationInput` from `../registration`; `AllowlistEntry` from `./organizer`.
- Produces (exact):

```ts
export interface Registration {
	did: string; handle: string | null; name: string; email: string;
	status: 'confirmed' | 'declined';
	phone: string; emergencyName: string; emergencyPhone: string;
	dietary: string[]; dietaryOther: string; accessibility: string; notes: string;
	travelArrival: string; travelDeparture: string; travelMode: TravelMode | null; travelDetails: string;
	waiverVersion: string | null; cocVersion: string | null; agreedAt: string | null;
	createdAt: string; updatedAt: string;
}
export type TravelStatus = 'none' | 'partial' | 'complete';
export interface RegistrationCounts { confirmed: number; registered: number; declined: number; noResponse: number; }
export function isRegistered(r: Registration): boolean;
export function travelStatus(r: Registration): TravelStatus;
export function registrationCounts(regs: Registration[], allowlist: AllowlistEntry[]): RegistrationCounts;
export function noResponseHandles(regs: Registration[], allowlist: AllowlistEntry[]): AllowlistEntry[];
export async function getRegistration(db: D1Database, did: string): Promise<Registration | null>;
export async function upsertConfirmed(db: D1Database, who: { did: string; handle: string | null }, input: RegistrationInput, versions: { waiver: string; coc: string }): Promise<void>;
export async function setDeclined(db: D1Database, who: { did: string; handle: string | null; name: string; email: string }): Promise<void>;
export async function listRegistrations(db: D1Database): Promise<Registration[]>;
```

- [ ] **Step 1: Write the migration** — `migrations/0006_registrations.sql`

```sql
-- the Atmospheric Builders' Retreat — registration for the locked Dec 4–7 dates

-- One row per DID, upserted. 'confirmed' + agreed_at set = a complete
-- registration (derived, never stored). 'declined' rows are minimal.
-- Travel columns stay editable after the registration deadline.
-- Spec: docs/superpowers/specs/2026-08-25-registration-design.md.
CREATE TABLE IF NOT EXISTS registrations (
	did TEXT PRIMARY KEY,
	handle TEXT,
	name TEXT NOT NULL,
	email TEXT NOT NULL,
	status TEXT NOT NULL,
	phone TEXT,
	emergency_name TEXT,
	emergency_phone TEXT,
	dietary TEXT,
	dietary_other TEXT,
	accessibility TEXT,
	notes TEXT,
	travel_arrival TEXT,
	travel_departure TEXT,
	travel_mode TEXT,
	travel_details TEXT,
	waiver_version TEXT,
	coc_version TEXT,
	agreed_at TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);
```

- [ ] **Step 2: Write the failing tests** — `src/lib/server/registration.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import {
	isRegistered,
	noResponseHandles,
	registrationCounts,
	rowToRegistration,
	travelStatus,
	type Registration
} from './registration';

function reg(over: Partial<Registration> = {}): Registration {
	return {
		did: 'did:plc:a',
		handle: 'a.test',
		name: 'A',
		email: 'a@x.com',
		status: 'confirmed',
		phone: '',
		emergencyName: 'B',
		emergencyPhone: '1',
		dietary: [],
		dietaryOther: '',
		accessibility: '',
		notes: '',
		travelArrival: '',
		travelDeparture: '',
		travelMode: null,
		travelDetails: '',
		waiverVersion: 'v1',
		cocVersion: 'v1',
		agreedAt: '2026-08-30T00:00:00Z',
		createdAt: '2026-08-30T00:00:00Z',
		updatedAt: '2026-08-30T00:00:00Z',
		...over
	};
}

describe('rowToRegistration', () => {
	it('parses the dietary JSON column and nulls', () => {
		const r = rowToRegistration({
			did: 'did:plc:a',
			handle: null,
			name: 'A',
			email: 'a@x.com',
			status: 'confirmed',
			phone: null,
			emergency_name: null,
			emergency_phone: null,
			dietary: '["vegan","kosher"]',
			dietary_other: null,
			accessibility: null,
			notes: null,
			travel_arrival: null,
			travel_departure: null,
			travel_mode: null,
			travel_details: null,
			waiver_version: null,
			coc_version: null,
			agreed_at: null,
			created_at: 'c',
			updated_at: 'u'
		});
		expect(r.dietary).toEqual(['vegan', 'kosher']);
		expect(r.phone).toBe('');
		expect(r.travelMode).toBeNull();
		expect(r.agreedAt).toBeNull();
	});

	it('survives a malformed dietary column', () => {
		const r = rowToRegistration({
			did: 'd', handle: null, name: 'A', email: 'a@x.com', status: 'declined', phone: null,
			emergency_name: null, emergency_phone: null, dietary: 'not json', dietary_other: null,
			accessibility: null, notes: null, travel_arrival: null, travel_departure: null,
			travel_mode: null, travel_details: null, waiver_version: null, coc_version: null,
			agreed_at: null, created_at: 'c', updated_at: 'u'
		});
		expect(r.dietary).toEqual([]);
	});
});

describe('isRegistered / travelStatus', () => {
	it('registered = confirmed with agreements', () => {
		expect(isRegistered(reg())).toBe(true);
		expect(isRegistered(reg({ agreedAt: null }))).toBe(false);
		expect(isRegistered(reg({ status: 'declined' }))).toBe(false);
	});

	it('travel is none / partial / complete', () => {
		expect(travelStatus(reg())).toBe('none');
		expect(travelStatus(reg({ travelMode: 'flying' }))).toBe('partial');
		expect(travelStatus(reg({ travelMode: 'flying', travelArrival: 'Fri', travelDeparture: 'Mon' }))).toBe('complete');
	});
});

describe('registrationCounts / noResponseHandles', () => {
	const allowlist = [
		{ handle: 'a.test', did: 'did:plc:a', responded: true },
		{ handle: 'b.test', did: 'did:plc:b', responded: true },
		{ handle: 'c.test', did: null, responded: false }
	];

	it('counts confirmed, registered, declined, and everyone allowlisted without a row', () => {
		const regs = [reg(), reg({ did: 'did:plc:b', handle: 'b.test', status: 'declined', agreedAt: null })];
		expect(registrationCounts(regs, allowlist)).toEqual({ confirmed: 1, registered: 1, declined: 1, noResponse: 1 });
	});

	it('matches no-response by DID or handle, case-insensitively', () => {
		const regs = [reg({ did: 'did:plc:zzz', handle: 'C.TEST' })];
		expect(noResponseHandles(regs, allowlist).map((e) => e.handle)).toEqual(['a.test', 'b.test']);
	});
});
```

- [ ] **Step 3: Run to verify failure** — `pnpm test` — Expected: FAIL, cannot resolve `./registration` (server).

- [ ] **Step 4: Implement `src/lib/server/registration.ts`**

```ts
import type { D1Database } from '@cloudflare/workers-types';
import type { TravelMode } from '../content';
import type { RegistrationInput } from '../registration';
import { isTravelMode } from '../registration';
import type { AllowlistEntry } from './organizer';

/**
 * D1 access for registrations — one upserted row per DID. Mirrors the
 * waitlist module's conventions: parameterized SQL, typed rows, JSDoc.
 * Schema: migrations/0006_registrations.sql.
 */

export interface Registration {
	did: string;
	handle: string | null;
	name: string;
	email: string;
	status: 'confirmed' | 'declined';
	phone: string;
	emergencyName: string;
	emergencyPhone: string;
	dietary: string[];
	dietaryOther: string;
	accessibility: string;
	notes: string;
	travelArrival: string;
	travelDeparture: string;
	travelMode: TravelMode | null;
	travelDetails: string;
	waiverVersion: string | null;
	cocVersion: string | null;
	agreedAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface RegistrationRow {
	did: string;
	handle: string | null;
	name: string;
	email: string;
	status: string;
	phone: string | null;
	emergency_name: string | null;
	emergency_phone: string | null;
	dietary: string | null;
	dietary_other: string | null;
	accessibility: string | null;
	notes: string | null;
	travel_arrival: string | null;
	travel_departure: string | null;
	travel_mode: string | null;
	travel_details: string | null;
	waiver_version: string | null;
	coc_version: string | null;
	agreed_at: string | null;
	created_at: string;
	updated_at: string;
}

const COLUMNS = `did, handle, name, email, status, phone, emergency_name, emergency_phone, dietary, dietary_other,
	accessibility, notes, travel_arrival, travel_departure, travel_mode, travel_details,
	waiver_version, coc_version, agreed_at, created_at, updated_at`;

function parseDietary(raw: string | null): string[] {
	if (!raw) return [];
	try {
		const v = JSON.parse(raw) as unknown;
		return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
	} catch {
		return [];
	}
}

/** Pure row → model mapping (exported for tests). */
export function rowToRegistration(r: RegistrationRow): Registration {
	return {
		did: r.did,
		handle: r.handle,
		name: r.name,
		email: r.email,
		status: r.status === 'declined' ? 'declined' : 'confirmed',
		phone: r.phone ?? '',
		emergencyName: r.emergency_name ?? '',
		emergencyPhone: r.emergency_phone ?? '',
		dietary: parseDietary(r.dietary),
		dietaryOther: r.dietary_other ?? '',
		accessibility: r.accessibility ?? '',
		notes: r.notes ?? '',
		travelArrival: r.travel_arrival ?? '',
		travelDeparture: r.travel_departure ?? '',
		travelMode: r.travel_mode && isTravelMode(r.travel_mode) ? r.travel_mode : null,
		travelDetails: r.travel_details ?? '',
		waiverVersion: r.waiver_version,
		cocVersion: r.coc_version,
		agreedAt: r.agreed_at,
		createdAt: r.created_at,
		updatedAt: r.updated_at
	};
}

export type TravelStatus = 'none' | 'partial' | 'complete';

/** Registered = confirmed AND agreements signed. Derived, never stored. */
export function isRegistered(r: Registration): boolean {
	return r.status === 'confirmed' && r.agreedAt !== null;
}

export function travelStatus(r: Registration): TravelStatus {
	const filled = [r.travelMode, r.travelArrival, r.travelDeparture].filter(Boolean).length;
	if (filled === 0) return 'none';
	return filled === 3 ? 'complete' : 'partial';
}

export interface RegistrationCounts {
	confirmed: number;
	registered: number;
	declined: number;
	noResponse: number;
}

/** Allowlisted people with no registration row, matched by DID or handle. */
export function noResponseHandles(regs: Registration[], allowlist: AllowlistEntry[]): AllowlistEntry[] {
	const dids = new Set(regs.map((r) => r.did));
	const handles = new Set(regs.map((r) => r.handle?.toLowerCase()).filter(Boolean));
	return allowlist.filter((a) => !(a.did && dids.has(a.did)) && !handles.has(a.handle.toLowerCase()));
}

export function registrationCounts(regs: Registration[], allowlist: AllowlistEntry[]): RegistrationCounts {
	return {
		confirmed: regs.filter((r) => r.status === 'confirmed').length,
		registered: regs.filter(isRegistered).length,
		declined: regs.filter((r) => r.status === 'declined').length,
		noResponse: noResponseHandles(regs, allowlist).length
	};
}

export async function getRegistration(db: D1Database, did: string): Promise<Registration | null> {
	const row = await db.prepare(`SELECT ${COLUMNS} FROM registrations WHERE did = ?1`).bind(did).first<RegistrationRow>();
	return row ? rowToRegistration(row) : null;
}

/**
 * Save a confirmed registration. Preserves created_at and the FIRST
 * agreed_at (re-submitting doesn't re-date the agreement); versions update
 * to whatever text was agreed to this time.
 */
export async function upsertConfirmed(
	db: D1Database,
	who: { did: string; handle: string | null },
	input: RegistrationInput,
	versions: { waiver: string; coc: string }
): Promise<void> {
	const now = new Date().toISOString();
	await db
		.prepare(
			`INSERT INTO registrations (${COLUMNS})
			 VALUES (?1, ?2, ?3, ?4, 'confirmed', ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?18, ?18)
			 ON CONFLICT(did) DO UPDATE SET
			   handle = excluded.handle, name = excluded.name, email = excluded.email, status = 'confirmed',
			   phone = excluded.phone, emergency_name = excluded.emergency_name, emergency_phone = excluded.emergency_phone,
			   dietary = excluded.dietary, dietary_other = excluded.dietary_other, accessibility = excluded.accessibility,
			   notes = excluded.notes, travel_arrival = excluded.travel_arrival, travel_departure = excluded.travel_departure,
			   travel_mode = excluded.travel_mode, travel_details = excluded.travel_details,
			   waiver_version = excluded.waiver_version, coc_version = excluded.coc_version,
			   agreed_at = COALESCE(registrations.agreed_at, excluded.agreed_at),
			   updated_at = excluded.updated_at`
		)
		.bind(
			who.did,
			who.handle,
			input.name,
			input.email,
			input.phone || null,
			input.emergencyName,
			input.emergencyPhone,
			JSON.stringify(input.dietary),
			input.dietaryOther || null,
			input.accessibility || null,
			input.notes || null,
			input.travelArrival || null,
			input.travelDeparture || null,
			input.travelMode,
			input.travelDetails || null,
			versions.waiver,
			versions.coc,
			now
		)
		.run();
}

/** Record a decline. Keeps any previously entered details; clears nothing. */
export async function setDeclined(
	db: D1Database,
	who: { did: string; handle: string | null; name: string; email: string }
): Promise<void> {
	const now = new Date().toISOString();
	await db
		.prepare(
			`INSERT INTO registrations (did, handle, name, email, status, created_at, updated_at)
			 VALUES (?1, ?2, ?3, ?4, 'declined', ?5, ?5)
			 ON CONFLICT(did) DO UPDATE SET handle = excluded.handle, status = 'declined', updated_at = excluded.updated_at`
		)
		.bind(who.did, who.handle, who.name, who.email, now)
		.run();
}

/** Organizer roster, most recently updated first. */
export async function listRegistrations(db: D1Database): Promise<Registration[]> {
	const rows = await db.prepare(`SELECT ${COLUMNS} FROM registrations ORDER BY updated_at DESC`).all<RegistrationRow>();
	return rows.results.map(rowToRegistration);
}
```

- [ ] **Step 5: Run tests** — `pnpm test` — Expected: PASS, 28 tests. `pnpm check` — 0 errors.

- [ ] **Step 6: Commit**

```bash
git add migrations/0006_registrations.sql src/lib/server/registration.ts src/lib/server/registration.test.ts
git commit -m "feat: registrations schema and data layer"
```

---

### Task 4: Confirmation email builder (pure, TDD)

**Files:**
- Create: `src/lib/server/registration-email.ts`
- Test: `src/lib/server/registration-email.test.ts`

**Interfaces:**
- Consumes: `Registration` from `./registration`; `retreatDates`, `retreatLocation`, `travelModes` from `../content`.
- Produces: `export function confirmationEmail(reg: Registration): { subject: string; text: string }`

- [ ] **Step 1: Write the failing test** — `src/lib/server/registration-email.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { confirmationEmail } from './registration-email';
import type { Registration } from './registration';

const base: Registration = {
	did: 'did:plc:a', handle: 'maren.dev', name: 'Maren Costa', email: 'maren@costa.dev', status: 'confirmed',
	phone: '', emergencyName: 'Sam', emergencyPhone: '1', dietary: ['vegetarian'], dietaryOther: '',
	accessibility: '', notes: '', travelArrival: '', travelDeparture: '', travelMode: null, travelDetails: '',
	waiverVersion: 'v1', cocVersion: 'v1', agreedAt: '2026-08-30T00:00:00Z', createdAt: 'c', updatedAt: 'u'
};

describe('confirmationEmail', () => {
	it('names the dates, the venue-pending line, and a travel nudge when travel is empty', () => {
		const { subject, text } = confirmationEmail(base);
		expect(subject).toContain('December 4–7');
		expect(text).toContain('Palm Springs or Coachella Valley');
		expect(text).toContain('Venue locks with the headcount');
		expect(text).toMatch(/travel/i);
		expect(text).toContain('Maren');
	});

	it('echoes travel answers when present', () => {
		const { text } = confirmationEmail({ ...base, travelMode: 'driving', travelArrival: 'Fri 3pm', travelDeparture: 'Mon 9am' });
		expect(text).toContain('Driving');
		expect(text).toContain('Fri 3pm');
		expect(text).toContain('Mon 9am');
	});
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm test` — Expected: FAIL, cannot resolve `./registration-email`.

- [ ] **Step 3: Implement `src/lib/server/registration-email.ts`**

```ts
import { retreatDates, retreatLocation, travelModes } from '../content';
import type { Registration } from './registration';

/** Plain-text confirmation, sent best-effort after a completed registration. */
export function confirmationEmail(reg: Registration): { subject: string; text: string } {
	const first = reg.name.split(' ')[0] || reg.name;
	const mode = reg.travelMode ? travelModes.find((m) => m.id === reg.travelMode)?.label : null;
	const travel =
		mode || reg.travelArrival || reg.travelDeparture
			? [
					'Your travel so far:',
					mode ? `  Getting there: ${mode}` : null,
					reg.travelArrival ? `  Arriving: ${reg.travelArrival}` : null,
					reg.travelDeparture ? `  Leaving: ${reg.travelDeparture}` : null,
					reg.travelDetails ? `  Details: ${reg.travelDetails}` : null,
					'',
					'Update it any time at https://buildersretre.at — plans change, that’s fine.'
				]
					.filter((l) => l !== null)
					.join('\n')
			: 'You haven’t added travel yet — no rush. Come back to https://buildersretre.at whenever your plans firm up.';

	const text = [
		`Hi ${first},`,
		'',
		`You’re registered for the Atmospheric Builders’ Retreat, ${retreatDates.display}.`,
		'',
		`Where: ${retreatLocation.display}. ${retreatLocation.pending} — we’ll email the exact house and an itinerary once it’s booked.`,
		`Arrive ${retreatDates.arrive}, leave ${retreatDates.depart}. Lodging and food are covered; you cover your travel.`,
		'',
		travel,
		'',
		'Questions? Reply to this email or DM @chaosgreml.in.',
		'',
		'— Bryan'
	].join('\n');

	return { subject: `You’re registered — ${retreatDates.display}`, text };
}
```

- [ ] **Step 4: Run tests** — `pnpm test` — Expected: PASS, 30 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/registration-email.ts src/lib/server/registration-email.test.ts
git commit -m "feat: registration confirmation email builder"
```

---

### Task 5: Home route — registration data, actions, deadline, preview fixtures

**Files:**
- Modify: `src/routes/+page.server.ts`

**Interfaces:**
- Consumes: `getRegistration`, `upsertConfirmed`, `setDeclined`, `type Registration` from `$lib/server/registration`; `parseRegistrationForm`, `validateRegistration`, `type RegistrationErrors` from `$lib/registration`; `confirmationEmail` from `$lib/server/registration-email`; `sendEmail` from `$lib/server/email`; `deadlineStatus` from `$lib/server/deadline`; `waiver`, `codeOfConduct` from `$lib/content`; existing `getResponse`, `checkAllowlist`, `loadBskyProfile`.
- Produces: page data gains `registrationMode: boolean`, `registration: Registration | null`, `regDeadline: string | null`, `regDeadlineDisplay: string | null`, `regClosed: boolean`, `prefill: { name: string; email: string }`. Actions `?/register` → `{ registered: true }` or `fail(400, { regErrors: RegistrationErrors })` / `fail(403, { regClosed: true })`; `?/decline` → `{ declined: true }`.

- [ ] **Step 1: Add imports**

After the existing imports in `src/routes/+page.server.ts`:

```ts
import { codeOfConduct, waiver } from '$lib/content';
import { deadlineStatus } from '$lib/server/deadline';
import { sendEmail } from '$lib/server/email';
import { getRegistration, setDeclined, upsertConfirmed, type Registration } from '$lib/server/registration';
import { confirmationEmail } from '$lib/server/registration-email';
import { parseRegistrationForm, validateRegistration } from '$lib/registration';
```

(`retreat` is already imported from `$lib/content` — merge into that import statement if the linter prefers a single import.)

- [ ] **Step 2: Add registration fields to every `load` return**

Right after `const { deadline, closed } = await surveyGate(...)` add:

```ts
	// Registration era: its own deadline, same parsing as the survey's.
	const reg = deadlineStatus(platform?.env?.REG_DEADLINE);
	const regBase = { regDeadline: reg.deadline, regDeadlineDisplay: reg.display, regClosed: reg.closed };
	// `?survey` reopens the read-only survey feed for people who want to see
	// what they answered; everything else lands on registration.
	const wantsSurvey = url.searchParams.has('survey');
```

In the **dev preview** branch, extend the variant handling and return. Replace the preview block's `return { ... }` with:

```ts
		const regVariant = variant === 'register' || variant === 'registered' || variant === 'declined';
		const previewReg: Registration | null =
			variant === 'registered' || variant === 'declined'
				? {
						did: 'did:plc:preview',
						handle: 'preview.bsky.social',
						name: 'Preview Builder',
						email: 'preview@example.com',
						status: variant === 'declined' ? 'declined' : 'confirmed',
						phone: '555-0100',
						emergencyName: 'Sam Preview',
						emergencyPhone: '555-0101',
						dietary: ['vegetarian', 'nut_allergy'],
						dietaryOther: '',
						accessibility: '',
						notes: '',
						travelArrival: 'Fri afternoon, PSP',
						travelDeparture: '',
						travelMode: 'flying',
						travelDetails: '',
						waiverVersion: variant === 'declined' ? null : 'v1',
						cocVersion: variant === 'declined' ? null : 'v1',
						agreedAt: variant === 'declined' ? null : '2026-08-30T18:00:00Z',
						createdAt: '2026-08-30T18:00:00Z',
						updatedAt: '2026-08-30T18:00:00Z'
					}
				: null;
		return {
			user: {
				did: 'did:plc:preview',
				handle: uninvited ? 'newbuilder.bsky.social' : 'preview.bsky.social',
				displayName: uninvited ? 'New Builder' : 'Preview Builder',
				avatar: null
			} as PageUser,
			allowed: !uninvited,
			waitlistState: (variant === 'member' ? 'member' : 'none') as WaitlistState,
			waitlistEmail: variant === 'member' ? 'you@example.com' : null,
			answers: null as SurveyDraft | null,
			existingResponse: false,
			organizer,
			deadline,
			closed,
			knownUser,
			authError,
			...regBase,
			registrationMode: regVariant,
			registration: previewReg,
			prefill: { name: 'Preview Builder', email: 'preview@example.com' }
		};
```

In the **signed-out** return add:

```ts
			...regBase,
			registrationMode: false,
			registration: null as Registration | null,
			prefill: { name: '', email: '' }
```

In the **signed-in** path, after `const stored = ...` add:

```ts
	// Registration row for the front door (allowed users only).
	const registration =
		db && allowed
			? await getRegistration(db, locals.did).catch((e) => {
					console.error('registration load failed for', logDid(locals.did), e);
					return null;
				})
			: null;
```

and in the final return add:

```ts
		...regBase,
		registrationMode: allowed && !wantsSurvey,
		registration,
		prefill: {
			name: stored?.draft.name ?? user.displayName ?? '',
			email: stored?.draft.email ?? ''
		}
```

- [ ] **Step 3: Add the two actions**

Inside `export const actions: Actions = { ... }` after `joinWaitlist`:

```ts
	// Confirm attendance + the full form. Deadline rule: a NEW confirmation
	// is refused after REG_DEADLINE; an existing confirmed row may always be
	// edited (travel firms up late by design).
	register: async ({ locals, platform, request }) => {
		if (!locals.did) return fail(401, { regMessage: 'Sign in first.' });
		const db = platform?.env?.DB;
		if (!db) return fail(503, { regMessage: 'Storage is not available right now — try again shortly.' });

		const input = parseRegistrationForm(await request.formData());
		const checked = validateRegistration(input);
		if (!checked.ok) return fail(400, { regErrors: checked.errors, regValues: input });

		const profileCache = platform?.env?.PROFILE_CACHE
			? cloudflareKV(platform.env.PROFILE_CACHE, { ttl: 3600 })
			: undefined;
		const profile = await loadBskyProfile(locals.did, { cache: profileCache }).catch(() => undefined);
		const handle = profile?.handle ?? null;

		try {
			const allowed = await checkAllowlist(db, { did: locals.did, handle });
			if (!allowed) return fail(403, { regMessage: 'Registration is for invited builders.' });

			const existing = await getRegistration(db, locals.did);
			const { closed } = deadlineStatus(platform?.env?.REG_DEADLINE);
			if (closed && existing?.status !== 'confirmed') return fail(403, { regClosed: true });

			await upsertConfirmed(db, { did: locals.did, handle }, checked.value, {
				waiver: waiver.version,
				coc: codeOfConduct.version
			});

			// Best-effort confirmation: never blocks the registration.
			if (!existing || existing.status !== 'confirmed') {
				const saved = await getRegistration(db, locals.did);
				if (saved) {
					const mail = confirmationEmail(saved);
					const result = await sendEmail(platform?.env ?? {}, { to: saved.email, ...mail });
					if (!result.ok) console.error('registration confirmation email failed', result.code, result.detail ?? '');
				}
			}
		} catch (e) {
			console.error('registration save failed for', logDid(locals.did), e);
			return fail(500, { regMessage: 'Something went wrong saving your registration — please try again.' });
		}
		return { registered: true };
	},

	// One tap, no form. Always allowed, before or after the deadline.
	decline: async ({ locals, platform }) => {
		if (!locals.did) return fail(401, { regMessage: 'Sign in first.' });
		const db = platform?.env?.DB;
		if (!db) return fail(503, { regMessage: 'Storage is not available right now — try again shortly.' });

		const profileCache = platform?.env?.PROFILE_CACHE
			? cloudflareKV(platform.env.PROFILE_CACHE, { ttl: 3600 })
			: undefined;
		const profile = await loadBskyProfile(locals.did, { cache: profileCache }).catch(() => undefined);
		const handle = profile?.handle ?? null;

		try {
			const allowed = await checkAllowlist(db, { did: locals.did, handle });
			if (!allowed) return fail(403, { regMessage: 'Registration is for invited builders.' });
			const stored = await getResponse(db, locals.did).catch(() => null);
			await setDeclined(db, {
				did: locals.did,
				handle,
				name: stored?.draft.name ?? profile?.displayName ?? handle ?? locals.did,
				email: stored?.draft.email ?? ''
			});
		} catch (e) {
			console.error('registration decline failed for', logDid(locals.did), e);
			return fail(500, { regMessage: 'Something went wrong — please try again.' });
		}
		return { declined: true };
	}
```

- [ ] **Step 4: Verify** — `pnpm check` (0 errors), `pnpm test` (30 passing).

- [ ] **Step 5: Commit**

```bash
git add src/routes/+page.server.ts
git commit -m "feat: registration page data, register/decline actions, REG_DEADLINE gate"
```

---

### Task 6: Registration form + registered summary (to the approved comp)

**Files:**
- Create: `src/lib/components/registration/RegistrationForm.svelte`
- Create: `src/lib/components/registration/RegisteredSummary.svelte`
- Create: `src/lib/components/registration/AgreementRow.svelte`

**Interfaces:**
- Consumes: page data + `form` action data (Task 5); these components are rendered by Task 7's `RegistrationFlow` — until then, verify them via the `?preview=register` route only after Task 7, and via `pnpm check` + autofixer here; `registration` copy, `dietaryOptions`, `travelModes`, `waiver`, `codeOfConduct`, `retreatDates`, `retreatLocation` from `$lib/content`; `emptyRegistration`, `type RegistrationInput`, `type RegistrationErrors` from `$lib/registration`; `type Registration` from `$lib/server/registration` (type-only).
- Produces: `RegistrationForm` props `{ data: PageData; form: ActionData; oncancel: () => void }`; `RegisteredSummary` props `{ registration: Registration; regClosed: boolean; onedit: () => void }`; `AgreementRow` props `{ name: 'agreeWaiver' | 'agreeCoc'; label: string; title: string; body: string; version: string; checked: boolean; error?: string | null }`.

- [ ] **Step 1: Create `src/lib/components/registration/AgreementRow.svelte`**

```svelte
<script lang="ts">
	let {
		name,
		label,
		title,
		body,
		version,
		checked = false,
		error = null
	}: {
		name: 'agreeWaiver' | 'agreeCoc';
		label: string;
		title: string;
		body: string;
		version: string;
		checked?: boolean;
		error?: string | null;
	} = $props();

	let on = $state(checked);
	let open = $state(false);
	const id = $derived(`${name}-text`);
</script>

<li class="row" class:on>
	<label class="check">
		<input type="checkbox" {name} bind:checked={on} aria-describedby={id} aria-invalid={error ? 'true' : undefined} />
		<span class="ring" aria-hidden="true"></span>
		<span class="text">
			{label}
			<button type="button" class="read" aria-expanded={open} aria-controls={id} onclick={() => (open = !open)}>read it</button>
			<span class="ver">{version}</span>
		</span>
	</label>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	<div class="body" {id} hidden={!open}>
		<p class="body-title">{title}</p>
		{#each body.split('\n\n') as para (para)}
			<p>{para}</p>
		{/each}
	</div>
</li>

<style>
	.row { padding: 0.85rem 0; border-top: var(--hairline); }
	.row:last-child { border-bottom: var(--hairline); }
	.check { display: flex; align-items: center; gap: 0.9rem; cursor: pointer; }
	.check input { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
	.ring { flex: none; width: 1.15rem; height: 1.15rem; border-radius: 999px; border: 1.75px solid currentColor; transition: background 0.2s var(--ease-out); }
	.check input:checked + .ring { background: var(--ink); box-shadow: inset 0 0 0 3px var(--ground); }
	.check input:focus-visible + .ring { outline: 2px solid var(--ink); outline-offset: 3px; }
	.text { font-size: 0.9375rem; line-height: 1.35; }
	.read { color: var(--ink-70); text-decoration: underline; text-underline-offset: 3px; font-size: var(--text-author); margin-left: 0.35rem; }
	.read:hover { color: var(--ink); }
	.ver { color: var(--ink-45); font-size: 0.75rem; letter-spacing: 0.1em; text-transform: uppercase; margin-left: 0.4rem; }
	.error { margin-top: 0.4rem; font-size: var(--text-author); color: var(--ink); }
	.body { margin: var(--space-2) 0 0 2.05rem; display: grid; gap: var(--space-2); color: var(--ink-70); font-size: 0.9375rem; line-height: 1.5; max-width: 60ch; }
	.body-title { color: var(--ink); font-weight: 550; }
</style>
```

- [ ] **Step 2: Create `src/lib/components/registration/RegistrationForm.svelte`**

Built to `.impeccable/mocks/reg-form-a.png` (band, title overlap, six kicker sections, chips, underline fields, agreements, pill + hint, author line).

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import AgreementRow from '$lib/components/registration/AgreementRow.svelte';
	import { codeOfConduct, dietaryOptions, registration as copy, retreat, travelModes, waiver } from '$lib/content';
	import { emptyRegistration, type RegistrationErrors, type RegistrationInput } from '$lib/registration';
	import type { PageData, ActionData } from '../../../routes/$types';

	let { data, form, oncancel }: { data: PageData; form: ActionData; oncancel: () => void } = $props();

	// Values: a failed submit echoes what was posted; otherwise the stored
	// row (editing) or survey prefill (first time).
	const echoed = $derived(form && 'regValues' in form ? (form.regValues as RegistrationInput) : null);
	const stored = $derived(data.registration);
	const initial = $derived<RegistrationInput>(
		echoed ??
			(stored && stored.status === 'confirmed'
				? {
						name: stored.name,
						email: stored.email,
						phone: stored.phone,
						emergencyName: stored.emergencyName,
						emergencyPhone: stored.emergencyPhone,
						dietary: stored.dietary,
						dietaryOther: stored.dietaryOther,
						accessibility: stored.accessibility,
						notes: stored.notes,
						travelArrival: stored.travelArrival,
						travelDeparture: stored.travelDeparture,
						travelMode: stored.travelMode,
						travelDetails: stored.travelDetails,
						agreeWaiver: stored.agreedAt !== null,
						agreeCoc: stored.agreedAt !== null
					}
				: { ...emptyRegistration(), name: data.prefill.name, email: data.prefill.email })
	);
	const errors = $derived<RegistrationErrors>(form && 'regErrors' in form ? (form.regErrors as RegistrationErrors) : {});
	const message = $derived(form && 'regMessage' in form ? (form.regMessage as string) : null);
	const closedRefusal = $derived(form && 'regClosed' in form && form.regClosed);

	let saving = $state(false);
	let mode = $state<string | null>(null);
	$effect(() => {
		mode = initial.travelMode;
	});
</script>

<div class="doc">
	<div class="band">
		<img src="/media/hero-portrait.png" alt="" />
		<div class="scrim" aria-hidden="true"></div>
		<div class="grain" aria-hidden="true"></div>
		<p class="kicker band-kicker">{copy.formKicker}</p>
	</div>

	<div class="head">
		<h1 class="display title">{copy.formTitle}</h1>
		<p class="sub">{copy.formSub}</p>
	</div>

	<form
		method="POST"
		action="?/register"
		class="body"
		use:enhance={() => {
			saving = true;
			return async ({ update }) => {
				await update({ reset: false });
				saving = false;
			};
		}}
	>
		{#if closedRefusal}
			<p class="flash" role="alert"><strong>{copy.closedLead}</strong> {copy.closedBody} <a class="handle" href={retreat.organizerLink} target="_blank" rel="noopener">@{retreat.organizerHandle}</a>.</p>
		{:else if message}
			<p class="flash" role="alert">{message}</p>
		{/if}

		<section>
			<div class="sec-head"><span class="kicker">{copy.sections.contact.head}</span></div>
			<label class="field">
				<span class="kicker lbl">{copy.sections.contact.name}</span>
				<input class="input" name="name" value={initial.name} autocomplete="name" required aria-invalid={errors.name ? 'true' : undefined} />
				{#if errors.name}<span class="error" role="alert">{errors.name}</span>{/if}
			</label>
			<label class="field">
				<span class="kicker lbl">{copy.sections.contact.email}</span>
				<input class="input" name="email" type="email" value={initial.email} autocomplete="email" required aria-invalid={errors.email ? 'true' : undefined} />
				{#if errors.email}<span class="error" role="alert">{errors.email}</span>{/if}
			</label>
			<label class="field">
				<span class="kicker lbl">{copy.sections.contact.phone}</span>
				<input class="input" name="phone" type="tel" value={initial.phone} autocomplete="tel" placeholder={copy.sections.contact.phoneHint} />
			</label>
		</section>

		<section>
			<div class="sec-head"><span class="kicker">{copy.sections.food.head}</span><span class="hint">{copy.sections.food.hint}</span></div>
			<div class="chips" role="group" aria-label={copy.sections.food.head}>
				{#each dietaryOptions as opt (opt.id)}
					<label class="chip">
						<input type="checkbox" name="dietary" value={opt.id} checked={initial.dietary.includes(opt.id)} />
						<span>{opt.label}</span>
					</label>
				{/each}
			</div>
			{#if errors.dietary}<span class="error" role="alert">{errors.dietary}</span>{/if}
			<label class="field">
				<span class="kicker lbl">{copy.sections.food.other}</span>
				<input class="input" name="dietaryOther" value={initial.dietaryOther} placeholder={copy.sections.food.otherHint} />
			</label>
		</section>

		<section>
			<div class="sec-head"><span class="kicker">{copy.sections.emergency.head}</span></div>
			<div class="grid2">
				<label class="field">
					<span class="kicker lbl">{copy.sections.emergency.name}</span>
					<input class="input" name="emergencyName" value={initial.emergencyName} placeholder={copy.sections.emergency.nameHint} required aria-invalid={errors.emergencyName ? 'true' : undefined} />
					{#if errors.emergencyName}<span class="error" role="alert">{errors.emergencyName}</span>{/if}
				</label>
				<label class="field">
					<span class="kicker lbl">{copy.sections.emergency.phone}</span>
					<input class="input" name="emergencyPhone" type="tel" value={initial.emergencyPhone} placeholder={copy.sections.emergency.phoneHint} required aria-invalid={errors.emergencyPhone ? 'true' : undefined} />
					{#if errors.emergencyPhone}<span class="error" role="alert">{errors.emergencyPhone}</span>{/if}
				</label>
			</div>
		</section>

		<section>
			<div class="sec-head"><span class="kicker">{copy.sections.accessibility.head}</span><span class="hint">{copy.sections.accessibility.hint}</span></div>
			<label class="field">
				<span class="kicker lbl">{copy.sections.accessibility.label}</span>
				<textarea class="input textarea" name="accessibility" rows="2" placeholder={copy.sections.accessibility.placeholder}>{initial.accessibility}</textarea>
			</label>
		</section>

		<section>
			<div class="sec-head"><span class="kicker">{copy.sections.notes.head}</span><span class="hint">{copy.sections.notes.hint}</span></div>
			<label class="field">
				<input class="input" name="notes" value={initial.notes} placeholder={copy.sections.notes.placeholder} aria-label={copy.sections.notes.head} />
			</label>
		</section>

		<section>
			<div class="sec-head"><span class="kicker">{copy.sections.travel.head}</span><span class="hint">{copy.sections.travel.hint}</span></div>
			<div class="chips" role="radiogroup" aria-label={copy.sections.travel.head}>
				{#each travelModes as m (m.id)}
					<label class="chip">
						<input type="radio" name="travelMode" value={m.id} bind:group={mode} />
						<span>{m.label}</span>
					</label>
				{/each}
			</div>
			{#if errors.travelMode}<span class="error" role="alert">{errors.travelMode}</span>{/if}
			<div class="grid2">
				<label class="field">
					<span class="kicker lbl">{copy.sections.travel.arriving}</span>
					<input class="input" name="travelArrival" value={initial.travelArrival} placeholder={copy.sections.travel.arrivingHint} />
				</label>
				<label class="field">
					<span class="kicker lbl">{copy.sections.travel.leaving}</span>
					<input class="input" name="travelDeparture" value={initial.travelDeparture} placeholder={copy.sections.travel.leavingHint} />
				</label>
			</div>
			<label class="field">
				<span class="kicker lbl">{copy.sections.travel.details}</span>
				<input class="input" name="travelDetails" value={initial.travelDetails} placeholder={copy.sections.travel.detailsHint} />
			</label>
		</section>

		<section>
			<div class="sec-head"><span class="kicker">{copy.sections.agreements.head}</span></div>
			<ul class="agree">
				<AgreementRow name="agreeWaiver" label={copy.sections.agreements.waiver} title={waiver.title} body={waiver.body} version={waiver.version} checked={initial.agreeWaiver} error={errors.agreeWaiver ?? null} />
				<AgreementRow name="agreeCoc" label={copy.sections.agreements.coc} title={codeOfConduct.title} body={codeOfConduct.body} version={codeOfConduct.version} checked={initial.agreeCoc} error={errors.agreeCoc ?? null} />
			</ul>
		</section>

		<div class="submit">
			<button class="pill" type="submit" disabled={saving}>{saving ? copy.saving : copy.submit}</button>
			<p class="hint">{copy.submitHint}</p>
			{#if stored}
				<button type="button" class="quiet" onclick={oncancel}>Cancel</button>
			{/if}
		</div>

		<p class="author">
			<span class="avatar" style:background-image={data.organizer.avatar ? `url(${data.organizer.avatar})` : undefined}></span>
			<span>{retreat.organizerLine} <a class="handle" href={retreat.organizerLink} target="_blank" rel="noopener">@{retreat.organizerHandle}</a></span>
		</p>
	</form>
</div>

<style>
	.doc { position: relative; min-height: 100dvh; background: var(--ground); }
	.band { position: relative; height: 34vh; min-height: 250px; overflow: hidden; }
	.band img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 35%; }
	.band .scrim { position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(11,9,8,0.1) 0%, rgba(11,9,8,0.35) 45%, rgba(11,9,8,1) 100%); }
	.band .grain { position: absolute; inset: 0; background: url('/media/grain.png'); background-size: 340px; opacity: 0.07; mix-blend-mode: overlay; pointer-events: none; }
	.band-kicker { position: absolute; top: calc(var(--space-3) + env(safe-area-inset-top)); left: var(--gutter); }
	.head { padding: 0 var(--gutter); margin-top: -3.2rem; position: relative; }
	.title { font-size: clamp(2.2rem, 7.5vw, 3.6rem); }
	.sub { margin-top: var(--space-2); color: var(--ink-70); font-size: 0.9375rem; line-height: 1.45; max-width: 34ch; }
	.body { padding: var(--space-4) var(--gutter) calc(var(--space-5) + env(safe-area-inset-bottom)); display: grid; gap: var(--space-5); }
	section { display: grid; gap: var(--space-3); }
	.sec-head { display: flex; justify-content: space-between; align-items: baseline; padding-top: var(--space-2); border-top: var(--hairline); }
	.hint { font-size: var(--text-author); color: var(--ink-45); }
	.field { display: grid; gap: 0.35rem; }
	.lbl { color: var(--ink-70); }
	.input { width: 100%; background: transparent; border: 0; border-bottom: 1px solid var(--ink-45); border-radius: 0; padding: 0.55rem 0; font-size: 1.125rem; color: var(--ink); }
	.input::placeholder { color: var(--ink-45); }
	.input:focus { outline: none; border-bottom-color: var(--ink); }
	.textarea { resize: none; line-height: 1.4; font-size: 1rem; }
	.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
	.chips { display: flex; flex-wrap: wrap; gap: 0.5rem; }
	.chip { position: relative; border: 1px solid var(--ink-45); border-radius: 999px; padding: 0.45rem 0.85rem; font-size: 0.8125rem; color: var(--ink-70); cursor: pointer; transition: background 0.2s var(--ease-out), color 0.2s var(--ease-out); }
	.chip input { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
	.chip:has(input:checked) { background: var(--ink); color: var(--on-pill); border-color: var(--ink); font-weight: 600; }
	.chip:has(input:focus-visible) { outline: 2px solid var(--ink); outline-offset: 3px; }
	.agree { list-style: none; }
	.error { font-size: var(--text-author); color: var(--ink); }
	.flash { padding: 0.65rem 0; border-top: var(--hairline); border-bottom: var(--hairline); font-size: var(--text-author); line-height: 1.5; color: var(--ink-70); }
	.flash strong, .handle { color: var(--ink); font-weight: 550; }
	.handle { text-decoration: underline; text-underline-offset: 3px; }
	.submit { display: grid; gap: var(--space-2); justify-items: center; }
	.submit .hint { color: var(--ink-70); }
	.quiet { font-size: var(--text-author); color: var(--ink-70); text-decoration: underline; text-underline-offset: 3px; }
	.author { display: flex; align-items: center; gap: 0.6rem; font-size: var(--text-author); color: var(--ink-70); }
	.avatar { width: 1.9rem; height: 1.9rem; border-radius: 999px; border: 1px solid var(--ink-45); background: var(--ink-12) center/cover no-repeat; }
</style>
```

- [ ] **Step 3: Create `src/lib/components/registration/RegisteredSummary.svelte`**

Form-A rendered as a read summary: same band and title, the same six sections as label/value ledgers, one ghost-outlined Edit pill per section (all open the form; the travel section carries the nudge), the survey link lives in the flow.

```svelte
<script lang="ts">
	import { dietaryOptions, registration as copy, retreat, retreatDates, retreatLocation, travelModes } from '$lib/content';
	import type { Registration } from '$lib/server/registration';

	let { registration: reg, regClosed, onedit }: { registration: Registration; regClosed: boolean; onedit: () => void } = $props();

	const dietaryLabels = $derived(
		reg.dietary.map((id) => dietaryOptions.find((o) => o.id === id)?.label ?? id).join(', ')
	);
	const modeLabel = $derived(reg.travelMode ? (travelModes.find((m) => m.id === reg.travelMode)?.label ?? '') : '');
	const dash = '—';
</script>

<div class="doc">
	<div class="band">
		<img src="/media/hero-portrait.png" alt="" />
		<div class="scrim" aria-hidden="true"></div>
		<div class="grain" aria-hidden="true"></div>
		<p class="kicker band-kicker">{copy.formKicker}</p>
	</div>

	<div class="head">
		<h1 class="display title">{copy.registeredTitle}</h1>
		<p class="sub">{copy.registeredSub}</p>
	</div>

	<div class="body">
		<ul class="ledger facts">
			<li><span class="k">When</span><span>{retreatDates.display}</span></li>
			<li><span class="k">Where</span><span>{retreatLocation.display}</span></li>
			<li class="muted"><span class="k"></span><span>{retreatLocation.pending}</span></li>
		</ul>

		<section>
			<div class="sec-head"><span class="kicker">{copy.sections.travel.head}</span><span class="hint nudge">{copy.travelNudge}</span></div>
			<ul class="rows">
				<li><span class="k">By</span><span class="v" class:empty={!modeLabel}>{modeLabel || dash}</span></li>
				<li><span class="k">{copy.sections.travel.arriving}</span><span class="v" class:empty={!reg.travelArrival}>{reg.travelArrival || dash}</span></li>
				<li><span class="k">{copy.sections.travel.leaving}</span><span class="v" class:empty={!reg.travelDeparture}>{reg.travelDeparture || dash}</span></li>
				{#if reg.travelDetails}<li><span class="k">{copy.sections.travel.details}</span><span class="v">{reg.travelDetails}</span></li>{/if}
			</ul>
			<button class="pill ghost" onclick={onedit}>{copy.edit}</button>
		</section>

		<section>
			<div class="sec-head"><span class="kicker">{copy.sections.contact.head}</span></div>
			<ul class="rows">
				<li><span class="k">{copy.sections.contact.name}</span><span class="v">{reg.name}</span></li>
				<li><span class="k">{copy.sections.contact.email}</span><span class="v">{reg.email}</span></li>
				<li><span class="k">{copy.sections.contact.phone}</span><span class="v" class:empty={!reg.phone}>{reg.phone || dash}</span></li>
			</ul>
		</section>

		<section>
			<div class="sec-head"><span class="kicker">{copy.sections.food.head}</span></div>
			<ul class="rows">
				<li><span class="k">Needs</span><span class="v" class:empty={!dietaryLabels}>{dietaryLabels || 'None'}</span></li>
				{#if reg.dietaryOther}<li><span class="k">Notes</span><span class="v">{reg.dietaryOther}</span></li>{/if}
			</ul>
		</section>

		<section>
			<div class="sec-head"><span class="kicker">{copy.sections.emergency.head}</span></div>
			<ul class="rows">
				<li><span class="k">{copy.sections.emergency.name}</span><span class="v">{reg.emergencyName}</span></li>
				<li><span class="k">{copy.sections.emergency.phone}</span><span class="v">{reg.emergencyPhone}</span></li>
			</ul>
		</section>

		{#if reg.accessibility || reg.notes}
			<section>
				<div class="sec-head"><span class="kicker">{copy.sections.accessibility.head} · {copy.sections.notes.head}</span></div>
				<ul class="rows">
					{#if reg.accessibility}<li><span class="k">{copy.sections.accessibility.head}</span><span class="v">{reg.accessibility}</span></li>{/if}
					{#if reg.notes}<li><span class="k">{copy.sections.notes.head}</span><span class="v">{reg.notes}</span></li>{/if}
				</ul>
			</section>
		{/if}

		<section>
			<div class="sec-head"><span class="kicker">{copy.sections.agreements.head}</span></div>
			<ul class="rows">
				<li><span class="k">Waiver</span><span class="v">{reg.waiverVersion} · agreed {reg.agreedAt ? new Date(reg.agreedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : dash}</span></li>
				<li><span class="k">Conduct</span><span class="v">{reg.cocVersion}</span></li>
			</ul>
		</section>

		<div class="foot">
			<button class="pill ghost" onclick={onedit}>{copy.edit}</button>
			{#if regClosed}<p class="hint">Registration is closed to new sign-ups, but yours stays editable.</p>{/if}
		</div>

		<p class="author"><span class="avatar"></span><span>{retreat.organizerLine} <a class="handle" href={retreat.organizerLink} target="_blank" rel="noopener">@{retreat.organizerHandle}</a></span></p>
	</div>
</div>

<style>
	.doc { position: relative; min-height: 100dvh; background: var(--ground); }
	.band { position: relative; height: 34vh; min-height: 250px; overflow: hidden; }
	.band img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 35%; }
	.band .scrim { position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(11,9,8,0.1) 0%, rgba(11,9,8,0.35) 45%, rgba(11,9,8,1) 100%); }
	.band .grain { position: absolute; inset: 0; background: url('/media/grain.png'); background-size: 340px; opacity: 0.07; mix-blend-mode: overlay; pointer-events: none; }
	.band-kicker { position: absolute; top: calc(var(--space-3) + env(safe-area-inset-top)); left: var(--gutter); }
	.head { padding: 0 var(--gutter); margin-top: -3.2rem; position: relative; }
	.title { font-size: clamp(2.2rem, 7.5vw, 3.6rem); }
	.sub { margin-top: var(--space-2); color: var(--ink-70); font-size: 0.9375rem; line-height: 1.45; max-width: 34ch; }
	.body { padding: var(--space-4) var(--gutter) calc(var(--space-5) + env(safe-area-inset-bottom)); display: grid; gap: var(--space-5); }
	.facts .muted span { color: var(--ink-70); }
	.k { color: var(--ink-70); }
	section { display: grid; gap: var(--space-3); }
	.sec-head { display: flex; justify-content: space-between; align-items: baseline; padding-top: var(--space-2); border-top: var(--hairline); }
	.hint { font-size: var(--text-author); color: var(--ink-45); }
	.nudge { color: var(--ink-70); }
	.rows { list-style: none; }
	.rows li { display: grid; grid-template-columns: 6.2rem 1fr; gap: var(--space-2); align-items: baseline; padding: 0.6rem 0; border-top: 1px solid rgba(255, 255, 255, 0.14); }
	.rows .k { font-size: 0.6875rem; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 500; }
	.v { font-size: 1.0625rem; }
	.v.empty { color: var(--ink-45); }
	.pill.ghost { background: transparent; border: 1.5px solid var(--ink); color: var(--ink); width: auto; justify-self: start; padding: 0.55rem 1.25rem; min-height: 2.6rem; }
	.foot { display: grid; gap: var(--space-2); justify-items: center; }
	.foot .hint { color: var(--ink-70); }
	.author { display: flex; align-items: center; gap: 0.6rem; font-size: var(--text-author); color: var(--ink-70); }
	.avatar { width: 1.9rem; height: 1.9rem; border-radius: 999px; border: 1px solid var(--ink-45); background: var(--ink-12); }
	.handle { color: var(--ink); font-weight: 550; text-decoration: underline; text-underline-offset: 3px; }
</style>
```

- [ ] **Step 4: Validate with the Svelte MCP autofixer**

Run `mcp__svelte__svelte-autofixer` on each of the three components; apply fixes until clean. (Watch: `:has()` selectors are fine for chip state; `bind:group` on radios with a `$state` string is the Svelte 5 idiom.)

- [ ] **Step 5: Verify**

`pnpm check` 0 errors; `pnpm test` 30 passing; autofixer clean. The comp side-by-side happens in Task 7 Step 4 once the flow renders these components: screenshot `?preview=register` after tapping I'm in (use a Playwright snippet: `page.click('text=I’m in')` before the screenshot) to `.superpowers/sdd/reg-form-build.png` full-page, and `?preview=registered` to `.superpowers/sdd/reg-registered-build.png`. Compare with `.impeccable/mocks/reg-form-a.png` region by region (band+title overlap, section heads with hints, chip wrap, field rhythm, agreement rows, pill+hint). Fix mismatches before committing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/registration/AgreementRow.svelte src/lib/components/registration/RegistrationForm.svelte src/lib/components/registration/RegisteredSummary.svelte
git commit -m "feat: registration form, agreements, and registered summary"
```

---

### Task 7: Announcement item + flow + front-door swap

**Files:**
- Create: `src/lib/components/registration/AnnouncementItem.svelte`
- Create: `src/lib/components/registration/RegistrationFlow.svelte`
- Modify: `src/routes/+page.svelte` (branch on `data.registrationMode`)

**Interfaces:**
- Consumes: `FeedItem` (existing), `Icon` (existing), `registration`, `retreat` from `$lib/content`; page data + action data from Task 5; `RegistrationForm` and `RegisteredSummary` from Task 6.
- Produces: `AnnouncementItem` props `{ state: 'open' | 'declined' | 'closed'; deadlineDisplay: string | null; organizerAvatar: string | null; busy: boolean; onconfirm: () => void }` — the decline is a real `<form method="POST" action="?/decline" use:enhance>`; `RegistrationFlow` props `{ data: PageData; form: ActionData }` and exports nothing else.

- [ ] **Step 1: Create `src/lib/components/registration/AnnouncementItem.svelte`**

Built to `.impeccable/mocks/reg-ann-a.png`. Reuses the HeroItem grammar (kicker topline, breathe, ack, stacked display, ledger, pill, author).

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import { logout } from '@svelte-atproto/oauth/client';
	import Icon from '$lib/components/Icon.svelte';
	import { registration, retreat } from '$lib/content';

	let {
		state,
		deadlineDisplay = null,
		organizerAvatar = null,
		busy = false,
		onconfirm
	}: {
		state: 'open' | 'declined' | 'closed';
		deadlineDisplay?: string | null;
		organizerAvatar?: string | null;
		busy?: boolean;
		onconfirm: () => void;
	} = $props();

	let declining = $state(false);
</script>

<div class="ann">
	<div class="topline">
		<p class="kicker">{registration.kicker}</p>
		<button class="signout" onclick={() => void logout()}>sign out</button>
	</div>

	<div class="breathe" aria-hidden="true"></div>

	<p class="ack">{registration.ack[0]}<br />{registration.ack[1]}</p>

	<h1 id="ann-title" class="display date">
		<span class="l1">{registration.dateLines[0]}</span>
		<span class="l2">{registration.dateLines[1]}</span>
	</h1>

	<ul class="ledger facts">
		{#each registration.facts as fact (fact.label)}
			<li class:muted={fact.muted}>
				<span class="fact-label">{fact.label}</span>
				{#if fact.value}
					<span class="fact-value">
						{#if fact.value === 'Bluesky'}
							<span class="keep">{fact.value} <Icon name="butterfly" size={15} label="Bluesky" /></span>
						{:else}
							{fact.value}
						{/if}
					</span>
				{/if}
			</li>
		{/each}
	</ul>

	{#if state === 'closed'}
		<p class="note" role="status">
			<strong>{registration.closedLead}</strong>
			{registration.closedBody}
			<a class="handle" href={retreat.organizerLink} target="_blank" rel="noopener">@{retreat.organizerHandle}</a>.
		</p>
	{:else if state === 'declined'}
		<p class="note" role="status"><strong>{registration.declinedLead}</strong> {registration.declinedBody}</p>
		<button class="pill" onclick={onconfirm} disabled={busy}>{registration.declinedUndo}</button>
	{:else}
		<div class="actions">
			<button class="pill" onclick={onconfirm} disabled={busy}>{registration.confirm}</button>
			<form
				method="POST"
				action="?/decline"
				use:enhance={() => {
					declining = true;
					return async ({ update }) => {
						await update();
						declining = false;
					};
				}}
			>
				<button class="quiet" type="submit" disabled={declining || busy}>{registration.decline}</button>
			</form>
		</div>
	{/if}

	<p class="author">
		<span class="avatar" style:background-image={organizerAvatar ? `url(${organizerAvatar})` : undefined}></span>
		<span class="author-text">{retreat.organizerLine} <a class="handle" href={retreat.organizerLink} target="_blank" rel="noopener">@{retreat.organizerHandle}</a></span>
	</p>
</div>

<style>
	.ann { display: flex; flex-direction: column; min-height: 100%; }
	.topline { display: flex; justify-content: space-between; align-items: baseline; }
	.signout { font-size: var(--text-author); color: var(--ink-70); text-decoration: underline; text-underline-offset: 3px; }
	.breathe { flex: 1 1 auto; min-height: 10vh; }
	.ack { font-size: var(--text-ack); line-height: 1.4; margin-bottom: var(--space-2); max-width: 22ch; }
	.date { display: grid; }
	.l1 { font-size: var(--display-l1); }
	.l2 { font-size: var(--display-l2); }
	.facts { margin: var(--space-3) 0; }
	.facts li.muted .fact-label { color: var(--ink-70); }
	.fact-value { text-align: right; text-wrap: balance; }
	.keep { white-space: nowrap; display: inline-flex; align-items: center; gap: 0.35rem; }
	.actions { display: grid; gap: var(--space-2); justify-items: center; }
	.quiet { font-size: var(--text-author); color: var(--ink-70); text-decoration: underline; text-underline-offset: 3px; }
	.quiet:disabled { opacity: 0.55; }
	.note { font-size: var(--text-author); line-height: 1.5; color: var(--ink-70); max-width: 40ch; margin-bottom: var(--space-3); }
	.note strong { color: var(--ink); font-weight: 550; }
	.handle { color: var(--ink); font-weight: 550; text-decoration: underline; text-underline-offset: 3px; }
	.author { display: flex; align-items: center; gap: 0.6rem; margin-top: var(--space-3); font-size: var(--text-author); color: var(--ink-70); }
	.avatar { width: 1.9rem; height: 1.9rem; border-radius: 999px; border: 1px solid var(--ink-45); background: var(--ink-12) center/cover no-repeat; }
</style>
```

Note for the implementer: `HeroItem.svelte` already carries `.topline`, `.signout`, `.ack`, `.facts`, `.author`, `.avatar` styles with exact values — copy those declarations verbatim into this component (Svelte scopes styles per component) and keep the values identical rather than approximating.

- [ ] **Step 2: Create `src/lib/components/registration/RegistrationFlow.svelte`**

```svelte
<script lang="ts">
	import FeedItem from '$lib/components/FeedItem.svelte';
	import AnnouncementItem from '$lib/components/registration/AnnouncementItem.svelte';
	import RegistrationForm from '$lib/components/registration/RegistrationForm.svelte';
	import RegisteredSummary from '$lib/components/registration/RegisteredSummary.svelte';
	import { registration as copy } from '$lib/content';
	import type { PageData, ActionData } from '../../../routes/$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Which document (if any) sits under the announcement. `editing` is the
	// user's explicit choice to open the form from a registered state.
	let editing = $state(false);
	const reg = $derived(data.registration);
	const registered = $derived(reg?.status === 'confirmed' && reg.agreedAt !== null);
	const declined = $derived(reg?.status === 'declined');
	const closedForNew = $derived(data.regClosed && !registered);

	const mode = $derived<'announce' | 'form' | 'registered'>(
		editing ? 'form' : registered ? 'registered' : 'announce'
	);

	// A successful save closes the form; the load re-runs with the new row.
	$effect(() => {
		if (form && 'registered' in form && form.registered) editing = false;
	});
</script>

{#if mode === 'announce'}
	<main class="reg-feed">
		<FeedItem id="announce" media="/media/hero-portrait.png" mediaWide="/media/hero-landscape.png" eager labelledby="ann-title">
			<AnnouncementItem
				state={closedForNew ? 'closed' : declined ? 'declined' : 'open'}
				deadlineDisplay={data.regDeadlineDisplay}
				organizerAvatar={data.organizer.avatar}
				onconfirm={() => (editing = true)}
			/>
		</FeedItem>
	</main>
{:else if mode === 'form'}
	<RegistrationForm {data} {form} oncancel={() => (editing = false)} />
{:else}
	<RegisteredSummary registration={reg!} regClosed={data.regClosed} onedit={() => (editing = true)} />
{/if}

<p class="survey-link"><a href="/?survey">{copy.surveyLink}</a></p>

<style>
	.reg-feed { height: 100dvh; overflow: hidden; }
	.survey-link { position: fixed; right: var(--gutter); bottom: calc(var(--space-2) + env(safe-area-inset-bottom)); font-size: var(--text-author); }
	.survey-link a { color: var(--ink-45); text-decoration: underline; text-underline-offset: 3px; }
	.survey-link a:hover { color: var(--ink); }
</style>
```


- [ ] **Step 3: Branch `src/routes/+page.svelte`**

Add the import next to the other component imports:

```ts
	import RegistrationFlow from '$lib/components/registration/RegistrationFlow.svelte';
```

Wrap the existing markup: everything from `<svelte:window {onkeydown} />` through `<SignInSheet ... />` becomes the `{:else}` branch:

```svelte
{#if data.registrationMode}
	<RegistrationFlow {data} {form} />
{:else}
	<svelte:window {onkeydown} />
	<main class="feed" ...>  <!-- existing feed, unchanged -->
		...
	</main>
	<div inert={sheetOpen}> ... </div>
	<SignInSheet ... />
{/if}
```

The `<svelte:window>` element must stay at the top level of the branch (Svelte allows it inside `{#if}` only at component top level — if svelte-check rejects it, keep `<svelte:window {onkeydown} />` outside the `{#if}` and early-return inside `onkeydown` when `data.registrationMode`).

- [ ] **Step 4: Verify** — `pnpm check` 0 errors; `pnpm dev` and open `http://localhost:5173/?preview=register` — the announcement renders per the comp; `?preview=declined` shows the declined note + "Actually, I can come"; `?preview` (survey) still renders the survey feed. Screenshot `?preview=register` at 393×852 via `scripts/shot.mjs` to `.superpowers/sdd/reg-ann-build.png` and compare side-by-side with `.impeccable/mocks/reg-ann-a.png`: stacked date scale, ledger rows, pill, quiet link, author line must match; fix before committing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/registration/AnnouncementItem.svelte src/lib/components/registration/RegistrationFlow.svelte src/routes/+page.svelte
git commit -m "feat: registration front door — announcement item and flow switch"
```

---

### Task 8: Organizer — Registrations panel + CSV

**Files:**
- Modify: `src/routes/organizer/+page.server.ts` (data + preview fixtures)
- Create: `src/lib/components/organizer/RegistrationsPanel.svelte`
- Modify: `src/routes/organizer/+page.svelte` (render the panel after `EmailPanel`)
- Modify: `src/lib/organizer/csv.ts` (add `registrationsCsv`)
- Create: `src/routes/organizer/registrations.csv/+server.ts`
- Test: `src/lib/organizer/csv.test.ts` (new — `registrationsCsv` header + one row)

**Interfaces:**
- Consumes: `listRegistrations`, `registrationCounts`, `noResponseHandles`, `travelStatus`, `isRegistered`, `type Registration` from `$lib/server/registration`; `AllowlistEntry`; `deadlineStatus`.
- Produces: `OrganizerPageData` gains `registrations: Registration[]`, `regDeadlineDisplay: string | null`, `regClosed: boolean`; `registrationsCsv(regs: Registration[]): string`; route `GET /organizer/registrations.csv`.

- [ ] **Step 1: Failing CSV test** — `src/lib/organizer/csv.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { registrationsCsv } from './csv';

describe('registrationsCsv', () => {
	it('emits the header and a flattened row', () => {
		const csv = registrationsCsv([
			{
				did: 'did:plc:a', handle: 'a.test', name: 'A, B', email: 'a@x.com', status: 'confirmed', phone: '1',
				emergencyName: 'E', emergencyPhone: '2', dietary: ['vegan', 'kosher'], dietaryOther: '', accessibility: 'ramp',
				notes: '', travelArrival: 'Fri', travelDeparture: 'Mon', travelMode: 'flying', travelDetails: '',
				waiverVersion: 'v1', cocVersion: 'v1', agreedAt: '2026-08-30T00:00:00Z', createdAt: 'c', updatedAt: 'u'
			}
		]);
		const [header, row] = csv.trim().split('\r\n');
		expect(header).toBe('handle,did,name,email,status,registered,phone,emergency_name,emergency_phone,dietary,dietary_other,accessibility,notes,travel_mode,travel_arrival,travel_departure,travel_details,waiver_version,coc_version,agreed_at,updated_at');
		expect(row).toBe('a.test,did:plc:a,"A, B",a@x.com,confirmed,yes,1,E,2,vegan; kosher,,ramp,,flying,Fri,Mon,,v1,v1,2026-08-30T00:00:00Z,u');
	});
});
```

(csv.ts imports `NO_PREFERENCE` from `$lib/content` — change that import to `'../content'` and the `OrganizerResponse` type import to `'../server/organizer'` so vitest resolves it.)

- [ ] **Step 2: Run to verify failure** — `pnpm test` — Expected: FAIL, `registrationsCsv` is not exported.

- [ ] **Step 3: Add `registrationsCsv` to `src/lib/organizer/csv.ts`**

```ts
import { isRegistered, type Registration } from '../server/registration';

export function registrationsCsv(regs: Registration[]): string {
	const rows: (string | number | null)[][] = [
		[
			'handle', 'did', 'name', 'email', 'status', 'registered', 'phone', 'emergency_name', 'emergency_phone',
			'dietary', 'dietary_other', 'accessibility', 'notes', 'travel_mode', 'travel_arrival', 'travel_departure',
			'travel_details', 'waiver_version', 'coc_version', 'agreed_at', 'updated_at'
		]
	];
	for (const r of regs) {
		rows.push([
			r.handle, r.did, r.name, r.email, r.status, isRegistered(r) ? 'yes' : 'no', r.phone, r.emergencyName,
			r.emergencyPhone, r.dietary.join('; '), r.dietaryOther, r.accessibility, r.notes, r.travelMode,
			r.travelArrival, r.travelDeparture, r.travelDetails, r.waiverVersion, r.cocVersion, r.agreedAt, r.updatedAt
		]);
	}
	return toCsv(rows);
}
```

- [ ] **Step 4: Create `src/routes/organizer/registrations.csv/+server.ts`**

```ts
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isOrganizer } from '$lib/server/organizer';
import { listRegistrations } from '$lib/server/registration';
import { registrationsCsv } from '$lib/organizer/csv';

export const GET: RequestHandler = async ({ locals, platform }) => {
	if (!locals.did || !isOrganizer(platform?.env?.ORGANIZER_DIDS, locals.did)) {
		error(404, { message: 'Not found' });
	}
	const db = platform?.env?.DB;
	if (!db) error(503, { message: 'Storage is not available right now' });

	const body = registrationsCsv(await listRegistrations(db));
	return new Response(body, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': 'attachment; filename="retreat-registrations.csv"',
			'cache-control': 'no-store'
		}
	});
};
```

- [ ] **Step 5: Extend `src/routes/organizer/+page.server.ts`**

Imports:

```ts
import { listRegistrations, type Registration } from '$lib/server/registration';
```

`OrganizerPageData` gains:

```ts
	registrations: Registration[];
	regDeadlineDisplay: string | null;
	regClosed: boolean;
```

`EMPTY` gains `registrations: [], regDeadlineDisplay: null, regClosed: false`. In `load`, add to the `Promise.all`:

```ts
		listRegistrations(db).catch((e) => {
			console.error('registration list failed', e);
			return [] as Registration[];
		})
```

destructured as `registrations`; compute `const reg = deadlineStatus(platform?.env?.REG_DEADLINE);` next to `base`; return `registrations, regDeadlineDisplay: reg.display, regClosed: reg.closed`. In `previewData()` add:

```ts
		regDeadlineDisplay: 'September 7',
		regClosed: false,
		registrations: [
			{ did: 'did:plc:preview0', handle: 'maren0.bsky.social', name: 'Maren Costa', email: 'maren0@example.com', status: 'confirmed', phone: '555-0100', emergencyName: 'Sam Costa', emergencyPhone: '555-0101', dietary: ['vegetarian', 'nut_allergy'], dietaryOther: '', accessibility: '', notes: '', travelArrival: 'Fri 3pm PSP', travelDeparture: 'Mon 9am', travelMode: 'flying', travelDetails: 'AS 1234', waiverVersion: 'v1', cocVersion: 'v1', agreedAt: '2026-08-30T18:00:00Z', createdAt: '2026-08-30T18:00:00Z', updatedAt: '2026-08-31T09:00:00Z' },
			{ did: 'did:plc:preview1', handle: 'chris1.bsky.social', name: 'Chris Lee', email: 'chris1@example.com', status: 'confirmed', phone: '', emergencyName: 'Pat Lee', emergencyPhone: '555-0102', dietary: [], dietaryOther: '', accessibility: 'Ground-floor room, please', notes: '', travelArrival: '', travelDeparture: '', travelMode: 'driving', travelDetails: '', waiverVersion: 'v1', cocVersion: 'v1', agreedAt: '2026-08-30T19:00:00Z', createdAt: '2026-08-30T19:00:00Z', updatedAt: '2026-08-30T19:00:00Z' },
			{ did: 'did:plc:preview2', handle: 'koko2.bsky.social', name: 'Koko Nguyen', email: 'koko2@example.com', status: 'declined', phone: '', emergencyName: '', emergencyPhone: '', dietary: [], dietaryOther: '', accessibility: '', notes: '', travelArrival: '', travelDeparture: '', travelMode: null, travelDetails: '', waiverVersion: null, cocVersion: null, agreedAt: null, createdAt: '2026-08-30T20:00:00Z', updatedAt: '2026-08-30T20:00:00Z' }
		] as Registration[]
```

and update the `previewData` return type `Omit<...>` if svelte-check requires (the new fields are part of `OrganizerPageData`).

- [ ] **Step 6: Create `src/lib/components/organizer/RegistrationsPanel.svelte`**

Organizer language: kicker section head, stat ledger, hairline table (0.14 row separators), quiet links, one pill for the CSV. Copy the page-scoped rules it needs (`.section-head`, `.section-title`, `.section-sub`, `.section-empty`) into its own `<style>` — Svelte scoping means `+page.svelte`'s rules do not reach child components (EmailPanel learned this the hard way).

```svelte
<script lang="ts">
	import { dietaryOptions, travelModes } from '$lib/content';
	import {
		isRegistered,
		noResponseHandles,
		registrationCounts,
		travelStatus,
		type Registration
	} from '$lib/server/registration';
	import type { AllowlistEntry } from '$lib/server/organizer';

	let {
		registrations,
		allowlist,
		deadlineDisplay,
		closed
	}: { registrations: Registration[]; allowlist: AllowlistEntry[]; deadlineDisplay: string | null; closed: boolean } = $props();

	const counts = $derived(registrationCounts(registrations, allowlist));
	const missing = $derived(noResponseHandles(registrations, allowlist));
	const confirmed = $derived(registrations.filter((r) => r.status === 'confirmed'));
	const declined = $derived(registrations.filter((r) => r.status === 'declined'));

	function diet(r: Registration): string {
		const labels = r.dietary.map((id) => dietaryOptions.find((o) => o.id === id)?.label ?? id);
		if (r.dietaryOther) labels.push(r.dietaryOther);
		return labels.join(', ') || '—';
	}
	function mode(r: Registration): string {
		return r.travelMode ? (travelModes.find((m) => m.id === r.travelMode)?.label ?? r.travelMode) : '—';
	}
	function when(iso: string): string {
		return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}
</script>

<section aria-labelledby="reg-head">
	<div class="section-head">
		<h2 id="reg-head" class="display section-title">Registrations</h2>
		<p class="section-sub">
			{#if closed}Closed {deadlineDisplay}{:else if deadlineDisplay}Register by {deadlineDisplay}{/if}
			· <a class="quiet" href="/organizer/registrations.csv">Download CSV</a>
		</p>
	</div>

	<ul class="ledger counts">
		<li><span class="kicker">Confirmed</span><span class="n">{counts.confirmed}</span></li>
		<li><span class="kicker">Fully registered</span><span class="n">{counts.registered}</span></li>
		<li><span class="kicker">Declined</span><span class="n">{counts.declined}</span></li>
		<li><span class="kicker">No response yet</span><span class="n">{counts.noResponse}</span></li>
	</ul>

	{#if confirmed.length === 0}
		<p class="section-empty">No one has registered yet.</p>
	{:else}
		<div class="table-wrap">
			<table class="reg-table">
				<thead>
					<tr><th class="kicker">Who</th><th class="kicker">Food</th><th class="kicker">Access</th><th class="kicker">Travel</th><th class="kicker">Agreed</th><th class="kicker">Updated</th></tr>
				</thead>
				<tbody>
					{#each confirmed as r (r.did)}
						<tr>
							<td><strong>{r.name}</strong><br /><span class="dim">{r.handle ? `@${r.handle}` : r.did.slice(0, 16)}</span></td>
							<td>{diet(r)}</td>
							<td class:dim={!r.accessibility}>{r.accessibility || '—'}</td>
							<td><span class="kicker status-{travelStatus(r)}">{travelStatus(r)}</span><br /><span class="dim">{mode(r)}{r.travelArrival ? ` · ${r.travelArrival}` : ''}{r.travelDeparture ? ` → ${r.travelDeparture}` : ''}</span></td>
							<td>{isRegistered(r) ? `${r.waiverVersion} / ${r.cocVersion}` : '—'}</td>
							<td class="dim">{when(r.updatedAt)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	{#if declined.length}
		<details class="sub">
			<summary class="kicker">Declined · {declined.length}</summary>
			<ul class="plain">{#each declined as r (r.did)}<li>{r.name} <span class="dim">{r.handle ? `@${r.handle}` : ''}</span></li>{/each}</ul>
		</details>
	{/if}

	{#if missing.length}
		<details class="sub">
			<summary class="kicker">No response yet · {missing.length}</summary>
			<ul class="plain">{#each missing as m (m.handle)}<li>@{m.handle}</li>{/each}</ul>
		</details>
	{/if}
</section>

<style>
	.section-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--space-2); }
	.section-title { font-size: clamp(1.35rem, 4.2vw, 1.9rem); font-weight: 650; letter-spacing: 0.01em; }
	.section-sub { margin-top: 0.35rem; font-size: 0.8125rem; color: var(--ink-70); }
	.section-empty { color: var(--ink-70); font-size: 0.9375rem; padding: 0.65rem 0; border-top: var(--hairline); border-bottom: var(--hairline); }
	.quiet { color: var(--ink-70); text-decoration: underline; text-underline-offset: 3px; }
	.quiet:hover { color: var(--ink); }
	.counts { margin: var(--space-3) 0; }
	.counts .kicker { color: var(--ink-70); }
	.counts .n { font-family: var(--font-display); font-weight: 700; font-size: 1.6rem; line-height: 0.92; font-variant-numeric: tabular-nums; }
	.table-wrap { overflow-x: auto; }
	.reg-table { width: 100%; border-collapse: collapse; font-size: 0.9375rem; }
	.reg-table th { text-align: left; padding: 0.5rem 0.6rem 0.5rem 0; border-bottom: var(--hairline); color: var(--ink-70); }
	.reg-table td { vertical-align: top; padding: 0.7rem 0.6rem 0.7rem 0; border-bottom: 1px solid rgba(255, 255, 255, 0.14); }
	.dim { color: var(--ink-70); }
	.status-none { color: var(--ink-45); }
	.status-partial { color: var(--ink-70); }
	.status-complete { color: var(--ink); }
	.sub { margin-top: var(--space-3); }
	.sub summary { cursor: pointer; color: var(--ink-70); }
	.plain { list-style: none; margin-top: var(--space-2); display: grid; gap: 0.35rem; font-size: 0.9375rem; }
</style>
```

- [ ] **Step 7: Render it in `src/routes/organizer/+page.svelte`**

Import: `import RegistrationsPanel from '$lib/components/organizer/RegistrationsPanel.svelte';` and, directly **before** `<EmailPanel`, render:

```svelte
			<RegistrationsPanel
				registrations={data.registrations}
				allowlist={data.allowlist}
				deadlineDisplay={data.regDeadlineDisplay}
				closed={data.regClosed}
			/>
```

- [ ] **Step 8: Verify** — `pnpm test` 31 passing; `pnpm check` 0 errors; autofixer clean on the panel; `?preview` on `/organizer` shows the headcount ledger (2 / 2 / 1 / N), the table, and the two `<details>` lists.

- [ ] **Step 9: Commit**

```bash
git add src/lib/organizer/csv.ts src/lib/organizer/csv.test.ts src/routes/organizer/registrations.csv/+server.ts src/routes/organizer/+page.server.ts src/lib/components/organizer/RegistrationsPanel.svelte src/routes/organizer/+page.svelte
git commit -m "feat: organizer registrations panel, headcount, and CSV export"
```

---

### Task 9: Finish — detector, screenshots, impeccable finish review, PR

**Files:** none new (fixes land in the files above).

- [ ] **Step 1: Full verification**

```bash
pnpm test && pnpm check && pnpm build
```

Expected: all pass.

- [ ] **Step 2: Design detector + screenshots**

```bash
node .claude/skills/impeccable/scripts/detect.mjs --json src/lib/components/registration src/lib/components/organizer/RegistrationsPanel.svelte
```

Fix mechanical findings. Then capture (dev server running, `PLAYWRIGHT_BROWSERS_PATH=$PWD/.playwright-browsers`):
- `?preview=register` at 393×852 → `.superpowers/sdd/finish-ann-mobile.png`, and at 1280×800 → `finish-ann-desktop.png`
- form state (after clicking I'm in) full-page at 393 → `finish-form-mobile.png`, 1280 → `finish-form-desktop.png`
- `?preview=registered` at 393 full-page → `finish-registered-mobile.png`
- `/organizer?preview` at 1440×900 → `finish-org-desktop.png`

- [ ] **Step 3: Spawn the impeccable finish reviewer**

Dispatch `impeccable-finish-reviewer` (fresh, no inherited transcript) with: the original request (registration flow, spec path), the confirmed answers (feed moment + free-scroll form; wrongness guards; Ann-A + Form-A approved), artifact paths (the three registration components, `+page.svelte`, `RegistrationsPanel.svelte`), the screenshot paths, the surface brief path (direction contract + fidelity inventory live there), the approved comp paths, and `.claude/skills/impeccable/reference/craft-floor.md`. Apply material fixes in one batch, recapture, send back for a verdict; report the verdict table as the reviewer wrote it.

- [ ] **Step 4: Push + PR**

```bash
git push -u origin feat/registration
gh pr create --title "feat: registration flow for the locked Dec 4-7 retreat" --body "..."
```

PR body: spec + comps, migration 0006 note, `REG_DEADLINE`, the deploy checklist, and the standard footer. Do not request a full CodeRabbit review (incremental runs automatically).

- [ ] **Step 5: Deciduous**

```bash
deciduous add action "Implemented registration flow (PR)" -c 90 --commit HEAD
deciduous link 105 <action_id> -r "Implementation"
deciduous add outcome "Registration shipped; finish review disposition: <verdict>" -c 85
deciduous link <action_id> <outcome_id> -r "Result"
```

## Deploy checklist (controller, around merge)

1. Apply `migrations/0006_registrations.sql` to prod D1 via the Cloudflare MCP `d1_database_query` **before merge** (additive, safe) + insert the `d1_migrations` ledger row `0006_registrations.sql`.
2. Merge → Workers Builds deploys main; `REG_DEADLINE` ships in `wrangler.jsonc`.
3. Bryan: sign in, confirm the announcement renders, register once for real (hits the confirmation email path — comail must be delivering; chainlink #93).
4. Compose the announcement broadcast in the organizer Email panel (ramping tier: 50/day).
