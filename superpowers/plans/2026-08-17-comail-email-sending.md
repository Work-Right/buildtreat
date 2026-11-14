# Email Sending via comail.at — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire buildtreat to send email through comail.at's HTTP Send API — a transport module plus an organizer broadcast feature with audit trail and retry.

**Architecture:** A dependency-free `fetch` client (`src/lib/server/email.ts`) calls `POST https://smtp.atmos.email/v1/send`. Broadcasts snapshot recipients into two new D1 tables (migration `0005_broadcasts.sql`); a pure orchestration loop (`runBroadcast`) walks pending recipients, records per-recipient outcomes, and stops on retryable errors so a later retry resumes. The `/organizer` page gains an Email section using the page's existing form-action pattern.

**Tech Stack:** SvelteKit 2 (Svelte 5 runes) on Cloudflare Workers, D1, vitest (added by this plan), pnpm.

**Spec:** `docs/superpowers/specs/2026-08-17-comail-email-sending-design.md`

## Global Constraints

- pnpm only; any `package.json` change must commit `pnpm-lock.yaml` in the same commit (Workers Builds runs a frozen-lockfile install).
- All D1 queries parameterized (`?1` bindings) — no string interpolation into SQL.
- Conventional commits; stage files explicitly by name (never `git add -A` / `git add .`).
- Branch: `feat/comail-email` (already created; spec + this plan are committed on it). Push to the branch, never main.
- Send endpoint: `POST https://smtp.atmos.email/v1/send` with headers `X-Atmos-DID: <did>`, `Authorization: Bearer <key>`, `Content-Type: application/json`.
- Config names (exact): vars `EMAIL_FROM` (= `hello@buildersretre.at`), `COMAIL_DID` (= `did:plc:h3wpawnrlptr4534chevddo6`); secret `COMAIL_API_KEY`.
- Tabs for indentation (match existing source files).
- Verification commands: `pnpm test` (vitest) and `pnpm check` (svelte-check) must pass at the end of every task.

---

### Task 1: Test runner + config plumbing

No behavior yet — install vitest, declare the new env vars everywhere they need declaring.

**Files:**
- Modify: `package.json` (devDependency + script)
- Modify: `pnpm-lock.yaml` (via pnpm)
- Modify: `src/app.d.ts:16-24` (Platform env)
- Modify: `wrangler.jsonc` (vars + secrets comment)

**Interfaces:**
- Produces: `pnpm test` command (vitest, no config file needed); `App.Platform['env']` includes `EMAIL_FROM?: string; COMAIL_DID?: string; COMAIL_API_KEY?: string`.

- [ ] **Step 1: Install vitest and add the test script**

```bash
cd /Users/bryan.guffey/Code/buildtreat
pnpm add -D vitest
```

Then in `package.json` scripts, after `"preview"`:

```json
		"test": "vitest run",
```

- [ ] **Step 2: Declare env vars in `src/app.d.ts`**

Inside `interface Platform`'s `env` object, after `ORGANIZER_DIDS?: string;`:

```ts
			EMAIL_FROM?: string;
			COMAIL_DID?: string;
			COMAIL_API_KEY?: string;
```

- [ ] **Step 3: Add vars to `wrangler.jsonc`**

In the `"vars"` block, after the `ORGANIZER_DIDS` entry:

```jsonc
		// Email sending via comail.at (HTTP Send API). The DID is the comail
		// account identity (Bryan's — already public in ORGANIZER_DIDS).
		"EMAIL_FROM": "hello@buildersretre.at",
		"COMAIL_DID": "did:plc:h3wpawnrlptr4534chevddo6"
```

And update the trailing secrets comment to:

```jsonc
	// Secrets (wrangler secret put): COOKIE_SECRET, CLIENT_ASSERTION_KEY, COMAIL_API_KEY
```

- [ ] **Step 4: Verify**

Run: `pnpm test`
Expected: vitest runs, reports "No test files found" — exit code 1 is fine at this step; note it and move on (Task 2 adds the first tests).

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src/app.d.ts wrangler.jsonc
git commit -m "chore: add vitest + comail env plumbing"
```

---

### Task 2: Transport module `src/lib/server/email.ts`

**Files:**
- Create: `src/lib/server/email.ts`
- Test: `src/lib/server/email.test.ts`

**Interfaces:**
- Consumes: nothing project-internal (plain fetch).
- Produces (exact — later tasks import these):

```ts
export type EmailCategory = 'login-link' | 'password-reset' | 'mfa-otp' | 'verification' | 'bulk' | 'broadcast';
export interface EmailMessage { to: string; subject: string; text: string; html?: string; replyTo?: string; category?: EmailCategory; }
export type SendResult =
	| { ok: true; messageId: string }
	| { ok: false; code: string; retryable: boolean; detail?: string };
export interface EmailEnv { EMAIL_FROM?: string; COMAIL_DID?: string; COMAIL_API_KEY?: string; }
export function emailConfigured(env: EmailEnv): boolean;
export async function sendEmail(env: EmailEnv, msg: EmailMessage, fetchFn?: typeof fetch): Promise<SendResult>;
```

- [ ] **Step 1: Write the failing tests**

Create `src/lib/server/email.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { emailConfigured, sendEmail, type EmailEnv } from './email';

