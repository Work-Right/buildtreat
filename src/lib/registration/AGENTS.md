# lib/registration — the Dec 4–7 registration flow

Everything the invited builder sees after the survey closes: the
announcement ("The date is set"), the registration form, and the
registered-state summary. Spec: `docs/superpowers/specs/2026-08-25-registration-design.md`.
Plan: `docs/superpowers/plans/2026-08-29-registration.md`.

| File | Role |
|---|---|
| `registration.ts` | **Pure** form model: `RegistrationInput`, `emptyRegistration()`, `parseRegistrationForm(FormData)`, `validateRegistration()`, `canConfirm()`, the dietary/travel-mode guards. No SvelteKit or D1 imports — it runs under vitest as-is and is shared by the server action and the UI. |
| `registration.test.ts` | Covers parsing, validation, and the confirm gate. Extend it whenever you touch the model. |
| `RegistrationFlow.svelte` | Rendered at `/?register`. Chooses which state to render from `PageData` (announcement → form → summary), hosts the `?register&/register` / `?register&/decline` forms (the `register` param keeps a no-JS POST on the registration flow), and puts a "← Retreat home" link on every state. |
| `AnnouncementItem.svelte` | Locked dates, venue-pending line, deadline, "I'm in" / "Can't make it". |
| `RegistrationForm.svelte` | Contact, dietary (checkboxes + other), emergency contact, accessibility, notes, optional travel section with the travel-support ask (need, amount, contingency), two agreements. |
| `AgreementRow.svelte` | One checkbox + expandable waiver / code-of-conduct text. |
| `RegisteredSummary.svelte` | Answer summary with edit affordances; travel is framed as "update as plans firm up". |

## Boundaries

- The server side lives in `lib/server/registration.ts` (D1 upsert, status,
  counts) and `lib/server/messaging/registration-email.ts` (the "You're in"
  confirmation). The route action in `routes/+page.server.ts` is the only
  thing that calls both. The organizer can edit form fields (never status or
  agreements) at `/organizer/registrations/[did]` via
  `updateRegistrationFields`, validated by the same `validateRegistration()`.
- Registration closes at `REG_DEADLINE`; a late pass reopens it for one
  person (`registrationGate` in `lib/server/organizer/admin.ts`). The
  survey's reopen switch deliberately doesn't.
- Facts (dates, arrive/leave, venue line, deadline, waiver + CoC text,
  dietary options, travel modes) come from `lib/content.ts`. Don't restate
  them in components.
- Validation runs twice on purpose: client-side for inline messages, and
  again in the action. Keep the two paths calling the same
  `validateRegistration()`.
- The form posts with `use:enhance`; keep it working without JS too
  (plain POST + redirect/`fail()` round-trip).

## Verify

`pnpm test` (model), `pnpm check`, and click through all three states on
`/` in dev. Registration is idempotent per DID — re-submitting edits the
existing row, so test the edit path, not just first submit.
