# src/lib/auth — ATProto sign-in

Identity only. We use ATProto OAuth to learn a visitor's DID and handle; we
never read or write anything to their repo. Sessions and OAuth state live in
KV on Cloudflare and fall back to in-memory stores in local dev.

## Files

| File | Role |
|---|---|
| `atproto.ts` | `createAtprotoAuth(...)` config exported as `atproto`. Session store `cloudflareKV('OAUTH_SESSIONS')`, state store `cloudflareKV('OAUTH_STATES', { ttl: 600 })`. `hooks.server.ts` mounts `atproto.handle` last in its `sequence`. |
| `SignInSheet.svelte` | The modal sheet. Props: `open`, `onclose` (callback — not `bind:`, which drops the page's SSR `<title>`), `error`, `knownUser`. Two states: **welcome-back** (a known DID from the `abr_known` cookie, one Continue button) and **type a handle**. Before calling `login()` it hits `GET /api/invited?handle=…` so an uninvited handle finds out here rather than after a round trip to their PDS. Owns modal focus management (remember trigger, focus primary control, restore on close). |
| `HandleTypeahead.svelte` | The combobox. Props: `id`, `value` (bindable), `dropdownOpen` (bindable, mirrored so the sheet knows Escape should close the list first), `oninput`, `onsubmit(handle?)`. Exports `focus()` and `invalidateSearch()`. Debounced search against typeahead.waow.tech with a sequence counter so stale responses never apply. `onDestroy(invalidateSearch)` is load-bearing — see below. |

## Boundaries

- `SignInSheet` is mounted only by `routes/+page.svelte`. The organizer gate
  has its own minimal sign-in (`lib/organizer/OrganizerGate.svelte`).
- The sheet unmounts the typeahead when it closes. Any timer or in-flight
  request the child holds must be cancelled in the child's own `onDestroy`;
  the parent's `$effect` runs after teardown and can't reach it.
- `dropdownOpen` is the only piece of child state the parent reads, and only
  to decide whether window-level Escape closes the dropdown or the sheet.
- Handles are normalized (`trim`, strip leading `@`) before any request.
  `did:` prefixes skip the search entirely.
- The invite pre-flight is a UX courtesy, not the gate. The real check is
  server-side in `hooks.server.ts` / `routes/+page.server.ts` via
  `server/db.checkAllowlist`.
- Don't change rendered ids (`signin-handle`, `handle-results`,
  `handle-opt-{i}`) — they are the ARIA wiring for the combobox.

## Verify

`pnpm check`. In the browser: open the sheet, type two characters and confirm
results appear, arrow to one and press Enter, Escape with the list open
(closes list only), Escape again (closes sheet, focus returns to the
trigger). Sign in with an uninvited handle and confirm the structured denial
message renders with the organizer link.