const ENV: EmailEnv = {
	EMAIL_FROM: 'hello@buildersretre.at',
	COMAIL_DID: 'did:plc:test',
	COMAIL_API_KEY: 'atmos_secret'
};

const MSG = { to: 'user@example.com', subject: 'Hi', text: 'Hello there' };

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('emailConfigured', () => {
	it('is true only when all three values are present', () => {
		expect(emailConfigured(ENV)).toBe(true);
		expect(emailConfigured({ ...ENV, COMAIL_API_KEY: undefined })).toBe(false);
		expect(emailConfigured({})).toBe(false);
	});
});

describe('sendEmail', () => {
	it('returns NOT_CONFIGURED without calling fetch when the key is missing', async () => {
		const fetchFn = vi.fn();
		const res = await sendEmail({ ...ENV, COMAIL_API_KEY: undefined }, MSG, fetchFn as unknown as typeof fetch);
		expect(res).toEqual({ ok: false, code: 'NOT_CONFIGURED', retryable: false });
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('posts the message with DID + bearer headers and returns the messageId as a string', async () => {
		const fetchFn = vi.fn(async () => jsonResponse(200, { accepted: [{ recipient: MSG.to, messageId: 448 }], rejected: [] }));
		const res = await sendEmail(ENV, { ...MSG, category: 'broadcast' }, fetchFn as unknown as typeof fetch);
		expect(res).toEqual({ ok: true, messageId: '448' });
		const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('https://smtp.atmos.email/v1/send');
		expect(init.method).toBe('POST');
		const headers = init.headers as Record<string, string>;
		expect(headers['X-Atmos-DID']).toBe('did:plc:test');
		expect(headers['Authorization']).toBe('Bearer atmos_secret');
		const body = JSON.parse(String(init.body));
		expect(body).toEqual({
			from: 'hello@buildersretre.at',
			to: 'user@example.com',
			subject: 'Hi',
			text: 'Hello there',
			category: 'broadcast'
		});
	});

	it('maps a comail error body to a non-retryable failure for auth codes', async () => {
		const fetchFn = vi.fn(async () => jsonResponse(403, { error: 'domain not enrolled', code: 'DOMAIN_MISMATCH' }));
		const res = await sendEmail(ENV, MSG, fetchFn as unknown as typeof fetch);
		expect(res).toEqual({ ok: false, code: 'DOMAIN_MISMATCH', retryable: false, detail: 'domain not enrolled' });
	});

	it('flags RATE_LIMITED and 5xx codes as retryable', async () => {
		for (const [status, code] of [
			[429, 'RATE_LIMITED'],
			[503, 'QUEUE_FULL'],
			[503, 'TEMPORARILY_UNAVAILABLE'],
			[500, 'INTERNAL_ERROR']
		] as const) {
			const fetchFn = vi.fn(async () => jsonResponse(status, { error: 'x', code }));
			const res = await sendEmail(ENV, MSG, fetchFn as unknown as typeof fetch);
			expect(res).toMatchObject({ ok: false, code, retryable: true });
		}
	});

	it('treats a network throw as retryable NETWORK', async () => {
		const fetchFn = vi.fn(async () => {
			throw new TypeError('fetch failed');
		});
		const res = await sendEmail(ENV, MSG, fetchFn as unknown as typeof fetch);
		expect(res).toMatchObject({ ok: false, code: 'NETWORK', retryable: true });
	});

	it('treats a non-JSON body as retryable BAD_RESPONSE', async () => {
		const fetchFn = vi.fn(async () => new Response('<html>gateway error</html>', { status: 502 }));
		const res = await sendEmail(ENV, MSG, fetchFn as unknown as typeof fetch);
		expect(res).toMatchObject({ ok: false, code: 'BAD_RESPONSE', retryable: true });
	});

	it('treats a 200 with no accepted entry as retryable BAD_RESPONSE', async () => {
		const fetchFn = vi.fn(async () => jsonResponse(200, { accepted: [], rejected: [] }));
		const res = await sendEmail(ENV, MSG, fetchFn as unknown as typeof fetch);
		expect(res).toMatchObject({ ok: false, code: 'BAD_RESPONSE', retryable: true });
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — cannot resolve `./email`.

- [ ] **Step 3: Implement `src/lib/server/email.ts`**

```ts
/**
 * Email transport via comail.at's HTTP Send API — cooperative email
 * infrastructure for the atproto network. One recipient per call; callers
 * that fan out (broadcasts) loop and record each outcome.
 * Spec: docs/superpowers/specs/2026-08-17-comail-email-sending-design.md.
 */

export type EmailCategory = 'login-link' | 'password-reset' | 'mfa-otp' | 'verification' | 'bulk' | 'broadcast';

export interface EmailMessage {
	to: string;
	subject: string;
	text: string;
	html?: string;
	replyTo?: string;
	category?: EmailCategory;
}

export type SendResult =
	| { ok: true; messageId: string }
	| { ok: false; code: string; retryable: boolean; detail?: string };

/** The slice of Platform env the transport needs (callers pass platform.env). */
export interface EmailEnv {
	EMAIL_FROM?: string;
	COMAIL_DID?: string;
	COMAIL_API_KEY?: string;
}

const SEND_URL = 'https://smtp.atmos.email/v1/send';

// comail codes that mean "try again later"; anything else 4xx is a hard no.
const RETRYABLE_CODES = new Set(['RATE_LIMITED', 'QUEUE_FULL', 'TEMPORARILY_UNAVAILABLE', 'INTERNAL_ERROR']);

export function emailConfigured(env: EmailEnv): boolean {
	return Boolean(env.EMAIL_FROM && env.COMAIL_DID && env.COMAIL_API_KEY);
}

export async function sendEmail(env: EmailEnv, msg: EmailMessage, fetchFn: typeof fetch = fetch): Promise<SendResult> {
	if (!emailConfigured(env)) return { ok: false, code: 'NOT_CONFIGURED', retryable: false };

	let res: Response;
	try {
		res = await fetchFn(SEND_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Atmos-DID': env.COMAIL_DID!,
				Authorization: `Bearer ${env.COMAIL_API_KEY}`
			},
			body: JSON.stringify({
				from: env.EMAIL_FROM,
				to: msg.to,
				subject: msg.subject,
				text: msg.text,
				...(msg.html ? { html: msg.html } : {}),
				...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
				...(msg.category ? { category: msg.category } : {})
			})
		});
	} catch (e) {
		return { ok: false, code: 'NETWORK', retryable: true, detail: String(e) };
	}

	let body: unknown;
	try {
		body = await res.json();
	} catch {
		return { ok: false, code: 'BAD_RESPONSE', retryable: true, detail: `HTTP ${res.status} with non-JSON body` };
	}

	if (res.ok) {
		const accepted = (body as { accepted?: Array<{ messageId?: number | string }> }).accepted?.[0];
		if (accepted?.messageId != null) return { ok: true, messageId: String(accepted.messageId) };
		return { ok: false, code: 'BAD_RESPONSE', retryable: true, detail: '200 without an accepted recipient' };
	}

	const err = body as { error?: string; code?: string };
	const code = typeof err.code === 'string' ? err.code : 'BAD_RESPONSE';
	const retryable = RETRYABLE_CODES.has(code) || res.status === 429 || res.status >= 500;
	return { ok: false, code, retryable, ...(err.error ? { detail: err.error } : {}) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS (8 tests). Also run `pnpm check` — 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/email.ts src/lib/server/email.test.ts
git commit -m "feat: comail.at email transport module"
```

---

### Task 3: Broadcast schema + data layer

**Files:**
- Create: `migrations/0005_broadcasts.sql`
- Create: `src/lib/server/broadcasts.ts`
- Test: `src/lib/server/broadcasts.test.ts` (pure helpers only — D1 functions are thin parameterized SQL, exercised in production shape via svelte-check typing)

**Interfaces:**
- Consumes: `SendResult` from `./email`.
- Produces (exact):

```ts
export interface RecipientInput { did: string; email: string; }
export interface BroadcastRecipient { did: string; email: string; status: 'pending' | 'sent' | 'failed'; errorCode: string | null; messageId: string | null; }
export interface BroadcastView { id: number; subject: string; body: string; sentBy: string; createdAt: string; recipients: BroadcastRecipient[]; }
export function dedupeRecipients(rows: RecipientInput[]): RecipientInput[];
export async function createBroadcast(db: D1Database, input: { subject: string; body: string; sentBy: string; recipients: RecipientInput[] }): Promise<number>;
export async function listBroadcasts(db: D1Database): Promise<BroadcastView[]>;
export async function unsentRecipients(db: D1Database, broadcastId: number): Promise<BroadcastRecipient[]>;
export async function markRecipient(db: D1Database, broadcastId: number, did: string, result: SendResult): Promise<void>;
export async function getBroadcast(db: D1Database, broadcastId: number): Promise<{ id: number; subject: string; body: string } | null>;
```

- [ ] **Step 1: Write the migration**

Create `migrations/0005_broadcasts.sql`:

```sql
-- the Atmospheric Builders' Retreat — organizer email broadcasts

-- One row per composed announcement. Recipients are snapshotted at send
-- time (deduped by lowercased email, sourced from survey responses); the
-- recipient rows double as audit trail, double-send guard, and retry
-- worklist. Spec: docs/superpowers/specs/2026-08-17-comail-email-sending-design.md.
CREATE TABLE IF NOT EXISTS broadcasts (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	subject TEXT NOT NULL,
	body TEXT NOT NULL,
	sent_by TEXT NOT NULL,
	created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS broadcast_recipients (
	broadcast_id INTEGER NOT NULL REFERENCES broadcasts(id),
	did TEXT NOT NULL,
	email TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'pending',
	error_code TEXT,
	message_id TEXT,
	updated_at TEXT NOT NULL,
	PRIMARY KEY (broadcast_id, did)
);
```

- [ ] **Step 2: Write the failing test for `dedupeRecipients`**

Create `src/lib/server/broadcasts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { dedupeRecipients } from './broadcasts';

describe('dedupeRecipients', () => {
	it('drops later rows whose email matches case-insensitively, keeping the first', () => {
		const out = dedupeRecipients([
			{ did: 'did:plc:a', email: 'One@Example.com' },
			{ did: 'did:plc:b', email: 'one@example.com' },
			{ did: 'did:plc:c', email: 'two@example.com' }
		]);
		expect(out).toEqual([
			{ did: 'did:plc:a', email: 'One@Example.com' },
			{ did: 'did:plc:c', email: 'two@example.com' }
		]);
	});

	it('skips rows with empty emails', () => {
		expect(dedupeRecipients([{ did: 'did:plc:a', email: '  ' }])).toEqual([]);
	});
});
```

- [ ] **Step 3: Run tests to verify the new file fails**

Run: `pnpm test`
Expected: FAIL — cannot resolve `./broadcasts` (email tests still pass).

- [ ] **Step 4: Implement `src/lib/server/broadcasts.ts`**

```ts
import type { D1Database } from '@cloudflare/workers-types';
import type { SendResult } from './email';

/**
 * D1 access + orchestration for organizer email broadcasts. Recipients are
 * snapshotted per broadcast; each row's status is the source of truth for
 * what has actually been handed to comail. All queries are parameterized.
 * Schema: migrations/0005_broadcasts.sql.
 */

export interface RecipientInput {
	did: string;
	email: string;
}

export interface BroadcastRecipient {
	did: string;
	email: string;
	status: 'pending' | 'sent' | 'failed';
	errorCode: string | null;
	messageId: string | null;
}

export interface BroadcastView {
	id: number;
	subject: string;
	body: string;
	sentBy: string;
	createdAt: string;
	recipients: BroadcastRecipient[];
}

/** First occurrence wins; comparison is on the lowercased, trimmed email. */
export function dedupeRecipients(rows: RecipientInput[]): RecipientInput[] {
	const seen = new Set<string>();
	const out: RecipientInput[] = [];
	for (const row of rows) {
		const key = row.email.trim().toLowerCase();
		if (!key || seen.has(key)) continue;
		seen.add(key);
		out.push(row);
	}
	return out;
}

/** Insert the broadcast plus one pending row per recipient; returns its id. */
export async function createBroadcast(
	db: D1Database,
	input: { subject: string; body: string; sentBy: string; recipients: RecipientInput[] }
): Promise<number> {
	const now = new Date().toISOString();
	const row = await db
		.prepare(`INSERT INTO broadcasts (subject, body, sent_by, created_at) VALUES (?1, ?2, ?3, ?4) RETURNING id`)
		.bind(input.subject, input.body, input.sentBy, now)
		.first<{ id: number }>();
	if (!row) throw new Error('broadcast insert returned no id');
	if (input.recipients.length) {
		await db.batch(
			input.recipients.map((r) =>
				db
					.prepare(
						`INSERT INTO broadcast_recipients (broadcast_id, did, email, status, updated_at)
						 VALUES (?1, ?2, ?3, 'pending', ?4)`
					)
					.bind(row.id, r.did, r.email, now)
			)
		);
	}
	return row.id;
}

/** All broadcasts, newest first, with their full recipient rows. */
export async function listBroadcasts(db: D1Database): Promise<BroadcastView[]> {
	const [broadcasts, recipients] = await db.batch([
		db.prepare(`SELECT id, subject, body, sent_by, created_at FROM broadcasts ORDER BY id DESC`),
		db.prepare(
			`SELECT broadcast_id, did, email, status, error_code, message_id FROM broadcast_recipients ORDER BY email`
		)
	]);
	const byId = new Map<number, BroadcastView>();
	for (const b of broadcasts.results as Array<{ id: number; subject: string; body: string; sent_by: string; created_at: string }>) {
		byId.set(b.id, { id: b.id, subject: b.subject, body: b.body, sentBy: b.sent_by, createdAt: b.created_at, recipients: [] });
	}
	for (const r of recipients.results as Array<{
		broadcast_id: number;
		did: string;
		email: string;
		status: 'pending' | 'sent' | 'failed';
		error_code: string | null;
		message_id: string | null;
	}>) {
		byId.get(r.broadcast_id)?.recipients.push({
			did: r.did,
			email: r.email,
			status: r.status,
			errorCode: r.error_code,
			messageId: r.message_id
		});
	}
	return [...byId.values()];
}

/** The retry worklist: everything not yet successfully handed to comail. */
export async function unsentRecipients(db: D1Database, broadcastId: number): Promise<BroadcastRecipient[]> {
	const rows = await db
		.prepare(
			`SELECT did, email, status, error_code, message_id FROM broadcast_recipients
			 WHERE broadcast_id = ?1 AND status != 'sent' ORDER BY email`
		)
		.bind(broadcastId)
		.all<{ did: string; email: string; status: 'pending' | 'failed'; error_code: string | null; message_id: string | null }>();
	return rows.results.map((r) => ({
		did: r.did,
		email: r.email,
		status: r.status,
		errorCode: r.error_code,
		messageId: r.message_id
	}));
}

/**
 * Persist one send outcome. Success → 'sent'. Non-retryable failure →
 * 'failed'. Retryable failure keeps status 'pending' (the loop stops and a
 * later retry picks the row up again) but records the code for the UI.
 */
export async function markRecipient(db: D1Database, broadcastId: number, did: string, result: SendResult): Promise<void> {
	const now = new Date().toISOString();
	if (result.ok) {
		await db
			.prepare(
				`UPDATE broadcast_recipients SET status = 'sent', message_id = ?1, error_code = NULL, updated_at = ?2
				 WHERE broadcast_id = ?3 AND did = ?4`
			)
			.bind(result.messageId, now, broadcastId, did)
			.run();
		return;
	}
	const status = result.retryable ? 'pending' : 'failed';
	await db
		.prepare(
			`UPDATE broadcast_recipients SET status = ?1, error_code = ?2, updated_at = ?3
			 WHERE broadcast_id = ?4 AND did = ?5`
		)
		.bind(status, result.code, now, broadcastId, did)
		.run();
}

/** Subject/body for a retry run. */
export async function getBroadcast(db: D1Database, broadcastId: number): Promise<{ id: number; subject: string; body: string } | null> {
	const row = await db
		.prepare(`SELECT id, subject, body FROM broadcasts WHERE id = ?1`)
		.bind(broadcastId)
		.first<{ id: number; subject: string; body: string }>();
	return row ?? null;
}
```

- [ ] **Step 5: Run tests + check**

Run: `pnpm test` — Expected: PASS (10 tests).
Run: `pnpm check` — Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add migrations/0005_broadcasts.sql src/lib/server/broadcasts.ts src/lib/server/broadcasts.test.ts
git commit -m "feat: broadcast schema and data layer"
```

---

### Task 4: `runBroadcast` orchestration loop

Pure function — injected send/mark callbacks, no D1 or fetch — so the stop/resume semantics are fully unit-tested.

**Files:**
- Modify: `src/lib/server/broadcasts.ts` (append)
- Test: `src/lib/server/broadcasts.test.ts` (append)

**Interfaces:**
- Consumes: `BroadcastRecipient`, `SendResult`.
- Produces (exact):

```ts
export interface BroadcastRunResult { sent: number; failed: number; stopped: string | null; }
export async function runBroadcast(
	recipients: BroadcastRecipient[],
	send: (email: string) => Promise<SendResult>,
	mark: (did: string, result: SendResult) => Promise<void>
): Promise<BroadcastRunResult>;
```

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/server/broadcasts.test.ts` (add `runBroadcast` and the types to the existing import from `./broadcasts`, and `vi` to the vitest import):

```ts
import type { BroadcastRecipient } from './broadcasts';
import type { SendResult } from './email';

function recipient(did: string, email: string): BroadcastRecipient {
	return { did, email, status: 'pending', errorCode: null, messageId: null };
}

const OK: SendResult = { ok: true, messageId: '1' };
const HARD_FAIL: SendResult = { ok: false, code: 'INVALID_RECIPIENT_DOMAIN', retryable: false };
const SOFT_FAIL: SendResult = { ok: false, code: 'RATE_LIMITED', retryable: true };

describe('runBroadcast', () => {
	it('sends to every recipient and marks each outcome', async () => {
		const marked: Array<[string, SendResult]> = [];
		const result = await runBroadcast(
			[recipient('did:a', 'a@x.com'), recipient('did:b', 'b@x.com')],
			async () => OK,
			async (did, r) => {
				marked.push([did, r]);
			}
		);
		expect(result).toEqual({ sent: 2, failed: 0, stopped: null });
		expect(marked).toEqual([
			['did:a', OK],
			['did:b', OK]
		]);
	});

	it('marks a non-retryable failure and continues to later recipients', async () => {
		const send = vi.fn(async (email: string) => (email === 'a@x.com' ? HARD_FAIL : OK));
		const result = await runBroadcast(
			[recipient('did:a', 'a@x.com'), recipient('did:b', 'b@x.com')],
			send,
			async () => {}
		);
		expect(result).toEqual({ sent: 1, failed: 1, stopped: null });
		expect(send).toHaveBeenCalledTimes(2);
	});

	it('stops at the first retryable failure, leaving the rest untouched', async () => {
		const send = vi.fn(async (email: string) => (email === 'b@x.com' ? SOFT_FAIL : OK));
		const marked: string[] = [];
		const result = await runBroadcast(
			[recipient('did:a', 'a@x.com'), recipient('did:b', 'b@x.com'), recipient('did:c', 'c@x.com')],
			send,
			async (did) => {
				marked.push(did);
			}
		);
		expect(result).toEqual({ sent: 1, failed: 0, stopped: 'RATE_LIMITED' });
		expect(send).toHaveBeenCalledTimes(2); // never reaches did:c
		expect(marked).toEqual(['did:a', 'did:b']); // the soft failure is still recorded
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — `runBroadcast` is not exported.

- [ ] **Step 3: Implement — append to `src/lib/server/broadcasts.ts`**

```ts
export interface BroadcastRunResult {
	sent: number;
	failed: number;
	/** Error code that halted the run, or null if it walked the whole list. */
	stopped: string | null;
}

/**
 * Walk the worklist sequentially. Hard failures are recorded and skipped;
 * a retryable failure (rate limit, relay hiccup) is recorded, then the run
 * stops — during comail's warming period a 429 means every later send
 * would also fail, so the retry button resumes where this left off.
 */
export async function runBroadcast(
	recipients: BroadcastRecipient[],
	send: (email: string) => Promise<SendResult>,
	mark: (did: string, result: SendResult) => Promise<void>
): Promise<BroadcastRunResult> {
	let sent = 0;
	let failed = 0;
	for (const r of recipients) {
		const result = await send(r.email);
		await mark(r.did, result);
		if (result.ok) {
			sent++;
		} else if (result.retryable) {
			return { sent, failed, stopped: result.code };
		} else {
			failed++;
		}
	}
	return { sent, failed, stopped: null };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test` — Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/broadcasts.ts src/lib/server/broadcasts.test.ts
git commit -m "feat: broadcast run loop with stop-on-retryable resume semantics"
```

---

### Task 5: Organizer server actions + page data

**Files:**
- Modify: `src/routes/organizer/+page.server.ts`

**Interfaces:**
- Consumes: `emailConfigured`, `sendEmail` from `$lib/server/email`; `dedupeRecipients`, `createBroadcast`, `listBroadcasts`, `unsentRecipients`, `markRecipient`, `getBroadcast`, `runBroadcast`, `BroadcastView` from `$lib/server/broadcasts`; existing `getAllResponses`, `requireOrganizer`, `EMAIL_RE` (exported from `$lib/server/db`).
- Produces: `OrganizerPageData` gains `emailConfigured: boolean; broadcasts: BroadcastView[]`. Actions `?/emailTest`, `?/emailBroadcast`, `?/emailRetry`. Action success shape: `{ message: string }` (matches existing actions).

- [ ] **Step 1: Extend imports, interface, EMPTY, and load**

Add imports at the top of `src/routes/organizer/+page.server.ts`:

```ts
import { emailConfigured, sendEmail } from '$lib/server/email';
import {
	createBroadcast,
	dedupeRecipients,
	getBroadcast,
	listBroadcasts,
	markRecipient,
	runBroadcast,
	unsentRecipients,
	type BroadcastView
} from '$lib/server/broadcasts';
import { EMAIL_RE } from '$lib/server/db';
```

In `interface OrganizerPageData`, after `anchorsUnavailable: boolean;`:

```ts
	/** False until COMAIL_API_KEY + vars are set — renders setup hints. */
	emailConfigured: boolean;
	broadcasts: BroadcastView[];
```

In `const EMPTY`, after `anchorsUnavailable: false`:

```ts
	emailConfigured: false,
	broadcasts: []
```

In `load`, add `listBroadcasts(db)` to the existing `Promise.all` (after the `listAnchors` entry, with the same `.catch`-free style — it's a plain read):

```ts
		listBroadcasts(db)
```

destructure it as `broadcasts`, and include in the return:

```ts
		emailConfigured: emailConfigured(platform?.env ?? {}),
		broadcasts
```

In `previewData()`'s return, add:

```ts
		emailConfigured: true,
		broadcasts: [
			{
				id: 1,
				subject: 'October dates are locked',
				body: 'Hi builders — we picked the window. Details on the site.',
				sentBy: 'did:plc:h3wpawnrlptr4534chevddo6',
				createdAt: '2026-08-14T20:11:00Z',
				recipients: [
					{ did: 'did:plc:preview0', email: 'maren0@example.com', status: 'sent', errorCode: null, messageId: '101' },
					{ did: 'did:plc:preview1', email: 'chris1@example.com', status: 'sent', errorCode: null, messageId: '102' },
					{ did: 'did:plc:preview2', email: 'koko2@example.com', status: 'failed', errorCode: 'INVALID_RECIPIENT_DOMAIN', messageId: null },
					{ did: 'did:plc:preview3', email: 'evan3@example.com', status: 'pending', errorCode: 'RATE_LIMITED', messageId: null }
				]
			}
		]
```

(and update the `previewData` return-type `Omit<...>` if svelte-check complains — the fields are part of `OrganizerPageData`, so no change should be needed).

Also update the dev-preview early-return in `load` — it spreads `previewData()`, so it picks the new fields up automatically.

- [ ] **Step 2: Add the three actions**

Append inside `export const actions: Actions = { ... }` after `clearAnchors`:

```ts
	emailTest: async ({ request, locals, platform }) => {
		requireOrganizer(locals, platform);
		const form = await request.formData();
		const to = String(form.get('to') ?? '').trim();
		const subject = String(form.get('subject') ?? '').trim();
		const body = String(form.get('body') ?? '').trim();
		if (!EMAIL_RE.test(to)) return fail(400, { message: 'Enter a valid test address' });
		if (!subject || !body) return fail(400, { message: 'Subject and body are both required' });
		const result = await sendEmail(platform?.env ?? {}, { to, subject, text: body });
		if (!result.ok) {
			return fail(502, { message: `Test send failed (${result.code})${result.detail ? ` — ${result.detail}` : ''}` });
		}
		return { message: `Test sent to ${to} (message ${result.messageId})` };
	},

	emailBroadcast: async ({ request, locals, platform }) => {
		requireOrganizer(locals, platform);
		const db = platform?.env?.DB;
		if (!db) return fail(503, { message: 'Storage is not available right now' });
		const form = await request.formData();
		const subject = String(form.get('subject') ?? '').trim();
		const body = String(form.get('body') ?? '').trim();
		if (!subject || !body) return fail(400, { message: 'Subject and body are both required' });
		if (!emailConfigured(platform?.env ?? {})) return fail(503, { message: 'Email is not configured yet' });

		const responses = await getAllResponses(db);
		const recipients = dedupeRecipients(responses.map((r) => ({ did: r.did, email: r.email })));
		if (!recipients.length) return fail(400, { message: 'No respondents with emails to send to' });

		const id = await createBroadcast(db, { subject, body, sentBy: locals.did!, recipients });
		const worklist = await unsentRecipients(db, id);
		const run = await runBroadcast(
			worklist,
			(to) => sendEmail(platform!.env, { to, subject, text: body, category: 'broadcast' }),
			(did, result) => markRecipient(db, id, did, result)
		);
		return { message: broadcastMessage(run) };
	},

	emailRetry: async ({ request, locals, platform }) => {
		requireOrganizer(locals, platform);
		const db = platform?.env?.DB;
		if (!db) return fail(503, { message: 'Storage is not available right now' });
		const id = Number((await request.formData()).get('id'));
		if (!Number.isInteger(id)) return fail(400, { message: 'Missing broadcast' });
		const broadcast = await getBroadcast(db, id);
		if (!broadcast) return fail(400, { message: 'Unknown broadcast' });
		if (!emailConfigured(platform?.env ?? {})) return fail(503, { message: 'Email is not configured yet' });

		const worklist = await unsentRecipients(db, id);
		if (!worklist.length) return fail(400, { message: 'Nothing left to retry for that broadcast' });
		const run = await runBroadcast(
			worklist,
			(to) => sendEmail(platform!.env, { to, subject: broadcast.subject, text: broadcast.body, category: 'broadcast' }),
			(did, result) => markRecipient(db, id, did, result)
		);
		return { message: broadcastMessage(run) };
	}
```

And add this helper near `requireOrganizer`:

```ts
function broadcastMessage(run: { sent: number; failed: number; stopped: string | null }): string {
	const parts = [`Sent ${run.sent}`];
	if (run.failed) parts.push(`${run.failed} failed`);
	if (run.stopped) parts.push(`paused on ${run.stopped} — use Retry to resume`);
	return parts.join(' · ');
}
```

- [ ] **Step 3: Verify**

Run: `pnpm check` — Expected: 0 errors.
Run: `pnpm test` — Expected: still 13 passing.

- [ ] **Step 4: Commit**

```bash
git add src/routes/organizer/+page.server.ts
git commit -m "feat: organizer email actions — test send, broadcast, retry"
```

---

### Task 6: Organizer Email panel UI

**Files:**
- Create: `src/lib/components/organizer/EmailPanel.svelte`
- Modify: `src/routes/organizer/+page.svelte` (import + render in the main column after the waitlist section, around line 567's `</section>`)

**Interfaces:**
- Consumes: `BroadcastView` from `$lib/server/broadcasts` (type-only import — precedent: `ResponsesTable.svelte` imports `OrganizerResponse` the same way); actions `?/emailTest`, `?/emailBroadcast`, `?/emailRetry`. Action `message` results surface through the page's existing form-message handling, not through this component.
- Produces: `<EmailPanel configured={data.emailConfigured} broadcasts={data.broadcasts} respondentCount={...} />`.

Match the page's existing visual language: `<section aria-labelledby=...>` with an `h2`, forms with `method="POST" use:enhance`, buttons/inputs styled like the allowlist `add-form`. Reuse existing global classes where they exist in `+page.svelte`'s `<style>`; add component-scoped styles for the rest (check how `ResponsesTable.svelte` handles its own styles and follow that).

- [ ] **Step 1: Create `src/lib/components/organizer/EmailPanel.svelte`**

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import type { BroadcastView } from '$lib/server/broadcasts';

	let {
		configured,
		broadcasts,
		respondentCount
	}: {
		configured: boolean;
		broadcasts: BroadcastView[];
		respondentCount: number;
	} = $props();

	let subject = $state('');
	let body = $state('');
	// Two-step arm/confirm instead of a browser confirm() dialog, so the
	// recipient count is visible at the moment of commitment.
	let armed = $state(false);
	let sending = $state(false);

	const draftReady = $derived(subject.trim().length > 0 && body.trim().length > 0);

	function counts(b: BroadcastView): { sent: number; failed: number; pending: number } {
		let sent = 0,
			failed = 0,
			pending = 0;
		for (const r of b.recipients) {
			if (r.status === 'sent') sent++;
			else if (r.status === 'failed') failed++;
			else pending++;
		}
		return { sent, failed, pending };
	}
</script>

<section aria-labelledby="email-head">
	<h2 id="email-head">Email</h2>

	{#if !configured}
		<p class="email-unconfigured">
			Email isn’t set up yet. Enroll <code>buildersretre.at</code> in comail, then set the
			<code>COMAIL_API_KEY</code> secret (vars <code>EMAIL_FROM</code> and <code>COMAIL_DID</code> ship in
			wrangler.jsonc). Until then, composing is disabled.
		</p>
	{:else}
		<form
			method="POST"
			class="compose"
			use:enhance={() => {
				sending = true;
				return async ({ update }) => {
					sending = false;
					armed = false;
					await update({ reset: false });
				};
			}}
		>
			<label>
				Subject
				<input name="subject" bind:value={subject} maxlength="200" autocomplete="off" />
			</label>
			<label>
				Body (plain text)
				<textarea name="body" bind:value={body} rows="8"></textarea>
			</label>

			<div class="send-row">
				<label class="test-to">
					Test address
					<input name="to" type="email" placeholder="you@example.com" autocomplete="off" />
				</label>
				<button formaction="?/emailTest" disabled={!draftReady || sending}>Send test</button>
			</div>

			<div class="send-row">
				{#if armed}
					<button formaction="?/emailBroadcast" class="danger" disabled={!draftReady || sending}>
						Really send to {respondentCount} {respondentCount === 1 ? 'person' : 'people'}
					</button>
					<button type="button" onclick={() => (armed = false)}>Cancel</button>
				{:else}
					<button type="button" disabled={!draftReady || sending} onclick={() => (armed = true)}>
						Send to {respondentCount} respondent{respondentCount === 1 ? '' : 's'}…
					</button>
				{/if}
			</div>
		</form>
	{/if}

	{#if broadcasts.length}
		<h3>Past broadcasts</h3>
		<ul class="history">
			{#each broadcasts as b (b.id)}
				{@const c = counts(b)}
				<li>
					<details>
						<summary>
							<strong>{b.subject}</strong>
							<span class="meta">
								{new Date(b.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ·
								{c.sent} sent{c.failed ? ` · ${c.failed} failed` : ''}{c.pending ? ` · ${c.pending} pending` : ''}
							</span>
						</summary>
						<p class="body-preview">{b.body}</p>
						<ul class="recipients">
							{#each b.recipients as r (r.did)}
								<li class={r.status}>
									{r.email} — {r.status}{r.errorCode ? ` (${r.errorCode})` : ''}
								</li>
							{/each}
						</ul>
						{#if configured && c.failed + c.pending > 0}
							<form method="POST" action="?/emailRetry" use:enhance>
								<input type="hidden" name="id" value={b.id} />
								<button>Retry {c.failed + c.pending} unsent</button>
							</form>
						{/if}
					</details>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.compose {
		display: grid;
		gap: 0.75rem;
		max-width: 40rem;
	}
	.compose label {
		display: grid;
		gap: 0.25rem;
	}
	.send-row {
		display: flex;
		gap: 0.5rem;
		align-items: end;
	}
	.email-unconfigured {
		opacity: 0.8;
	}
	.history {
		list-style: none;
		padding: 0;
		display: grid;
		gap: 0.5rem;
	}
	.history .meta {
		opacity: 0.7;
		margin-left: 0.5rem;
	}
	.recipients li.failed {
		color: var(--danger, #c0392b);
	}
	.recipients li.pending {
		opacity: 0.7;
	}
	.body-preview {
		white-space: pre-wrap;
	}
</style>
```

**Note to implementer:** before finalizing, open `+page.svelte`'s `<style>` block and the existing sections; align class names, spacing, button styles, and color variables with what's actually there (e.g. if buttons use a shared class, use it; if the page defines `--danger` differently, follow it). The markup above is the required structure; the styling must match the page's design language rather than introducing a new one.

- [ ] **Step 2: Wire it into `src/routes/organizer/+page.svelte`**

Add to the imports:

```ts
	import EmailPanel from '$lib/components/organizer/EmailPanel.svelte';
```

After the waitlist `</section>` (currently after line ~600, section `aria-labelledby="wait-head"`), render:

```svelte
			<EmailPanel
				configured={data.emailConfigured}
				broadcasts={data.broadcasts}
				respondentCount={new Set(data.responses.map((r) => r.email.trim().toLowerCase()).filter(Boolean)).size}
			/>
```

- [ ] **Step 3: Validate the component with the Svelte MCP autofixer**

Run the `mcp__svelte__svelte-autofixer` tool on `EmailPanel.svelte`'s source; apply fixes and re-run until it reports no issues.

- [ ] **Step 4: Verify**

Run: `pnpm check` — Expected: 0 errors.
Run: `pnpm test` — Expected: 13 passing.
Visual: `pnpm dev`, open `http://localhost:5173/organizer?preview` — the Email section renders with the preview broadcast (2 sent / 1 failed / 1 pending) and a Retry button. If `scripts/shot.mjs` exists, capture a screenshot for the PR.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/organizer/EmailPanel.svelte src/routes/organizer/+page.svelte
git commit -m "feat: organizer email panel — compose, test send, broadcast, history"
```

---

### Task 7: Ship it

- [ ] **Step 1: Full verification**

```bash
pnpm test && pnpm check && pnpm build
```

Expected: all pass, build completes.

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin feat/comail-email
gh pr create --title "feat: email sending via comail.at (transport + organizer broadcast)" --body "..."
```

PR body: summarize spec, note the migration, note that sending stays inert until `COMAIL_API_KEY` is set. End with the standard generated-with footer. CodeRabbit reviews incrementally on push — do not request a full review.

- [ ] **Step 3: Log outcome nodes in deciduous**

```bash
deciduous add action "Implemented comail transport + organizer broadcast" -c 90 --commit HEAD
deciduous link 96 <action_id> -r "Implementation of chosen option"
deciduous add outcome "Email sending shipped behind NOT_CONFIGURED gate" -c 85
deciduous link <action_id> <outcome_id> -r "Result"
```

## Deploy checklist (Bryan + post-merge, not part of task execution)

1. Bryan: enroll `buildersretre.at` at comail.at (atproto handle signup → domain DNS proof → DKIM/SPF/DMARC records), create an API key in the builder console.
2. Set the secret: `wrangler secret put COMAIL_API_KEY` (or via the Cloudflare dashboard — local wrangler lacks remote auth in this sandbox, so Bryan runs this).
3. Apply migration 0005 to the remote D1 via the Cloudflare MCP `d1_database_query` tool **and insert the matching row into the `d1_migrations` ledger** (established convention — wrangler `--remote` is unavailable here).
4. Merge → Workers Builds auto-deploys main.
5. Use the organizer test-send to verify the pipe; remember the ~14-day warming rate limits before any real broadcast.
