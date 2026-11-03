# src/lib/markdown — section markdown

`render.ts` exports `renderMarkdown(src)`: markdown-it configured for
organizer-written retreat sections. Client-importable (the console's live
preview) and used server-side to render `/`.

## Boundaries

- Safety comes from markdown-it defaults — `html: false` and its
  `validateLink`. Never enable `html`, never override `validateLink`.
- Images are disabled; section photos come from `site_photos`.
- Headings clamp to h2/h3. Bare links only for explicit `http(s)://`.
- Ledger list items (the `ledger_items` core rule): `- **Label** — value` gets `li.ledger-pair`, `- Label — aside` gets `li.ledger-aside`, both as `span.ledger-label` + `span.ledger-value`. It only moves tokens: label/value stay text or inline tokens, so escaping is untouched. Em dash with spaces only; anything else renders as a plain item. Styled by `lib/site/Prose.svelte`.
- **Broadcast emails do not use this.** `server/messaging/email-template.ts`
  keeps its own renderer, whose tests pin non-CommonMark behavior.

## Verify

`pnpm test src/lib/markdown`.
