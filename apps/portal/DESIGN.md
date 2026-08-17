---
name: Golmuri Janch Ghar — Patient Portal
description: Where a worried person looks up their result on their own phone — a calm teal room that works at 8am and at 11pm.
colors:
  bg: "#edf1f4"
  elev: "#ffffff"
  elev-pop: "#ffffff"
  pop-hover: "#f0f4f7"
  surface: "#f4f7f9"
  line: "#e2e9ed"
  line-pop: "#d6e0e6"
  text: "#12262f"
  soft: "#4a626d"
  muted: "#5d6e78"
  ink: "#0c1b22"
  brand: "#3a7788"
  brand-deep: "#2a5f6f"
  brand-hover: "#2a5f6f"
  brand-soft: "#e6f0f3"
  brand-fg: "#ffffff"
  band-fg: "#ffffff"
  ok: "#157a4e"
  ok-soft: "#ddf1e8"
  notice: "#8a5a10"
  notice-soft: "#fbf0da"
  alert: "#ba3737"
  alert-soft: "#fce8e6"
typography:
  display:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 800
    letterSpacing: "-0.022em"
    lineHeight: 1.1
  title:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 800
    letterSpacing: "-0.022em"
  subtitle:
    fontFamily: "Plus Jakarta Sans, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    letterSpacing: "-0.012em"
  readout:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "22px"
    fontWeight: 600
    fontFeature: "tnum 1, lnum 1"
  page-title:
    fontFamily: "var(--font-heading), system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    letterSpacing: "-0.012em"
  section:
    fontFamily: "var(--font-heading), system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    letterSpacing: "-0.012em"
  field:
    fontFamily: "var(--font-sans), system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
  action:
    fontFamily: "var(--font-sans), system-ui, sans-serif"
    fontSize: "14.5px"
    fontWeight: 600
  value:
    fontFamily: "var(--font-sans), system-ui, sans-serif"
    fontSize: "14.5px"
    fontWeight: 600
  label:
    fontFamily: "var(--font-sans), system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
  body:
    fontFamily: "var(--font-sans), system-ui, sans-serif"
    fontSize: "13px"
    lineHeight: 1.625
  caption:
    fontFamily: "var(--font-sans), system-ui, sans-serif"
    fontSize: "12px"
  eyebrow:
    fontFamily: "var(--font-sans), system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 500
    letterSpacing: "0.08em"
rounded:
  focus: "8px"
  lg: "12px"
  xl: "16px"
  2xl: "20px"
  3xl: "26px"
  band: "32px"
  pill: "9999px"
spacing:
  card-inset: "1rem"
  control-y: "0.875rem"
  control-x: "1.25rem"
  touch-min: "44px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.brand-fg}"
    rounded: "{rounded.2xl}"
    padding: "0.875rem 1.25rem"
    typography: "{typography.action}"
  button-primary-hover:
    backgroundColor: "{colors.brand-hover}"
  button-secondary:
    backgroundColor: "{colors.elev}"
    textColor: "{colors.text}"
    rounded: "{rounded.2xl}"
    padding: "0.875rem 1.25rem"
  button-on-band:
    backgroundColor: "#ffffff"
    textColor: "{colors.brand-deep}"
    rounded: "{rounded.pill}"
    padding: "0.5rem 1rem"
  card:
    backgroundColor: "{colors.elev}"
    rounded: "{rounded.3xl}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.2xl}"
    padding: "0.875rem 1rem"
    typography: "{typography.field}"
  chip-icon:
    backgroundColor: "{colors.brand-soft}"
    textColor: "{colors.brand}"
    rounded: "{rounded.pill}"
    height: "2.75rem"
    width: "2.75rem"
  tag:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.soft}"
    rounded: "{rounded.pill}"
    padding: "0.25rem 0.75rem"
  note:
    backgroundColor: "{colors.brand-soft}"
    textColor: "{colors.soft}"
    rounded: "{rounded.2xl}"
    padding: "0.875rem 1rem"
---

# Design System: Golmuri Janch Ghar — Patient Portal

## Overview

**Creative North Star: "The Calm Waiting Room"**

Almost everyone who opens this portal is waiting to find out something about their own body. That single fact sets the temperature of the whole surface. The deep-teal band a page opens with, the three wave layers drifting along its foot at seventeen to thirty-one seconds a cycle, the slow opacity breath of a skeleton instead of a glinting shimmer — none of it is decoration for its own sake. It is a room that refuses to feel urgent while someone waits in it.

