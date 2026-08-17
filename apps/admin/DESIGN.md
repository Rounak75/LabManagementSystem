---
name: Golmuri Janch Ghar — Staff Portal
description: The counter-side data entry surface — a phone-first lit bench, held one-handed with a patient waiting.
colors:
  counter-teal: "#0f766e"
  counter-teal-deep: "#115e59"
  counter-teal-darkest: "#115e59"
  counter-teal-wash: "#f0fdfa"
  counter-teal-tint: "#ccfbf1"
  rail-slate: "#2f3542"
  rail-slate-deep: "#282d38"
  rail-slate-edge: "#1e232c"
  surface-white: "#ffffff"
  surface-page: "#f1f5f9"
  surface-page-alt: "#f8fafc"
  ink: "#0f172a"
  success: "#047857"
  danger: "#e11d48"
typography:
  page-title:
    fontFamily: "var(--font-sans), ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    letterSpacing: "-0.025em"
  brand:
    fontFamily: "var(--font-sans), ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 800
    letterSpacing: "-0.025em"
  body:
    fontFamily: "var(--font-sans), ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
  input:
    fontFamily: "var(--font-sans), ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
  label:
    fontFamily: "var(--font-sans), ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
  action:
    fontFamily: "var(--font-sans), ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
rounded:
  control: "0.5rem"
  card: "0.75rem"
  tile: "0.5rem"
  focus: "4px"
spacing:
  row-inset: "1rem"
  row-height: "0.875rem"
  control-y: "0.625rem"
  content-x: "1rem"
components:
  button-primary:
    backgroundColor: "{colors.counter-teal}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.control}"
    padding: "0.625rem 1rem"
    typography: "{typography.action}"
  button-primary-hover:
    backgroundColor: "{colors.counter-teal-deep}"
  button-ghost:
    backgroundColor: "{colors.surface-white}"
    textColor: "#334155"
    rounded: "{rounded.control}"
    padding: "0.625rem 1rem"
  button-success:
    backgroundColor: "{colors.success}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.control}"
    padding: "0.625rem 1rem"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.control}"
    padding: "0.625rem 1rem"
  card:
    backgroundColor: "{colors.surface-white}"
    rounded: "{rounded.card}"
  input:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0.625rem 0.875rem"
    typography: "{typography.input}"
  row-link:
    padding: "0.875rem 1rem"
    typography: "{typography.body}"
  brand-mark:
    backgroundColor: "{colors.counter-teal}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.tile}"
    height: "2rem"
    width: "2rem"
---

# Design System: Golmuri Janch Ghar — Staff Portal

## Overview

**Creative North Star: "The Lit Bench"**

The staff portal is the same bench as the desktop app, rebuilt for a phone held in one hand at the lab counter. The dark rail and bright work surface survive the translation — but on a phone the rail collapses into a `3.5rem` sticky top bar and slides in over a scrim when summoned, and the work surface becomes the whole screen. The rail is a slightly warmer, lighter charcoal here (`#2f3542`) than the desktop's near-black, because on a small bright screen the desktop's `#111827` reads as a hole rather than a frame.

Everything about this surface is sized for the real scene: standing, one-handed, with a patient in front of you. Inputs are `15px` — larger than the `14px` body around them, which is backwards from most design systems and correct here, because typing is the job. Controls are `0.625rem` tall in the vertical axis and rows are `0.875rem`, giving comfortable thumb targets without turning a list of patients into a scroll marathon. The press feedback is `0.99` rather than the desktop's `0.98`: a lighter touch, because on a phone the finger already covers the control.

Counter Teal is the liveness signal, and it is also the global focus ring — a 2px teal outline at 2px offset appears on any keyboard-focused element, defined once in `globals.css` rather than per-component. That single rule is the accessibility backbone of the app.

**Key Characteristics:**
- Phone-first with one real breakpoint (`md`): top bar plus slide-over rail below it, static sidebar above
- Counter Teal accent, deliberately not the desktop's blue, so staff always know which surface they are on
- A small utility-class layer (`.card`, `.btn`, `.input`, `.row-link`) rather than React primitives — style lives in `globals.css`
- Inputs are larger than body text, because data entry is the whole point of this surface
- Content capped at `72rem` and centred, so a tablet or laptop never stretches a form to the full width
- One globally defined focus ring, teal, on everything

## Colors

A calm clinical palette on cool slate, with a teal accent doing all the signalling.

### Primary
- **Counter Teal** (`#0f766e`): The accent and the identity. Primary buttons, the brand mark tile, focused input borders, and the global focus ring.
- **Counter Teal Deep** (`#115e59`): Primary button hover.
- **Counter Teal Darkest** (`#115e59`) / **Wash** (`#f0fdfa`) / **Tint** (`#ccfbf1`): The declared ends of the brand ramp, available for tinted backings and emphasis.

