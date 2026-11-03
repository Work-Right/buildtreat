---
version: 1
slug: "src-routes-page-svelte"
primary_target: "src/routes/+page.svelte"
related_targets: ["src/routes/+page.server.ts","src/lib/site/RetreatHome.svelte"]
---

# Surface: retreat home (root route)

Scope: `/` — the overall retreat site. Two views: **public** (signed out or not invited) is storytelling only; **invited** is logistics first. Registration flow unchanged at `/?register`. Visitor mode: Persuade (public) opening into Read (invited logistics).

Audience & job: public — the Atmosphere community and anyone Bryan shares the link with; job: see who's coming, what they're building, why this is a great opportunity, and the posts. Invited — attendees and individually invited people; job: get the house, schedule, travel and what-to-bring fast on a phone, and see their registration state.

Proof/content: organizer-written sections and updates (console), a curated who's-coming list (avatar, name, handle, one-line blurb), picked Bluesky posts rendered natively. Facts from PRODUCT.md / content.ts. Venue rule: public never names the town or house or shows house photos.

Chosen direction (2026-11-01, Bryan picked comp A of three; surface seed e19d7971, dealt #6 of 7): **Dusk to night** — one long photographic evening that deepens as you scroll: golden hour = hero + story sections; blue hour = who's coming; night = posts on the solid ground. A slim sticky time-of-day ledger nav (Story / Who's coming / Posts) shows where you are in the evening; each region opens with an evening-clock line. Invited view keeps the evening but opens on logistics (compact hero → status strip → the house with the pool-at-dusk photo → schedule ledger → getting there → what to bring) before blue hour and night.

Memorable moment: the light changing as you scroll — continuous stacked scrims, no seams.

Approved comp: `.impeccable/mocks/decision/home-a-public.html` (+ desktop/mobile JPEG screenshots); invited comp is local-only in `.impeccable/mocks/private/` (venue photos).

Unresolved: comp-only lines not written by Bryan ("Good night · see you Dec 4" footer, intro line under Who's coming) must not ship unless he approves them; the invited schedule region read cold blue under the blurred pool photo — warm it in the build; comp hook findings (#000 literals, sub-11px micro labels) are fixed in the build.