The portal is built from four surfaces and nothing else: the full-bleed teal **band** every page opens with, the white **card** that carries content, the recessed **surface** strip inside a card, and the pale-teal **chip**. Keeping that vocabulary this short is what makes twelve screens read as one product rather than twelve pages. Depth is a genuine ramp — canvas, surface, card, popover — and a floating menu separates from the card beneath it by taking its own step, never by borrowing the card's fill.

It is also the only surface in this system with a real night mode, and the two themes are not a colour inversion. They disagree about what "darker" means, so shadows, hover directions and the brand's foreground all get redefined rather than flipped: in day mode a button hover goes *deeper*, in night mode it goes *lighter*, because night mode's button ink is near-black. Every one of those inversions is a separate deliberate decision, and the reasoning is written into `globals.css` beside the tokens.

**Key Characteristics:**
- Four surfaces only — band, card, recessed strip, chip — across every screen
- Full day/night theming through `rgb()` triplet tokens with `<alpha-value>` support, not a filter
- A generous radius scale topping out at a 32px band curve; nothing here is sharp
- One easing curve (`cubic-bezier(0.23, 1, 0.32, 1)`) across press, entry, popover and page transition
- Touch-first by construction: 44px minimum hit areas, 16px fields, `dvh` heights
- Motion is choreographed then fully surrendered under `prefers-reduced-motion`

## Colors

A cool teal-on-paper palette in day mode, re-derived rather than inverted for night. Every colour is an `rgb()` triplet custom property so Tailwind can apply alpha to any of them.

### Primary
- **Teal** (`#3a7788`): Buttons, links, active chips, the focus ring, and the icon on a pale plate. The portal's whole identity.
- **Deep Teal** (`#2a5f6f`): The band surface itself, and the ink on a white pill sitting on that band.
- **Soft Teal** (`#e6f0f3`): The pale plate behind an icon and the fill of a low-stakes note.

### Neutral
- **Cool Paper** (`#edf1f4`): The canvas. Never white — white is reserved for cards, so a card always separates from the page behind it.
- **Card White** (`#ffffff`) and **Recessed** (`#f4f7f9`): The two steps above and below a card's own plane.
- **Hairline** (`#e2e9ed`) / **Popover Hairline** (`#d6e0e6`): 1px separation; the second is a step darker so a floating menu keeps its edge.
- **Text** (`#12262f`), **Soft** (`#4a626d`), **Muted** (`#5d6e78`): The three-step text ramp — primary, secondary, tertiary.

### Tertiary — State
- **OK** (`#157a4e` on `#ddf1e8`): Paid, ready, confirmed.
- **Notice** (`#8a5a10` on `#fbf0da`): Awaiting something — an unapproved booking, an unpaid invoice.
- **Alert** (`#ba3737` on `#fce8e6`): Failed, declined, abnormal.

### Named Rules

**The Four Surfaces Rule.** Band, card, recessed strip, chip. A new screen composes from those four; it does not invent a fifth. This is the single reason the portal reads as one product across twelve screens.

**The Elevation-Step Rule.** A floating panel takes its own step on the ramp (`--elev-pop`, `--line-pop`). A popover drawn with the card recipe (`bg-elev border-line`) is made of exactly the fill and hairline of the card it covers, and the two merge into one slab.

**The Two-Themes-Disagree Rule.** Never derive night mode by inverting day mode. Shadows go black rather than slate because the night canvas is darker than the day shadow's tint; hover moves lighter rather than deeper because the button's ink is near-black. Each pair is defined independently in `globals.css`.

## Typography

**Display Font:** Plus Jakarta Sans (with system-ui fallback)
**Body Font:** DM Sans (with system-ui fallback)
**Label/Mono Font:** JetBrains Mono (with ui-monospace fallback)

The three are bound to `--font-heading`, `--font-sans` and `--font-mono` respectively, and all are self-hosted through `next/font/google`, so there is no third-party request at runtime and no layout shift while a face loads. Mono is not decorative here: it is reserved for strings a patient has to read back character by character — an access code, a booking ID, the phone number confirmed before a booking is submitted.

**Character:** A heading face carrying `-0.02em` and weight 700 for every `h1`–`h4`, over a plain sans for everything else. The scale is unusually fine-grained — 11.5, 12, 13, 13.5, 14.5, 16, 17, 18 — because on a phone the difference between a label and a value has to be readable without a size jump big enough to break the line.

### Hierarchy

