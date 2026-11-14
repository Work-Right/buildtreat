# Email sending via comail.at — design

**Date:** 2026-08-17
**Status:** Approved by Bryan (conversation, 2026-08-17)
**Scope:** Transport layer + organizer broadcast. No user-flow confirmation emails yet.

## Background

buildtreat (buildersretre.at) is a SvelteKit app on Cloudflare Workers with D1.
We collect emails in two tables: `responses.email` (survey) and
`waitlist.email`. We want to send email through
[comail.at](https://comail.at) — cooperative email infrastructure for the
atproto network. Bryan is enrolling `buildersretre.at` in comail; DNS
(DKIM/SPF/DMARC) setup happens on his side. New domains have a ~14-day
warming period with tighter rate limits.

comail exposes two sending paths; we use the **HTTP Send API**:

- `POST https://smtp.atmos.email/v1/send`
- Headers: `X-Atmos-DID: <did>` and `Authorization: Bearer <atmos_… key>`
- JSON body: `from`, `to` (string or array ≤ 50), `subject`, `text`
  (required unless `html`), `html?`, `replyTo?`, `headers?`, `category?`
- `category` values include `login-link`, `password-reset`, `mfa-otp`,
  `verification` (user-initiated; skip List-Unsubscribe and suppression) and
  `bulk`, `broadcast` (get List-Unsubscribe, respect suppression lists)
- Success: `200` with `{ accepted: [{recipient, messageId}], rejected: [] }`
- Errors: `{ error, code }` with codes such as `AUTH_FAILED`,
  `DOMAIN_MISMATCH`, `RATE_LIMITED` (429), `QUEUE_FULL` (503),
  `TEMPORARILY_UNAVAILABLE` (503), `INTERNAL_ERROR` (500)
- No idempotency mechanism; client manages retries on 429/503/500

## Approaches considered

1. **Direct HTTP client module — chosen.** Plain `fetch` from the Worker.
   Zero dependencies, testable, matches our scale (tens of recipients).
2. **Cloudflare Queues.** Automatic retries and batching, but new paid
   infrastructure for a tiny list; comail's relay already retries delivery
   after acceptance. Rejected as premature.
3. **SMTP over TCP sockets.** Fragile in Workers, pointless given the HTTP
   API. Rejected.

## Configuration

| Name | Kind | Value |
|------|------|-------|
| `EMAIL_FROM` | wrangler var | `hello@buildersretre.at` |
| `COMAIL_DID` | wrangler var | Bryan's DID (`did:plc:h3wpawnrlptr4534chevddo6`, already public in `ORGANIZER_DIDS`) |
| `COMAIL_API_KEY` | wrangler secret | comail API key (shown once in the builder console) |

When `COMAIL_API_KEY` is absent (local dev, or prod before enrollment
completes), the transport returns a `NOT_CONFIGURED` failure and the
organizer UI shows email as not yet set up. No silent no-ops.

## Transport — `src/lib/server/email.ts`

```ts
type EmailCategory = 'login-link' | 'password-reset' | 'mfa-otp'
  | 'verification' | 'bulk' | 'broadcast';

interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  category?: EmailCategory;
}

type SendResult =
  | { ok: true; messageId: string }
  | { ok: false; code: string; retryable: boolean; detail?: string };

function sendEmail(platform: App.Platform, msg: EmailMessage): Promise<SendResult>;
```

- Single-recipient by design; callers loop. Keeps per-recipient outcomes
  unambiguous (the API's batch response splits accepted/rejected anyway).
- Never throws for send failures — returns the discriminated result.
  `RATE_LIMITED`, `QUEUE_FULL`, `TEMPORARILY_UNAVAILABLE`, `INTERNAL_ERROR`,
  and network errors map to `retryable: true`; auth/validation codes to
  `retryable: false`. Non-JSON/unexpected responses map to a synthetic
  `BAD_RESPONSE` retryable failure.
- `messageId` is comail's int64; we store it as a string.

## Broadcast storage — migration `0005_broadcasts.sql`

```sql
CREATE TABLE broadcasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  sent_by TEXT NOT NULL,          -- organizer DID
  created_at TEXT NOT NULL
);

CREATE TABLE broadcast_recipients (
  broadcast_id INTEGER NOT NULL REFERENCES broadcasts(id),
  did TEXT NOT NULL,
  email TEXT NOT NULL,
  status TEXT NOT NULL,           -- 'pending' | 'sent' | 'failed'
  error_code TEXT,
  message_id TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (broadcast_id, did)
);
```

Recipients are snapshotted at send time (deduped by lowercased email,
sourced from survey responses). The row set doubles as the audit trail,
double-send guard, and retry worklist.

## Organizer UI — "Email" section on `/organizer`

Follows the page's existing form-action pattern and access policy
(signed-out → sign-in state; non-organizer → 404).

- **Compose**: subject + plain-text body. v1 is text-only; comail builds the
  multipart if we later add HTML.
- **Test send** (`?/emailTest` action): sends the current draft to a
  manually entered address, no category. For exercising the pipe during
  warming.
- **Send broadcast** (`?/emailBroadcast` action): confirm step shows the
  deduped recipient count. Creates the `broadcasts` row + `pending`
  recipient rows, then loops `sendEmail` with `category: 'broadcast'`,
  updating each row to `sent`/`failed` as it goes. On a retryable failure
  (e.g. 429 mid-warming) the loop stops; remaining rows stay `pending`.
- **Retry failed/pending** (`?/emailRetry` action): re-runs the loop over
  `failed` + `pending` rows for a broadcast.
- **History**: past broadcasts with per-recipient status summary
  (sent/failed/pending counts, expandable detail).

Worker CPU/time budget is fine for tens of sequential fetches; if the list
ever grows past a few hundred we revisit (that's the Queues trigger).

## Error handling

- Every broadcast send outcome is persisted; nothing is swallowed.
- Transport failures surface in the UI with the comail error code.
- `NOT_CONFIGURED` renders the whole Email section in a "not set up yet"
  state with the needed vars listed.

## Testing

Vitest units, mocked `fetch`:

- transport: success; each error class (auth, domain mismatch, rate limit,
  5xx, network throw, non-JSON body); missing-key `NOT_CONFIGURED`
- broadcast helpers: recipient dedup (case-insensitive email), resume
  logic picks exactly `failed` + `pending` rows, stop-on-retryable behavior

## Out of scope (follow-ups)

- Survey/waitlist confirmation emails
- HTML templates
- comail Events API / bounce + webhook ingestion
- Waitlist audience for broadcasts (v1 audiences: survey respondents only)
