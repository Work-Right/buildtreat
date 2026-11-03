# src/lib/site/console — retreat info editor

Components for `/organizer/retreat`, the organizer's editor for the retreat
home's sections, updates, photos and the Bluesky posts in the stream. Organizer surface grammar (DESIGN.md "Command
rail"): flat grained ground, hairline ledgers, underline inputs, kicker
field labels, one white pill (Save section), ghost pills and quiet links for
everything else.

| File | Role |
|---|---|
| `SectionList.svelte` | Rail ledgers: sections (link per section via `hrefFor` → `?section=id`, works without JS; visibility + photo count; up/down move; Add section) and updates (newest first, publish date + visibility; no move — they're ordered by date; Add update posts `kind=update`). |
| `BskyPostsManager.svelte` | Main-column panel (below the editor, so the rail stays a short index) for the stream's Bluesky posts: paste a `bsky.app` post link (`?/bskyAdd`, field `url`), remove (`?/bskyRemove`, field `uri`). A post that stops loading stays listed (hidden on the site) so it can be removed. Results (`bsky: true`) report in its own status line. |
| `SectionEditor.svelte` | Title/body/visibility form + "Where it shows" (Page section / Update chips; a publish date for updates with a "the date is a label" hint, both hidden by CSS for sections so the form works without JS) + live markdown preview (`renderMarkdown` through the home's `Prose`, so lists are ledgers exactly as on `/`; a hairline-ruled region with a visually hidden heading — no eyebrow), body textarea autosized to its content, photo manager, `<details>` delete confirm (no JS needed). Keyed by the page on `id:updatedAt`. |
| `PhotoManager.svelte` | Upload (hint names the server cap: 6 photos / 24 MB per request; visually hidden file input inside a "Choose photos" outline-pill label + own "N photos selected" status — the native chrome never shows; enhance re-encodes each pick, posts only `photo` files), per-photo alt text, move, `<details>` two-step delete; per-photo controls are named by position/alt. Broken thumbnails fall back to a neutral frame. |
| `AttendeeRow.svelte` | One confirmed registrant on `/organizer/retreat/attendees`: 1.9rem ringed avatar (appview `cdn.bsky.app` URL from the load, person glyph fallback), registration name (organizer-only) + handle, blurb form (underline input, ≤ 140, counter near the cap), show-on-site switch, and up/down move when on the site. Both ledgers share one column template (the move column is reserved in Not-shown rows); the switch's visible label is Shown/Hidden. Keyed by the page on `did:blurb`. |
| `downscale.ts` (+ test) | `fitWithin` (pure) and browser-only `downscale` → always re-encodes to a ≤ 2400 px JPEG at 0.85 (EXIF orientation applied, metadata dropped); original only if the browser can't encode. |

## Boundaries

- Never import values from `$lib/server`; `import type` only.
- No `bind:` on component props; native `bind:value`/`bind:group` are fine.
- Every form has a real `action`; only downscaling and the live preview need JS.
- The server owns photo dimensions (read from bytes), metadata stripping (`lib/server/site/strip-metadata.ts`) and all validation.
- No venue name, town or house photos in fixtures or copy.

## Verify

`pnpm check`, `pnpm test`; `pnpm dev`, then `/organizer/retreat?preview` and `/organizer/retreat/attendees?preview` at 1440 and 393 px.