The scale splits in two. A **display** family carries the public pages — the landing hero, the test catalogue, the booking confirmation — where the portal is persuading someone to come in. A much finer **chrome** family carries the signed-in app, where the patient is completing a task. They rarely appear on the same screen.

Display:
- **Display** (800, 30–32px, tracking tighter, tight leading): The landing hero and the top of each public page.
- **Title** (800, 26px, tracking tighter): Page titles on public pages.
- **Subtitle** (700, 20–24px): Error, 404 and payment-confirmation headings.
- **Readout** (mono, 600, 19–26px, tabular): The one place mono goes large — an amount due, a booking ID, an access code, a phone number confirmed before submitting. A patient reads these back character by character, which is exactly what a monospaced face is for.

Chrome:
- **Page Title** (600, 16.5px rising to 18px at `sm`, tracking snug): The centred title in `BandBar`.
- **Section** (700, 17px, tracking snug): `SectionHead`, the heading above a group of cards.
- **Field** (400, **16px**): Every input. See the rule below — this size is not a taste decision.
- **Action** (600, 14.5px): Button labels.
- **Value** (600, 14.5px): The answer half of a `Fact`.
- **Label** (600, 13px): Form labels above a field.
- **Body** (13px, relaxed leading): Notes and explanatory copy.
- **Caption** (12px): Hints under a field, tag text.
- **Eyebrow** (500, 11.5px, uppercase, `0.08em`): The label half of a `Fact`.

### Named Rules

**The 16px Field Rule.** Any input, select or textarea computes to at least 16px. Below that, Safari on iOS zooms the whole page in on focus **and does not zoom back out** — the patient is left pinching their way back to a legible layout, once per field, and the booking form has nine of them. This is a functional threshold, not a preference.

**The Tabular Numeral Rule.** Anything numeric that sits in a column — amounts, results, dates in a list — carries `.num` (`tnum`, `lnum`). Proportional digits make a column of prices jitter.

## Layout

A single-column reading measure: `max-w-3xl` rising to `max-w-4xl` on large screens, with `px-4` stepping to `px-6` at `sm`. Wide enough that a card grid stops looking stranded on a laptop, narrow enough that it never becomes a dashboard.

Every page opens with the full-bleed band, curved `32px` at the bottom, and the first card is routinely pulled *up* into it. That overlap is why `Container` is `relative`: the band is positioned so it can hold its wave layers, and a positioned element paints above static siblings regardless of source order — without the `relative`, every pulled-up card would render behind the band.

Heights use `100dvh` with a `100vh` fallback. On a phone `100vh` is the viewport with the address bar *hidden*, which is taller than what is actually on screen at load, so every short page carried 60–100px of dead scroll and bounced when nudged.

Horizontal chip rails (`.rail`) scroll without a scrollbar and set `overscroll-behavior-x: contain` — otherwise a swipe running off the end of the fourteen-chip date rail is handed to the browser as a *back* gesture, costing the patient the whole booking form. Inner scroll panes (`.pane`) contain overscroll for the same reason.

## Elevation & Depth

A four-step ramp — canvas → recessed → card → popover — expressed through fill, with shadows as reinforcement rather than the primary cue. Shadow values are theme tokens rather than fixed Tailwind values, because a shadow only reads when it is darker than what it falls on, and the two themes disagree about that.

### Shadow Vocabulary
- **Card** (`--shadow-card`): Every card. Tinted with the canvas hue in day mode; black at much higher alpha in night mode.
- **Lift** (`--shadow-lift`): Popovers and menus. In night mode it is nearly useless on its own, which is why `--elev-pop` also steps lighter.
- **Band** (`0 16px 34px -22px rgb(0 0 0 / 0.5)`): Under the teal band. Black rather than slate — a slate-tinted shadow was *lighter* than the night canvas and rendered as a halo under every header.
- **Bezel** (`inset 0 1px 0 rgb(255 255 255 / 0.22)`): A top highlight, not a drop shadow.

### Named Rules

**The Darker-Than-What-It-Falls-On Rule.** Any new shadow must be darker than the surface beneath it in *both* themes, or it will read as a halo in one of them. Black is the safe answer; slate is not.

## Shapes

A deliberately generous radius scale: `12px` (lg), `16px` (xl), `20px` (2xl), `26px` (3xl), and `32px` for the band's bottom curve. Cards are `26px`; buttons, inputs and notes are `20px`; chips, tags, status dots and the on-band pill are fully round. Nothing in this portal has a sharp corner, and the ramp is wide enough that a card never reads as a big button.

