---
name: The Atmospheric Builders' Retreat
description: Pure white UI over the dusk — a retreat home that is one long evening scrolling from golden light to night, a registration feed over full-bleed photography, and an organizer room on the same night's solid ground.
colors:
  ink: "#ffffff"
  ink-70: "rgba(255, 255, 255, 0.7)"
  ink-45: "rgba(255, 255, 255, 0.45)"
  ink-35: "rgba(255, 255, 255, 0.35)"
  ink-14: "rgba(255, 255, 255, 0.14)"
  ink-12: "rgba(255, 255, 255, 0.12)"
  ink-07: "rgba(255, 255, 255, 0.07)"
  ground: "#0b0908"
  on-pill: "#0b0908"
typography:
  display:
    fontFamily: "Big Shoulders Variable, Arial Narrow, sans-serif"
    fontSize: "clamp(3.4rem, 13.5vw, 6rem)"
    fontWeight: 700
    lineHeight: 0.92
    letterSpacing: "0.005em"
  headline:
    fontFamily: "Big Shoulders Variable, Arial Narrow, sans-serif"
    fontSize: "clamp(2.6rem, 9vw, 4.2rem)"
    fontWeight: 700
    lineHeight: 0.92
    letterSpacing: "0.005em"
  title:
    fontFamily: "Big Shoulders Variable, Arial Narrow, sans-serif"
    fontSize: "clamp(2.2rem, 7.5vw, 3.6rem)"
    fontWeight: 700
    lineHeight: 0.92
    letterSpacing: "0.005em"
  stat:
    fontFamily: "Big Shoulders Variable, Arial Narrow, sans-serif"
    fontSize: "clamp(2.2rem, 3.2vh, 3.6rem)"
    fontWeight: 700
    lineHeight: 0.92
  body:
    fontFamily: "Hanken Grotesk Variable, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  reading:
    fontFamily: "Hanken Grotesk Variable, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.55
  rail-title:
    fontFamily: "Big Shoulders Variable, Arial Narrow, sans-serif"
    fontSize: "clamp(1.9rem, 2.6vw, 2.6rem)"
    fontWeight: 700
    lineHeight: 0.92
  label:
    fontFamily: "Hanken Grotesk Variable, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    letterSpacing: "0.18em"
  place:
    fontFamily: "Big Shoulders Variable, Arial Narrow, sans-serif"
    fontSize: "clamp(1.35rem, 4.2vw, 1.9rem)"
    fontWeight: 650
    letterSpacing: "0.01em"
  input:
    fontFamily: "Hanken Grotesk Variable, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
  control:
    fontFamily: "Hanken Grotesk Variable, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 650
  compact:
    fontFamily: "Hanken Grotesk Variable, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.45
  numeral:
    fontFamily: "Hanken Grotesk Variable, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
  fact:
    fontFamily: "Hanken Grotesk Variable, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    letterSpacing: "0.14em"
  fact-mobile:
    fontFamily: "Hanken Grotesk Variable, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    letterSpacing: "0.1em"
  micro:
    fontFamily: "Hanken Grotesk Variable, system-ui, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 500
    letterSpacing: "0.12em"
  caption:
    fontFamily: "Hanken Grotesk Variable, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    letterSpacing: "0.12em"
rounded:
  pill: "999px"
  sheet: "14px"
  card: "10px"
  day: "6px"
  focus: "2px"
spacing:
  space-1: "0.375rem"
  space-2: "0.75rem"
  space-3: "1.125rem"
  space-4: "1.75rem"
  space-5: "2.75rem"
  gutter: "clamp(1.125rem, 4.5vw, 2.5rem)"
  nav-rail: "11.5rem"
components:
  button-pill:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-pill}"
    rounded: "{rounded.pill}"
    padding: "0.7rem 1.5rem"
    height: "3.25rem"
  button-outline:
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0.45rem 1.1rem"
  chip-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-pill}"
    rounded: "{rounded.pill}"
    padding: "0.4rem 0.85rem"
  avatar-ring:
    rounded: "{rounded.pill}"
    size: "3rem"
  switch:
    rounded: "{rounded.pill}"
    width: "2.6rem"
    height: "1.5rem"
  switch-checked:
    backgroundColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    width: "2.6rem"
    height: "1.5rem"
---

# Design System: The Atmospheric Builders' Retreat

