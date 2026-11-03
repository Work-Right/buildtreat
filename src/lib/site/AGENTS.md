# src/lib/site — the retreat home

Client components for `/` (the retreat home). Data arrives already filtered
and rendered from `lib/server/site/` — these components never decide
visibility. The design is comp A, "Dusk to night"
(`.impeccable/surfaces/src-routes-page-svelte.md`): one photographic evening
that deepens as you scroll — golden hour (hero + sections), blue hour
(who's coming), night (posts on the solid ground, then the footer).

| File | Role |
|---|---|
| `RetreatHome.svelte` | Page shell for `/`: head/link-preview tags, hero, status strip, the regions in order, nav entries, footer. Orders sections (invited "plan" first, then the public story), lays the golden hour out via `golden.ts`, and closes on a compact footer on the ground. |
| `HomeHero.svelte` | Golden-hour hero: kicker, organizer tools, stacked name, fact ledger, sign-in pill. `compact` for the invited view (no ledger, shorter). |
| `StatusStrip.svelte` | Signed-in state: register / registered / declined / closed / not invited (+ waitlist form). `RetreatHome` passes `invited` as invited-and-allowed **or organizer**, so an organizer off the allowlist never sees the waitlist. |
| `EveningRegion.svelte` | One stretch of the evening: `light: 'golden' \| 'blue' \| 'night'`, optional clock + title head, children. Owns the photographic layer, scrim, grain and the crossfade into the next region. |
| `EveningClock.svelte` | The ruled "4:10 PM · Golden hour" line that opens a region (+ optional right-hand tag). |
| `EveningNav.svelte` | Time-of-day nav: `place="top"` sticky rail under the hero (< 1180px), `place="gutter"` slim sticky ledger in the right gutter (≥ 1180px). Tracks the region at mid-viewport. The gutter rail fades out while a `[data-photo]` photograph is under it (focus brings it back). |
| `SiteSection.svelte` | A photo-less section on the golden light: title + `Prose`. No clock, no label — the region carries those. |
| `LeadSection.svelte` | A section with photos is its own region: first photo full bleed (top `--photo-h`, fading in over the light above), clock (+ "For invited builders" on invited sections) and copy on its lower edge. Its other photos pair with the next text section as a feature row (figures right, text first on mobile); only with nothing to pair with do they stay as a strip. Marks its photo `data-photo` so the gutter nav steps aside over it. |
| `Prose.svelte` | The one `{@html}` wrapper for server-rendered markdown (safe: markdown-it `html: false`). Lists render as ledgers; `ledger-pair` rows are caps label left / value right, `ledger-aside` rows dim the aside (see `lib/markdown`). |
| `PhotoGallery.svelte` | Photos as captioned figures (alt as a kicker caption, `aria-hidden` since the img carries the alt). `layout="pair"` (updates), `"column"` (feature row) or `"strip"` (under a lead photo). `src` is `/media/site/{id}`, which re-checks visibility. |
| `golden.ts` (+ test) | Pure: `goldenBlocks(sections)` → lead blocks (sections with photos) and golden regions (an optional feature row, then same-visibility groups), each with one clock; `goldenAnchors` gives the nav its `plan` / `story` anchors. |
| `photo-src.ts` | Dev-only: appends `?preview` to photo URLs on the `?preview` home so the media route serves invited photos there (compile-time `dev`; identity in production). |
| `WhosComing.svelte` | Blue-hour region (`#who`): avatar ring (initials fallback) + Bluesky display name (Place ramp) + linked handle + blurb, in a hairline grid. Data is `loadSite().attendees` — already curated, still-confirmed, profile-hydrated; renders nothing when empty. |
| `PostsStream.svelte` | Night region (`#posts`): the posts stream as a dated hairline ledger (date + "Update"/"Bluesky" column, content beside it ≥ 900px). Updates are server-rendered markdown + photos; data is `loadSite().posts`, already tier-filtered and merged newest first. Renders nothing when empty. |
| `BskyPost.svelte` | One Bluesky post rendered natively in the world's ink: author ring, name, appview-verified handle, text segments (text nodes; http(s) facet links only), ≤ 4 thumbnails, "View on Bluesky" + `arrow-right` icon. No embed script, no card. |
| `console/` | The organizer's retreat-info editor at `/organizer/retreat` and the who's-coming curation at `/organizer/retreat/attendees` — see `console/AGENTS.md`. |
| `evening.ts` (+ test) | Pure: `eveningClock(index, count)` spreads the golden-hour regions across 4:10–4:45 PM and picks each one's light from `siteHome.evening`. |

## Boundaries

- Never filter or hide sections here; the server sends only what the viewer may see.
- Bluesky post text is never `{@html}`; render `segments` as text nodes. Handles shown come from the appview response, never the pasted URL.
- `{@html}` only for `section.html` / `update.html` from `loadSite` (and, in `console/`, `renderMarkdown` output for the live preview — same `html: false` renderer).
- No `bind:` on component props (SSR `<title>` issue — see `lib/organizer/AGENTS.md`). `bind:clientHeight` on a DOM element is fine.
- Who's coming never shows registration fields (name, email, phone): display name and avatar come only from the public Bluesky appview, avatars render `alt=""` beside the visible name.
- The town, address and house never appear here; invited photos come only from `section.photos`.
- Copy (clock labels, nav labels, status lines) lives in `siteHome` in `lib/content.ts`. Don't ship comp sample copy.
- A region with no content renders nothing and gets no nav entry; the nav shows once there are two entries. Blue hour (who's coming) and night (posts) are wired in `RetreatHome`. Golden `deepen`s only when no blue hour follows it.
- One evening-clock line per region (golden region, lead photo, blue, night); none on subsections. The only "For invited builders" label is on an invited lead photo.
- Sections pair two per row at ≥ 900px; an odd last section spans the row (`SiteSection span`: title left column, body right). Layouts come from the data (photos or not, visibility), never from section titles.
- Ground-colored scrim stops are written `rgb(11 9 8 / a)` (= `--ground` at alpha); never `#000`.

## Verify

`pnpm check`; `pnpm dev`, then `/`, `/?as=public` and `/?as=invited` as an organizer (or `/?preview` in dev), at 1440 and 393 px.