### Neutral
- **Rail Slate** (`#2f3542`): The sidebar body — the app's dark frame.
- **Rail Slate Deep** (`#282d38`): The rail's header and footer blocks, and the mobile top bar. It reads as a recessed band within the rail.
- **Rail Slate Edge** (`#1e232c`): Every border inside the dark furniture.
- **Surface Page** (`#f1f5f9`): The `--bg` custom property; the ground behind all content.
- **Surface White** (`#ffffff`): Cards, inputs, and the ghost button.
- **Ink** (`#0f172a`): The `--ink` custom property; primary text. Slate `700` for labels, `400` for placeholders.

### Tertiary — Semantic actions
- **Success** (`#047857`, `emerald-700`): The confirming action — verify, lock, mark received.
- **Danger** (`#e11d48`, `rose-600`): The destructive or declining action.

### Named Rules

**The Teal-Is-Ours Rule.** Counter Teal identifies this surface. It is the accent, the brand mark, and the focus ring, and it must never be swapped for the desktop app's Instrument Blue. A staff member glancing down should know from colour alone whether they are on their phone or the home PC.

**The Two-Property Rule.** `--bg` and `--ink` are the only CSS custom properties in this app. Page background and primary text read from them; everything else comes from Tailwind tokens. Do not grow this list into a shadow token system that competes with `tailwind.config.ts`.

## Typography

**Display Font:** Plus Jakarta Sans (with ui-sans-serif, system-ui fallback)
**Body Font:** Plus Jakarta Sans (with ui-sans-serif, system-ui fallback)
**Label/Mono Font:** none — no monospace is used anywhere in this app.

One family does every job, bound to `--font-sans` and self-hosted through `next/font/google`. It is the same face the patient portal uses for headings, which is the only typographic thread running between the two web apps.

**Character:** A single family doing everything, with `antialiased` smoothing and `optimizeLegibility` set globally on `body`. There is no display face and no monospace — this surface has no room for typographic personality, and the hierarchy is carried entirely by weight and size.

### Hierarchy
- **Page Title** (700, 1.5rem, tight tracking, `slate-900`): the `.page-title` utility. One per screen.
- **Brand** (800, 16px desktop / 15px mobile, tight tracking, white): "Lab Admin" in the rail. The heaviest weight in the app, and the only place 800 appears.
- **Input** (400, 15px): field values. Deliberately larger than body.
- **Label** (500, 0.875rem, `slate-700`): the `.field-label` utility, `0.375rem` above its field.
- **Action** (600, 0.875rem): all button text.
- **Body** (400, 0.875rem): everything else.

### Named Rules

**The Input-Is-Biggest Rule.** Field text (`15px`) is larger than body text (`14px`). This inversion is intentional: staff are typing patient data at arm's length on a phone, and the value being entered is the most important thing on screen.

## Layout

A two-part shell that flips at `md`. Below `md`: a sticky `3.5rem` top bar carries the brand mark and a hamburger; the sidebar is `fixed inset-y-0 w-64`, translated off-canvas, and slides in over a `black/50` scrim in 200ms. At `md` and above the top bar disappears, the sidebar becomes `static` and permanently visible, and the shell becomes a row.

Content is capped at `72rem` (`max-w-6xl`) and centred, with horizontal inset stepping `1rem → 1.5rem → 2rem` across `base → sm → md` and a constant `1.5rem` vertical. Two full-width banners — offline and sync-health — sit above the content area inside the main column, so a stale-data warning is never scrolled away from.

Lists are built from `.row-link`: a full-width flex row at `1rem × 0.875rem` with `hover:bg-slate-50` and `active:bg-slate-100`. Rows are separated by the container's own borders rather than by per-row rules.

## Elevation & Depth

Flat, with hairline borders. This app declares no custom shadows at all; it uses Tailwind's default `shadow-sm` on cards, inputs, and filled buttons, and `shadow-xl` on the slide-over rail. Depth exists only to say "this floats above the page" — for the rail when it is over the scrim, and for the brand mark tile.

Structure is carried by 1px borders: `slate-200` on cards, `slate-300` on inputs and ghost buttons (a step darker than the desktop app, so fields stay findable on a bright phone screen outdoors), and `#1e232c` throughout the dark furniture.

### Shadow Vocabulary
- **Seam** (`box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05)`): Tailwind's `shadow-sm`. Cards, inputs, and filled buttons. A seam that separates a control from the page, not a lift.
- **Overlay** (`box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)`): Tailwind's `shadow-xl`. The slide-over rail while it sits above the scrim. The only large shadow in the app, and the only one that means "this floats".

### Named Rules