<!-- Recorded post-build from the shipped code (scan mode). Ground truth is
     src/app.css and src/lib/{ui,survey,registration,auth}/*; the direction contract lives in
     src/routes/+layout.svelte (FORM: Full-Bleed Feed, seed 9380440b).
     Documenter ran inline (no subagent harness) per the degraded role.
     Extended 2026-08-07 from the second surface: src/routes/organizer/*
     and src/lib/organizer/* (FORM: Command rail, approved comp
     .impeccable/mocks/org-b.png; finish review disposition: ship).
     Extended 2026-11-01 from the third surface: the retreat home at `/`
     (src/lib/site/*, src/lib/markdown/render.ts; surface brief
     .impeccable/surfaces/src-routes-page-svelte.md, "Dusk to night", comp A,
     seed e19d7971) and the retreat-info console (src/routes/organizer/retreat/**,
     src/lib/site/console/*), recorded from branch feat/retreat-site.
     Venue rule: this file never names the town, the house, or venue details. -->

## Overview

**Creative North Star: "The Dusk Feed"**

Every surface is the Southern California dusk — photographed, or the near-black ground the photographs settle into — and the interface is a single voice speaking over it in pure white. The feed (the original survey, and now the registration flow at `/?register`) refuses the centered-card stepper on a gray ground: it is a feed you flick through, one item per viewport, snap-scrolled like the social product its audience lives in. The photography — real Wikimedia location shots and labeled synthetic desert-modern atmosphere — carries all of the color; the UI contributes exactly one ink.

Density is low and bottom-weighted. Each item breathes at the top (a flex spacer, `min-height: 8–12vh`) and settles its content toward the bottom edge, where a scrim gradient darkens the photograph to near-black so text never negotiates with the image. Structure is drawn, not boxed: hairline rules at 35% white separate ledger rows; the only filled container in the world is the fully-rounded white pill. A film-grain tile at 7% overlay unifies photographic sources into one material.

The world now has a second surface: the organizer room (`/organizer`) is the same night at **Operate density**. The photographs stay home — the ground is the solid dusk near-black carrying the same grain at its flat-surface blend — and the one ink does data work: a command rail of condensed display numerals on the left, an availability heatmap whose cells are computed white alpha, hairline ledgers and tables in the content column. It refuses the KPI-card dashboard-on-gray the way the survey refuses the stepper. Density rises; the material does not change.

The world's third surface is the retreat home at `/`: **one long evening**. It no longer snaps a feed; it scrolls freely through stacked regions of light that deepen as you go — golden hour (the hero, then organizer-written story and plan sections over a blurred, inverted copy of the hero's own light), blue hour (Who's coming, over a dusk photograph), and night (the posts stream on the solid ground). Regions overlap and fade into one another through masked photographs and ground-colored scrims, so the light changes with no seam. Each region opens on an **evening-clock line** — a ruled ledger row reading a time and a light ("4:52 PM · Blue hour") — and a slim time-of-day nav tracks where you are in the evening. Sections that carry photographs become regions of their own: the lead photo full-bleed at the hero's strength, the copy settling onto its scrimmed lower edge. Everything else the home lists — schedules, packing lists, people, posts — is a hairline ledger.

The world was chosen deliberately over the assigned direction (user-chosen challenger, seed `9380440b`) and its finish bar is written into the layout contract: unreviewed and undocumented is unfinished.

**Key Characteristics:**
- One UI color: white, stepped only by opacity (100 / 70 / 45 / 35 / 12 — plus 14 and 7 as data-density steps).
- Full-bleed photographic grounds under ground-colored scrims on the feed and the home's light regions; solid `#0b0908` ground at night and on operate surfaces; the grain tile everywhere.
- Ultra-condensed stacked display caps (Big Shoulders) against a quiet grotesk body (Hanken Grotesk).
- Hairline ledger rows for facts, options, and data; the white pill as the single filled action.
- Three cadences, one world: the feed snap-scrolls one item per viewport; the home scrolls freely through regions of deepening light; the organizer scrolls freely under a sticky command rail.
- Evening-clock lines open every home region; time of day is the home's navigation.
- One authored motion: content settles upward 28px when a feed item snaps in. The home and the organizer have zero entrances.
- 1.75-stroke outline icon system; the filled Bluesky butterfly is the lone deliberate outsider.

## Colors

The palette is one ink over the dusk: every UI tone is white at an opacity step, and everything that reads as "color" on screen is either the photograph underneath (feed, home regions) or the warm near-black ground itself (night region, organizer).

### Primary
- **Ink** (`#ffffff`, `--ink`): the entire interface — display type, body text, pill fill, icon strokes, dots, hairlines at reduced alpha, and the heatmap's data encoding. Selection state inverts it (`::selection` is 85% white with near-black text).

### Neutral
- **Dusk Ground** (`#0b0908`, `--ground`): the page background behind and beneath every photograph, the scrim gradient's base color, the sign-in sheet surface, the organizer's entire solid ground, the text color on the pill (`--on-pill`), and the numeral color on bright heatmap cells. A warm near-black, not neutral gray.
- **Ink 70** (`rgba(255,255,255,0.7)`, `--ink-70`): secondary text — fact labels, author line, prompts' quieter siblings, unselected option text, table headers, muted cells, stat labels' quieter siblings.
- **Ink 45** (`rgba(255,255,255,0.45)`, `--ink-45`): faint strokes — avatar ring, chip borders, input underlines, placeholders, the switch track, rail section heads, unselected window kickers.
- **Ink 35** (`rgba(255,255,255,0.35)`, `--ink-35`): the hairline (`--hairline: 1px solid`), resting progress dots, out-of-window calendar days.
- **Ink 14** (`rgba(255,255,255,0.14)`): the data hairline — row separators inside the responses table (desktop and mobile collapse), where the full 0.35 hairline at forty-row density would read as a grid instead of a ledger. Used as a literal value, not yet a custom property.
- **Ink 12** (`rgba(255,255,255,0.12)`, `--ink-12`): fills that must read as surface, not stroke — hovered calendar days, the unavailable half of a split day cell, and the placeholder behind loading images (Bluesky thumbnails, console photo frames).
- **Ink 07** (`rgba(255,255,255,0.07)`): the cell keyline — 1px border on heatmap day cells and legend swatches so zero-count days keep a shape without claiming intensity. Used as a literal value, not yet a custom property.

### Named Rules
**The One Ink Rule.** The interface owns exactly one color: white. Hierarchy is opacity (70/45/35/14/12/7), never a second hue. If a design needs another color, it comes from a photograph.

**The Computed Ink Rule.** When ink encodes data (the availability heatmap), intensity is white alpha computed from the data — `0.05 + 0.95 × (count / peak)`, floored so a single person stays visible against zero — and the cell numeral flips from ink to ground when the cell's mean alpha exceeds 0.5, so contrast is computed, not blended. Data never gets a color scale; it gets more or less of the one ink.

**The Scrim Guarantee Rule.** Text never sits on raw photography. Every feed item carries a bottom-weighted gradient from transparent to 90–98% `#0b0908` (a `darker` variant exists for dense items like the calendar); location cards carry a left-to-right equivalent. On the home, the hero clears through its middle and closes at 0.97 ground; a lead photo's scrim clears through its upper half and reaches the solid ground at the photo's foot, where the copy sits; the golden region holds 0.97 → 0.62 over its blurred light (0.9 at the foot when it runs straight into night); blue hour runs 0.62 → solid ground. Contrast is guaranteed by the scrim, not negotiated per photo. The flat ground needs no scrim; the guarantee there is the ground itself.

**The Ground-Stop Rule.** Every scrim is the Dusk Ground at stepped alpha (`rgb(11 9 8 / a)`), never `#000` or a tinted overlay, and the stop where one region ends meets the stop where the next begins (the hero's last 0.97 is golden's first). The night is the same ground at full strength; the light going out is the ground's alpha rising.

## Typography

**Display Font:** Big Shoulders Variable (with Arial Narrow fallback) — self-hosted via `@fontsource-variable/big-shoulders`.
**Body Font:** Hanken Grotesk Variable (with system-ui fallback) — self-hosted via `@fontsource-variable/hanken-grotesk`.

**Character:** A shouting poster voice over a calm explanatory one. Display is ultra-condensed, uppercase, stacked tight (`line-height: 0.92`); body is a warm, legible grotesk that never competes with it. On the organizer the poster voice shrinks to rail numerals and section heads; the grotesk carries the data. On the home it is the region and section voice, with the grotesk scaled up a step for organizer-written prose.

### Hierarchy
- **Display** (700, `clamp(3.4rem, 13.5vw, 6rem)` line 1 / `clamp(2.55rem, 10vw, 4.5rem)` line 2, lh 0.92, uppercase): the retreat name on the hero, stacked as two lines of different scale (`--display-l1` / `--display-l2`).
- **Headline** (700, `clamp(2.6rem, 9vw, 4.2rem)`, lh 0.92, uppercase): question titles ("ARE YOU IN?") and the review title; also line 1 of the compact (invited) home hero.
- **Title** (700, `clamp(2.2rem, 7.5vw, 3.6rem)`, lh 0.92, uppercase): the denser interactive items (dates, location), the organizer's sign-in gate title — and on the home every region title and section title (`text-wrap: balance`), plus line 2 of the compact hero.
- **Rail title** (700, `clamp(1.9rem, 2.6vw, 2.6rem)`, lh 0.92, uppercase, stacked): the console rail titles ("Retreat / info.").
- **Stat** (700, `clamp(2.2rem, 3.2vh, 3.6rem)`, lh 0.92, tabular numerals): the organizer rail's stat numerals — the title ramp's endpoints interpolated on viewport *height* so the full stat stack (overrides included) fits the first viewport.
- **Place** (650, `clamp(1.35rem, 4.2vw, 1.9rem)`, uppercase where it names): location names on the survey; the organizer's section titles; on the home, attendee names in Who's coming, update titles in the posts stream, and `##`/`###` headings inside organizer prose; the console preview's title.
- **Acknowledgment** (400, `clamp(1rem, 1.6vw + 0.7rem, 1.375rem)`, lh 1.4, `--text-ack`): the hero's two-line human couplet — the one place body type scales up.
- **Body** (400, 1rem, lh 1.5): question prompts, capped at 38–46ch measure; prose list items (lh 1.4).
- **Reading** (400, 1.0625rem, lh 1.55): organizer-written prose on the home, at a 44ch measure (48ch under lead photos, 60ch in the posts stream). The first paragraph speaks in Ink; paragraphs after it drop to Ink 70. A native Bluesky post's text runs one step larger (1.125rem, lh 1.45, 40ch).
- **Fact/Ledger** (500, 0.8125rem, tracking 0.14em, uppercase; 0.75rem / 0.1em under 900px): ledger row text (`--text-fact`, `--track-fact`), the heatmap legend labels, and on the home the evening-clock line, prose `Label — value` rows, the status strip's quiet half, the posts stream's date column, and the gutter nav's labels.
- **Caption** (500, 0.6875rem, tracking 0.12em, uppercase, Ink 70 or 45): figure captions, the nav's times and current-light line, the clock's "Invited only" tag, the mobile nav (at 0.1em).
- **Label/Kicker** (500, 0.6875rem, tracking 0.18em, uppercase): the `.kicker` atom — field labels, rail section heads, table headers, window rank labels, the status chip.
- **Author** (400–550, 0.8125rem, `--text-author`): bylines, hints, error text, flash messages, quiet links.
- **Interim steps** (Hanken Grotesk): Input 1.125rem; Control 1.0625rem/650 (pill and option labels); Compact 0.9375rem (dense prompts, review values, table cells, toggle labels); Numeral 0.875rem tabular (calendar days, heatmap cells at 0.8125rem); Fact-mobile 0.75rem/0.1em (ledger under 900px); Micro 0.625rem/0.12em (calendar and heatmap weekday letters).

### Named Rules
**The Stacked Caps Rule.** Display type is always uppercase, always `line-height: 0.92`, and multi-line titles stack as separate spans that may differ in size. Never letter-space display caps beyond 0.005em.

**The Kicker Exception.** The uppercase kicker/eyebrow (`.kicker`) is normally banned by the craft floor, but it is KEPT in this world by explicit user decision (2026-08-04), which overrides the ban. It is a documented exception scoped to this project: use the `.kicker` atom exactly as defined; do not invent additional eyebrow variants. On the organizer surfaces (`/organizer`, `/organizer/retreat`, `/organizer/retreat/attendees`) the kicker appears only as field labels, list/group heads ("Sections", "On the site", "Not shown"), and stat labels — never as an eyebrow above a heading. The one sanctioned eyebrow is the hero's retreat kicker, which moved with the hero from the survey to the home at `/`; no other surface gets one.

**The Clock Is a Ledger Rule.** The evening-clock line that opens a home region is a ledger row, not an eyebrow: hairline top and bottom, Fact metrics, time in tabular Ink, light in Ink 70. Its words come only from the evening table in content (time + light, plus the "Invited only" tag on invited lead sections) — never an invented label, and never on a surface that is not the home's evening.

## Layout

The feed (the survey items, and now the registration flow at `/?register`) is vertical: `main.feed` is `height: 100dvh; overflow-y: auto; scroll-snap-type: y mandatory`, and every item is a `100dvh` section with `scroll-snap-align: start; scroll-snap-stop: always` (snap disabled under `prefers-reduced-motion`). Seven items, in fixed order: hero, you, interest, travel, dates, location, review.

Within a feed item, content is a bottom-anchored flex column: a `.breathe` spacer (`flex: 1 1 auto; min-height: 8–12vh`) pushes everything toward the lower third, over the scrim's darkest band. Horizontal padding is `--gutter` (`clamp(1.125rem, 4.5vw, 2.5rem)`) plus a reserved `2.4rem` on the right so text clears the fixed glyph rail; top and bottom padding add `env(safe-area-inset-*)`. At `min-width: 900px` the content column caps at `620px` and left-aligns inside a `1160px` frame; the photograph keeps the full viewport. Fixed chrome: the icon rail vertically centered on the right edge, seven progress dots centered at the bottom. Spacing runs on a five-step rhythm (`--space-1` 0.375rem → `--space-5` 2.75rem). The sign-in sheet is bottom-docked full-width on mobile and becomes a centered `min(26rem, …)` card at `min-width: 700px`. Hero art swaps portrait→landscape at `(min-aspect-ratio: 1/1)` via `<picture>`.

The home is a **free-scrolling stack of light regions**, no snap. Order: hero (full `100svh`; compact `64svh` for invited visitors, with the facts ledger dropped) → status strip on the flat ground → the golden blocks → blue hour (Who's coming) → night (posts) → a credit footer on the night ground. Golden content is laid out in blocks: a section with photos becomes a **lead** (photo `92svh` tall — `72svh` under 900px — copy rising `20rem` / `13rem` onto its lower edge, then continuing on the ground); its remaining photos pair beside the following section as a captioned figure column (`1.25fr 1fr` at 900px, text first on mobile), or hang as a figure strip under the lead when nothing follows. Photo-less sections pair two-up at 900px (`column-gap: --space-5 × 1.5`); an odd last section spans the full row and splits itself, title left and body right — pairs, never orphans. Each region pads `--space-5` by `--gutter`; golden and blue extend their bottoms (×2.4, ×2.6) and their light runs `16rem` under the next region, which masks in over it. Who's coming is a ledger of one column, two at 900px, three at 1180px; the posts stream caps at `52rem` with an `11rem` date column from 900px. At 1180px every region reserves `11.5rem + --space-5` on the right for the gutter nav. Anchors carry `scroll-margin-top: 4rem`; smooth scroll is on unless reduced motion is asked for.

The organizer is a **command-rail frame**: `grid-template-columns: clamp(16rem, 22vw, 20rem) 1fr` on the solid ground. The rail is `position: sticky; top: 0`, full-height (`100dvh`), scrolls internally (thin `--ink-35` scrollbar), and is bounded by a hairline right border. It stacks title → deadline line → stat stack → location tally → deadline controls, and ends in a sticky action footer (`position: sticky; bottom: 0` on the ground color, hairline top border, `env(safe-area-inset-bottom)` padding) so Export never leaves reach on short screens. The content column runs sections at a `--space-5` rhythm with `--space-3` internal gaps, padded by the shared `--gutter`. The signed-out gate is a mini hero: a centered `min(24rem, 100%)` column on the flat ground. Responsive: at `max-width: 900px` the rail folds into a static header with a hairline bottom border; at `1100px` the responses table sheds its From column; at `640px` table rows collapse to a two-line grid (handle + interest, then name + range count).

The retreat-info console reuses the frame exactly (rail width, sticky full-height rail, sticky footer of quiet arrow links, `900px` fold). Its rail holds the stacked rail title, a **two-column stat ledger** (odd last count spans both columns so the ledger closes square), and the section and update lists. The content column opens with the site-wide Bluesky-posts band (its closing rule brightened to Ink 45 to end the band), then the editor: an **editor / preview split** of two equal `minmax(0, 1fr)` columns at a `--space-5` gap. The attendees page runs two ledger groups (On the site / Not shown) whose rows share one column template — `4rem` move arrows · `minmax(11rem, 1fr)` person · `minmax(16rem, 2fr)` blurb · switch — so every field starts at the same x in both lists; under 900px a row folds to name line (person · arrows · switch) over a full-width blurb line.

### Named Rules
**The One Viewport Rule.** One feed item owns the entire viewport. Nothing scrolls inside an item on the feed axis; if content grows, it earns density (the `darker` scrim), never a second screen. This rule is scoped to the feed — the registration flow at `/?register` and the survey feed items — which `/` itself no longer renders. The home and the organizer scroll freely.

**The Pairs Not Orphans Rule.** On the home, short sections pair two-up; an odd last one takes the whole row and splits title-left / body-right, and the console's stat ledger closes square the same way. Nothing sits alone in half a row.

**The Seamless Evening Rule.** Home regions never meet at a hard edge: each light runs under the next, photographs fade through masks, and scrim stops meet at matching alphas. Night is reached by the ground's alpha rising, never by a cut.

## Elevation & Depth

There are no box-shadows in this system — the organizer surface re-confirms it at data density. Depth comes from the material: on the survey, the scrim gradient layers the photograph into fore/background and the sign-in sheet separates with a `rgba(11,9,8,0.55)` backdrop plus `backdrop-filter: blur(3px)` and a hairline top border; on the organizer, depth is hairlines, the grain, and computed alpha — the sticky rail footer separates from scrolling content with nothing but the ground color and a hairline. On the home, depth is the order of regions (each isolates its stacking context, and a later region paints over the tail of the one before), the scrims, and one backdrop blur: the narrow-screen sticky nav sits on 0.97 → 0.9 ground with `backdrop-filter: blur(10px)` and a hairline bottom. The golden region's light is the hero photograph inverted, scaled 1.25 and blurred `42px` — a lighting layer, not an image. The only inset shadow in the codebase (`box-shadow: inset 0 0 0 3px var(--ground)` on a selected radio ring, reused by the status strip's state ring) is a punched-hole trick, not elevation.

### Named Rules
**The Flat World Rule.** No drop shadows, ever. Layering is expressed with scrims, hairlines, backdrop blur, and opacity — never with a shadow vocabulary.

**The Grain Rule.** Every ground carries the grain tile (`/media/grain.png`, `background-size: 340px`), blended per surface: photographic grounds at `opacity: 0.07; mix-blend-mode: overlay` (home hero, region light layers, lead photos, every figure frame); flat `#0b0908` grounds at `opacity: 0.05; mix-blend-mode: screen` (status strip, mobile nav, night region — masked in over `12rem` — footer, console pages sized to the whole document). Overlay needs photographic midtones beneath it and vanishes on near-black; screen at the lower opacity is the same grain made visible on a solid ground. Never omit the grain, and never use any other opacity/blend pair.

## Shapes

Two shape languages, strictly divided. Interactive things are fully round: the pill (`border-radius: 999px`, `min-height: 3.25rem`), chips, dots, avatar rings, radio rings, the rail's tick badge, the switch track and knob, the segmented filter, and the round icon buttons (chip-x, chip-add, row expanders). Everything else is drawn with hairlines — ledger rows bounded by `1px solid var(--ink-35)` top/bottom, underline-only inputs and textareas (`border-bottom: 1px solid var(--ink-45)`, `border-radius: 0`), table rows on the 0.14 data hairline; no boxes, no cards for text.

The few soft rectangles that exist serve imagery, surfaces, and data cells, not text: location photo cards and the console's photo thumbnails (`4 / 3` crop) at `10px`, calendar day cells at `6px` — a radius the heatmap's day cells and legend swatches reuse exactly — the desktop sign-in sheet at `14px`, and the `2px` focus-ring radius. Split half-days are drawn as a half-filled shape via the established device: `linear-gradient(to bottom | to top, <fill> 50%, <fill> 50%)` — solid ink over `--ink-12` on the survey calendar and legend, computed alphas per half on heatmap cells. On the home, photographs are square-cornered: full-bleed lead photos and region light have no edge at all, and figures crop to `16 / 10` with no radius (Bluesky thumbnails crop square, a single image keeps its own ratio up to `26rem` tall). Avatars are always full-round rings (`1px` Ink 45): `3rem` in Who's coming, `2.25rem` on Bluesky posts, `1.9rem` in tables and the attendee ledger, with initials in Ink 70 as the fallback. The organizer's location tally bars are `2px`-tall full-round ink strokes at 0.75 opacity, sized by `transform: scale(x, 1)` from the left edge so length animates without reflow.

### Named Rules
**The One Container Rule.** The fully-rounded white pill is the only filled container in the interface. Round controls (chips, filter segments, the switch) may invert to solid ink in their *selected* state — that reads as state, not surface. Text content is never boxed or carded; it sits directly on the ground, structured by hairlines.

## Components

### Buttons (the Pill)
- **Character:** one confident action per item; full-width, unmissable, white.
- **Shape:** fully rounded (`999px`), `min-height: 3.25rem`, padding `0.7rem 1.5rem`.
- **Fill:** solid Ink (`#ffffff`) with Dusk Ground text (`#0b0908`), weight 650, 1.0625rem; icon gap 0.6rem.
- **Hover / Active:** `scale(1.015)` / `scale(0.985)` over 0.35s `--ease-out`; **Disabled:** opacity 0.55.
- **Compact pill:** in the console editor the Save pill drops to auto width, no min-height, `0.6rem 1.5rem`, 0.9375rem. The status strip's call to action is auto-width with `2rem` inline padding.
- **Outline pill (secondary):** a `1.5px` Ink-45 outline at 999px, `0.45rem 1.1rem`, 0.8125rem weight 600, border brightening to Ink on hover over 0.15s. It is the console's whole secondary vocabulary: Add section, Add post, Save blurb (resting `idle` state at Ink 35 border / Ink 70 text), destructive confirms (border at full Ink), and the **file chooser** — a label wrapping the hidden native input so the browser's "No file chosen" never shows; our own count line sits beside it in Ink 70.
- **Quiet links:** 0.8125rem, Ink 70, underlined with 3px offset, Ink on hover. Directional ones carry a `13px` arrow icon (Console ←, Who's coming →, View as public →).

### Ledger rows
- The `.ledger` atom: baseline-justified label/value pairs, `padding: 0.65rem 0`, hairline top per row plus a closing bottom hairline, uppercase 0.8125rem at 0.14em tracking. Labels in Ink 70, values in Ink, right-aligned with `text-wrap: balance`. Used for hero facts, echoed by choice options, the organizer's stat stack, best-window rows, and toggle rows — the ledger is how this world lists anything.

### Prose ledgers (organizer-written markdown)
- Markdown is rendered server-side (markdown-it, HTML off) and every list becomes a ledger: no bullets, hairline per item and a closing rule, `0.65rem` row padding, max `46rem`. Ordered lists keep their numbers as tabular Ink 45 figures. An item written `**Label** — value` renders as a **ledger pair** — Fact-metric caps, label left, value right in Ink 70 (a schedule); an item written `Label — aside` keeps its body text and dims the aside to Ink 70 after an em dash (a packing list). Links are Ink, underlined in Ink 45 at 3px offset, brightening to Ink on hover.

### Choice options (radio)
- Ledger-style rows: hairline-separated, Ink 70 at rest, Ink on hover/selected. A `1.15rem` circular ring (`border: 1.75px solid currentColor`) fills solid white when selected, with `inset 0 0 0 3px var(--ground)` punching the dot. Native input is visually hidden; `:focus-visible` outlines the ring.

### Inputs / Fields
- **Style:** transparent, underline only — `border-bottom: 1px solid var(--ink-45)`, `border-radius: 0`, 1.125rem text (0.9375rem in dense rail contexts and the allowlist textarea), kicker-styled label above, placeholder in Ink 45.
- **Focus:** the underline brightens to full Ink (`border-bottom-color: var(--ink)`); no outline box. The textarea follows the same underline grammar.
- Global `:focus-visible` elsewhere: `2px solid var(--ink)` outline, `3px` offset, `2px` radius.

### Chips
- Pill-shaped outline chips (`border: 1px solid var(--ink-45)`, radius 999px, 0.8125rem): date-range tokens, half-day toggles, and allowlist handles. Selected/responded state brightens the border to full Ink (allowlist chips add a check glyph); the survey's selected chips fill solid Ink with Ground text (or the half-fill gradient for split days). Inline round icon buttons ride inside chips (`chip-x`, 1.5rem, Ink 45 → Ink on hover) or beside them (`chip-add`, 2rem outlined).
- **Visibility chips (console):** the same outline chip as a radio group (0.8125rem, Ink 70, `0.4rem 0.85rem`), the checked option filling solid Ink with Ground text at weight 600; focus outlines the chip. Used for who-can-see (public / invited / hidden) and where-it-shows (section / update); a hint line in Ink 45 below explains the current choice.
- **Status chip:** kicker-metric text (`0.6875rem`, 0.18em, uppercase) inside a 999px Ink-45 outline — the "Synthetic preview data" flag. Informational, never interactive.

### Segmented filter
- An outlined 999px group (`border: 1px solid var(--ink-45)`, `overflow: hidden`) of text segments (0.8125rem, Ink 70); the active segment fills solid Ink with Ground text at weight 600. State change is a 0.2s `--ease-out` background/color micro-transition. Used for the heatmap's Everyone / Yes-only scope.

### Switch
- A 999px track, `2.6rem × 1.5rem`, `1px solid var(--ink-45)`, holding a `1rem` round Ink knob. Checked inverts the whole control: track fills Ink, knob becomes Ground and translates `1.05rem` right, both over 0.2s `--ease-out`. Semantics via `role="switch"` + `aria-checked`. Used for the reopen-survey override and the attendee ledger's Shown / Hidden toggle, where a caps state word in Ink 70 sits left of the track (dropped under 900px; it is decorative, `aria-hidden`).

### Navigation (Rail + Dots)
- **Survey rail:** fixed right-center column of six `2.4rem` icon stops (person, heart, plane, calendar, pin, check), Ink at 0.62 opacity, full opacity + `scale(1.12)` on hover, a `3px` white dot marker at the active stop's left, and a `0.85rem` filled tick badge when a section is answered.
- **Dots:** seven fixed bottom-center `0.5rem` dots, Ink at 0.35, active at full opacity and `scale(1.25)`. Both animate at 0.3s `--ease-out` and are clickable jump targets.

### Evening clock & time-of-day nav (home)
- **Clock:** the region opener — a flex-wrapped ledger row (hairline top and bottom, Fact metrics) of time (tabular Ink) and light (Ink 70), with an optional right-aligned Caption tag. See The Clock Is a Ledger Rule.
- **Gutter nav (≥1180px):** an `11.5rem` ledger in the right gutter, sticky at `50vh − 7rem` from the end of the hero down. Above the list the current light in Caption Ink 45; each row is label over time (Caption), Ink 45 at rest, Ink 70 once passed, full Ink with a `5px` round dot when current, Ink on hover. While a lead photograph passes beneath it the nav fades out (0.35s) and stops taking pointer input — labels never sit on a photograph — returning on keyboard focus.
- **Top nav (<1180px):** sticky under the hero on blurred ground, equal-flex stops of time over label in Caption metrics, Ink 45 → Ink current with a `1px` Ink underline. The nav appears only when there are at least two places to go.

### Status strip (home)
- One ruled row on the flat ground under the hero: the state ring (radio-ring grammar, filled when registered), a 1.0625rem/650 lead line, a Fact-metric quiet half in Ink 70, and either a quiet link, the auto-width pill, or the waitlist underline input + pill. Under 900px the ring hangs in its own column and everything else stacks after the lead.

### Lead section & figures (home)
- **Lead section:** first photo full-bleed under the lead scrim, grained, `data-photo` so the nav yields; clock, Title-ramp heading, Reading prose rise onto its foot over the ground.
- **Figures:** captioned `16 / 10` frames with the photographic grain; the caption is the photo's alt text in Caption metrics, Ink 70 (hidden from assistive tech, which reads the alt). Layouts: a column beside a section, a two-up pair (≥700px), or an auto-fill strip (`9.5rem` → `14rem` minimum).

### Who's coming (home)
- A ledger of people on blue hour: each row a `3rem` avatar ring spanning two lines beside the name in the Place ramp and a meta line (handle link in Ink 70 · one-line blurb) at 0.875rem. With no profile name, the handle becomes the name and the link, never shown twice.

### Posts stream & native Bluesky posts (home)
- A dated hairline ledger on the night ground, newest first: a date column (tabular, Fact metrics) with the kind ("Update" / "Bluesky", plus "Invited only") in Ink 45, beside the entry. Updates are Place-ramp title + Reading prose + figures. **Bluesky posts render natively in the one ink** — no embed script, no card: a `2.25rem` avatar ring, name at 600 linked to the profile, handle in Ink 70, the butterfly in Ink 45 at the line's end, the post text, square thumbnails two-up (`--space-1` gap), and a quiet "View on Bluesky" link.

### Retreat-info console
- **Editor / preview split:** underline fields with kicker labels on the left (title input 1.125rem/600, an autosizing body textarea, visibility chips, a publish date for updates), a Save pill, and a quiet "Unsaved changes" hint; on the right a preview on the same ground — a ruled column opened by a hairline, not a box — with a Place-ramp title over the rendered body. A delete disclosure sits under a hairline below.
- **Section list:** a hairline list in the rail; each row a 0.9375rem/550 title (current one underlined at 4px offset) over a Caption-metric meta line (visibility · photo count, Ink 45 when hidden), with round `1.75rem` chevron nudges to reorder.
- **Photo manager:** a kicker head, the outline-pill file chooser, an auto-fill grid (`13rem` minimum) of `10px`-radius `4 / 3` thumbnails on Ink 12 with underline alt-text fields and nudges.
- **Attendee ledger:** see Layout for the shared column template; each row is nudges · `1.9rem` ringed avatar beside name (0.9375rem/550) over handle (Ink 70) · an autosizing underline blurb field with a tabular character count (Ink when over) and an outline-pill Save · the Shown/Hidden switch.

### Organizer rail
- The room's spine: sticky full-height column ending in the sticky action footer (pill Export + quiet links). The stat stack is a ledger of Stat-ramp display numerals (tabular, `min-width: 1.6ch`) beside kicker labels in Ink 70. The location tally is a rank/name/bar/points grid sharing one baseline — rank in 0.75rem Ink 45, the 2px tally bar running the slack between name and count, points in tabular Ink 70. Rail section heads are kickers in Ink 45. The rail title is stacked display caps at a one-off rail scale.

### Availability heatmap
- Three month grids (`repeat(7, 1fr)`, 3px gap) of `6px`-radius square cells, each bordered by the 0.07 cell keyline. Cell fill obeys the Computed Ink Rule; half-day splits render as a top/bottom `linear-gradient` with per-half alphas; the day numeral (0.8125rem, tabular) flips to Ground above 0.5 mean alpha. Out-of-window days are borderless Ink 35 at 0.45 opacity. Weekday letters use the Micro step; the legend samples five swatches off the live scale (0 → peak) plus a split-day swatch, labeled in Fact-mobile metrics. The whole grid is `role="img"` with a spoken summary; per-cell counts ride native `title` tooltips.

### Responses table
- A hairline table, not a card grid: kicker-styled headers over a full hairline, rows separated by the 0.14 data hairline. Sortable columns are kicker-metric buttons (Ink 70 → Ink when active, with a chevron). Each row: a round expander (chevron rotates 180° when open, 0.2s), a `1.9rem` avatar in an Ink-45 ring (outline person glyph as fallback), handle at weight 550, muted columns in Ink 70. The interest column steps the ink by value — YES full Ink, MAYBE Ink 70, NO Ink 45. Expanded rows open a kicker-labeled detail grid (email, availability ranges, location ranking). Columns shed at 1100px/900px; at 640px rows collapse to the two-line grid.

### Flash / status strips
- Form feedback and empty states render as text rows bounded by hairline top and bottom rules — never toasts, never boxes. The allowlist's empty warning brightens its rules to full Ink as a one-off emphasis.

### Sign-in sheet & gate
- Survey: ground-colored sheet with hairline top border, kicker heading, underline input, and the pill; rises over 0.45s `--ease-out` above a blurred backdrop. Organizer: the signed-out gate is the same grammar without the sheet — Title-ramp heading, short Ink-70 explainer (34ch), kicker-labeled underline input, pill with the butterfly, on the flat grained ground.

### Icons
- One system: `1.75` stroke, round caps and joins, 24-unit grid, `currentColor`, twelve names (person, heart, plane, calendar, pin, check, butterfly, chevron-down, arrow-left, arrow-right, plus, x). The arrows are a shaft plus a 6-unit open head; chevron-down rotated 180° serves as "up". Decorative by default (`role="presentation"`, `aria-hidden`), labeled via prop when semantic.

### Motion (the one authored moment)
- When a feed item snaps into view (IntersectionObserver, threshold 0.4), its content settles upward from `translate: 0 28px` and 0 opacity over 0.7s `--ease-out` (`cubic-bezier(0.16, 1, 0.3, 1)`). It is gated on `html.js` so non-JS clients never see hidden content, and neutralized under `prefers-reduced-motion`. Everything else — on every surface — is micro-transition only (0.15–0.45s state changes: switch knob, tally bars, expander rotation, filter fills, nav color and its 0.35s yield fade). The home and the organizer have no entrance choreography at all; the home's only movement is the light changing as you scroll, which is layout, not animation.

### Named Rules
**The One Settle Rule.** The caption settle is the only authored entrance in the world. New components may transition state (opacity, transform, ≤0.45s, `--ease-out`) but never add a second choreographed entrance. The home and the organizer hold this at zero: nothing on them animates in.

**The Butterfly Exception.** The Bluesky butterfly is a filled brand mark, deliberately outside the 1.75-stroke system — it is a wordmark, not an icon. No other filled glyph is permitted.

## Do's and Don'ts

### Do:
- **Do** put every surface on the dusk ground — full-bleed photography with the scrim on the feed and the home's light regions, solid `#0b0908` on the night region and operate surfaces — always with the grain tile at its surface's blend (0.07 overlay on photographs, 0.05 screen on flat ground).
- **Do** open every home region with an evening-clock line from the content's evening table, and let regions overlap and fade so the light changes without a seam.
- **Do** render organizer-written lists as ledgers (`**Label** — value` pairs, `Label — aside` items) and render third-party posts natively in the one ink.
- **Do** express all hierarchy as white opacity steps: 1 / 0.7 / 0.45 / 0.35 / 0.12, plus the two data-density steps (0.14 row separators, 0.07 cell keylines) on dense data surfaces — no other alphas.
- **Do** set display type in Big Shoulders, 700 (650 for the place/section ramp), uppercase, `line-height: 0.92`, sized with the established clamps — including the height-interpolated Stat ramp for rail numerals.
- **Do** structure data as hairline ledgers and tables (`1px solid var(--ink-35)`, 0.14 inside dense tables) and reserve the solid white pill for the single primary action per item or section; secondary actions are the 1.5px outline pill or a quiet link.
- **Do** honor `prefers-reduced-motion`, `env(safe-area-inset-*)`, and the `html.js` gate on anything that starts hidden.

### Don't:
- **Don't** introduce a second UI color, a gray ramp, or tinted surfaces — even data visualization is computed white alpha, never a color scale.
- **Don't** use box-shadows, filled cards, or bordered boxes around text; the pill is the only filled container, KPI cards are refused on the organizer, and Bluesky posts are never embedded or carded.
- **Don't** let the home's nav labels sit over a photograph; it yields while a lead photo passes.
- **Don't** add icons outside the 1.75-stroke/round-join/24-grid system, and don't fill any glyph except the Bluesky butterfly.
- **Don't** author new entrance animations; the snap-in settle is the world's one moment, and the organizer proves screens work with none.
- **Don't** let text sit on unscrimmed photography, shrink the gutter/rail clearance (`--gutter` + 2.4rem right on the feed; `11.5rem + --space-5` beside the home's gutter nav), or use the kicker as an eyebrow anywhere except the hero.