Borders are 1px hairlines throughout, in `--line` — or `--line-pop` on anything floating. Glass tiles use a translucent gradient with a 1px `--glass-edge` and an inset bevel instead of a border-and-shadow pair.

## Components

### Buttons
- **Primary** (`btnPrimary`): Teal fill, `--brand-fg` label, `20px` radius, `1.25rem × 0.875rem`, card shadow, hover to `--brand-hover`. Carries `.tap`.
- **Secondary** (`btnSecondary`): Card fill, hairline border, text ink; hover shifts border and text to teal.
- **On Band** (`btnOnBand`): A white *pill* with deep-teal ink — the only fully-round button, and only ever on the band.
- All three disable to 50% opacity with pointer events off.

### Cards / Containers
- **Card:** `26px` radius, `--elev` fill, `--line` hairline, `--shadow-card`. Padding is the caller's, so a list can run rows to the edge.
- **BandCard:** translucent white at 10% with an inset white ring and a 2px backdrop blur — a card that lives *inside* the band.

### Inputs / Fields
- `20px` radius, recessed `--surface` fill, hairline border, **16px** text, `1rem × 0.875rem`.
- **Focus:** border to teal, fill lifts to `--elev`, plus `ring-4` at 10% — the field rises toward the card plane as you type into it.
- `fieldLabel` above (13px semibold soft), `hintCls` below (12px muted).

### Chips & Small Parts
- **IconChip:** circular plate in one of four tones (brand/ok/notice/alert) behind a hairline icon; `sm` 36px, `md` 44px, `lg` 56px.
- **Tag:** fully-round capsule, 12px medium, same four tones plus neutral.
- **StatusDot:** 8px round with `.dot-pulse` — a 2.4s expanding ring in `currentColor`.
- **Note:** a `20px` tinted panel with a leading icon; the tint carries the tone while the text stays `--soft` so the panel never shouts.
- **Fact:** uppercase 11.5px eyebrow over a 14.5px semibold value. The portal's standard label/value pair.

### Navigation
The **NavDock** is the signature: a bottom dock whose items magnify toward the pointer, with the transform written per-frame by the component and `.dock-item` smoothing between frames so an interrupted sweep retargets instead of restarting. Press feedback is suppressed while magnifying, since the two would fight for `transform`.

### The Band (signature)
The teal header every page opens with. `--brand-deep` fill plus two radial gradients — one white highlight at the top right, one black shade at the bottom left — costing one paint and nothing to download. Optionally carries `BandWaves`: three SVG layers, each holding two identical periods across the viewBox and translating by exactly half its width so the loop has no seam, at 31s/23s/17s for parallax. Fill is white at 5–9% alpha, the one value that reads against deep teal in both themes.

### Motion Vocabulary
`.rise` (520ms entry, `--i` staggers siblings by 55ms) · `.page-in` (220ms opacity-only, from `template.tsx`, so it replays on every navigation) · `.pop` (160ms, origin-aware — a menu grows from the control that opened it) · `.shift` (240ms, `--shift` carries direction so page 3 arrives from the right) · `.skeleton` (1.5s opacity breath, staggered) · `.link-pending` (a sweep saying the tap was heard) · `.tap:active` (scale `0.975`, 160ms).

## Do's and Don'ts

### Do:
- **Do** compose from the four surfaces — band, card, recessed strip, chip.
- **Do** give any floating panel its own elevation step (`--elev-pop`, `--line-pop`, `.popover`), never the card recipe.
- **Do** put every input through `inputCls`, or give it a size of **at least 16px** of its own.
- **Do** wrap small controls in `.hit` so a finger gets 44px even where the eye sees less.
- **Do** define day and night values independently, with the reason in a comment beside them.
- **Do** add `.num` to numerals that sit in a column.
- **Do** give every new animation a `prefers-reduced-motion` answer that keeps the fade and drops the travel.
- **Do** use `overscroll-behavior` on anything that scrolls inside the page.

### Don't:
- **Don't** use `backdrop-filter` for the glass tiles. They sit on a flat canvas, so blurring returns the same flat colour — and thirteen live blurs in a scroll container is the one thing that reliably wrecks the mid-range Android that is most of this lab's traffic.
- **Don't** tint a shadow with slate. It is lighter than the night canvas and becomes a halo.
- **Don't** invert a day token to get its night value.
- **Don't** let a field compute below 16px.
- **Don't** put a hover-only affordance on a touch target without a `(hover: hover)` guard — a tap fires `:hover` and leaves the card stuck raised.
- **Don't** add a fifth surface or a sharp corner.