**The Flat-Content Rule.** Content surfaces are flat. The only meaningful elevation in this app is the mobile rail sliding over the scrim; if a new component wants a large shadow, it almost certainly wants a border instead.

## Shapes

A narrow, practical radius scale. Cards are `0.75rem` (`rounded-xl`). Every control — buttons, inputs, the brand mark tile — is `0.5rem` (`rounded-lg`). The focus ring rounds itself to `4px`. There are no pills and no full-round shapes in this app, which is the clearest formal difference from the desktop's pill navigation and badges.

Borders are always 1px. Icons are inline SVG at `strokeWidth 2`–`2.2`, sized `0.875rem` in the mobile mark and `1rem` in the sidebar mark; there is no icon library dependency in the shell.

## Components

### Buttons
- **Base** (`.btn`): inline-flex, centred, `0.5rem` gap, `0.5rem` radius, `1rem × 0.625rem` padding, `0.875rem` semibold. Transitions colour only. Presses to `0.99`. Disabled drops to 50% opacity and stops pointer events.
- **Primary** (`.btn-primary`): Counter Teal fill, white text, `shadow-sm`, hover to Deep.
- **Success** (`.btn-success`): `emerald-600` fill, hover `emerald-700`.
- **Danger** (`.btn-danger`): `rose-600` fill, hover `rose-700`.
- **Ghost** (`.btn-ghost`): white fill, `slate-300` border, `slate-700` text, hover `slate-50`.

### Cards / Containers
- **Corner Style:** `0.75rem`.
- **Background:** white. **Border:** 1px `slate-200`. **Shadow:** `shadow-sm`.
- Padding is applied by the consumer, not by `.card` — the utility is surface only, so list containers can run rows edge to edge.

### Inputs / Fields
- **Style:** full width, white, 1px `slate-300`, `0.5rem` radius, `0.875rem × 0.625rem` padding, `15px` text, `shadow-sm`.
- **Placeholder:** `slate-400`.
- **Focus:** border becomes Counter Teal with `ring-2` at 20% opacity and no outline — plus the global focus-visible ring underneath.
- **Label:** `.field-label`, `0.875rem` medium `slate-700`, `0.375rem` above.

### Navigation
- **Mobile:** sticky top bar, `3.5rem`, `#282d38` on a `#1e232c` bottom border, brand mark left, hamburger right in `slate-300` brightening to white.
- **Sidebar:** `16rem`, `#2f3542`, white text, `#1e232c` right border, `shadow-xl`. Header and footer are `#282d38` bands; the footer shows username, role, and sign-out.
- **Transition:** `translate-x` over 200ms `ease-in-out`. Tapping the scrim closes it.

### Row Link
The list primitive (`.row-link`): full-width flex row, space-between, `0.75rem` gap, `1rem × 0.875rem` inset, colour-only transition, `hover:bg-slate-50`, `active:bg-slate-100`. Every scannable list of patients, visits, or payments is built from this.

### Brand Mark
A `2rem` (mobile `1.75rem`) Counter Teal tile at `0.5rem` radius holding an inline flask SVG in white at `strokeWidth 2.2`, beside "Lab Admin" at weight 800. This is the app's only identity element — note that the lab's real logo asset is **not** used here; see Do's and Don'ts.

## Do's and Don'ts

### Do:
- **Do** build lists from `.row-link` and surfaces from `.card` rather than re-deriving them inline.
- **Do** keep field text at `15px`, larger than the `14px` body around it.
- **Do** rely on the global `:focus-visible` rule in `globals.css` for keyboard affordance; it is defined once and applies everywhere.
- **Do** use `slate-300` borders on inputs and ghost buttons, a step darker than card borders, so controls stay findable on a bright screen.
- **Do** use `active:scale-[.99]` for press feedback — lighter than the desktop's `0.98`.
- **Do** use `ease-out-fluid` (`cubic-bezier(0.23, 1, 0.32, 1)`) for the 300ms transitions on selectable rows and pickers. All three apps in the monorepo declare this curve; it is the shared motion signature.
- **Do** cap content at `max-w-6xl` and centre it.
- **Do** keep the offline and sync-health banners above content, never inside a scroll region.

### Don't:
- **Don't** reintroduce `shadow-inner-bezel` or `shadow-inner-bezel-dark`. Neither is defined in any config in this repo; both have been removed.
- **Don't** introduce pills or fully-rounded shapes. This app's form language stops at `0.75rem`; pills belong to the desktop.
- **Don't** adopt the desktop's Instrument Blue or its `#111827` rail. The divergence is deliberate.
- **Don't** add custom shadows to `tailwind.config.ts` to make content float. Content is flat; use a border.
- **Don't** add CSS custom properties beyond `--bg` and `--ink`.
