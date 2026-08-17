---
name: Golmuri Janch Ghar — Desktop
description: The lab's print station and offline master — a dark instrument rail beside a bright, high-contrast work surface.
colors:
  instrument-blue: "#0e6ba8"
  instrument-blue-deep: "#094471"
  instrument-blue-wash: "#e8f4fd"
  rail-graphite: "#111827"
  rail-graphite-raised: "#1f2937"
  surface-white: "#ffffff"
  surface-page: "#f8fafc"
  surface-muted: "#f1f5f9"
  danger: "#dc2626"
  danger-wash: "#fef2f2"
  status-success: "#15803d"
  status-success-wash: "#f0fdf4"
  status-processing: "#1d4ed8"
  status-processing-wash: "#eff6ff"
  status-pending: "#b45309"
  status-pending-wash: "#fffbeb"
  status-error: "#b91c1c"
  status-error-wash: "#fef2f2"
typography:
  display:
    fontFamily: "Geist, Inter, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: "2rem"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.025em"
  meta:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    letterSpacing: "0.025em"
  eyebrow:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 700
    letterSpacing: "0.1em"
  mono:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "10px"
rounded:
  control: "0.5rem"
  card: "0.75rem"
  shell: "2rem"
  pill: "9999px"
spacing:
  shell-gutter: "0.75rem"
  card-padding: "1.5rem"
  content-inset: "2.5rem"
components:
  button-primary:
    backgroundColor: "{colors.instrument-blue}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.control}"
    padding: "0.5rem 1rem"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "{colors.instrument-blue-deep}"
  button-secondary:
    backgroundColor: "{colors.surface-white}"
    textColor: "#334155"
    rounded: "{rounded.control}"
    padding: "0.5rem 1rem"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.control}"
    padding: "0.5rem 1rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "#475569"
    rounded: "{rounded.control}"
    padding: "0.5rem 1rem"
  card:
    backgroundColor: "{colors.surface-white}"
    rounded: "{rounded.card}"
    padding: "1.5rem"
  input:
    backgroundColor: "{colors.surface-white}"
    textColor: "#0f172a"
    rounded: "{rounded.control}"
    padding: "0.5rem 0.75rem"
  nav-link:
    textColor: "#94a3b8"
    rounded: "{rounded.pill}"
    padding: "0.625rem 1rem"
  nav-link-active:
    backgroundColor: "rgba(14, 107, 168, 0.1)"
    textColor: "{colors.instrument-blue}"
    rounded: "{rounded.pill}"
  status-badge:
    rounded: "{rounded.pill}"
    padding: "0.125rem 0.625rem"
---

# Design System: Golmuri Janch Ghar — Desktop

## Overview

**Creative North Star: "The Lit Bench"**

The desktop app is where the lab's work gets read, verified, and printed. Its whole spatial idea is a lit bench: a dark instrument rail down the left side holding navigation, status, and identity, and a bright white work surface to its right where patient data is actually read. The two are separate physical objects — each a `2rem`-radius panel floating on a cool slate ground with a `0.75rem` gutter between them and a wide, near-invisible ambient shadow underneath. Nothing else in the app gets that shadow. Depth here marks the shell, not the content.

The character is quiet with a physical press. Surfaces are calm and mostly flat, held together by hairline `slate-200` borders rather than by shadow. What moves, moves deliberately: a single fluid easing curve (`cubic-bezier(0.23, 1, 0.32, 1)`) over 200–300ms, and a `0.98` scale on press so a click feels like it landed. The restraint is functional. This is a print station operated by one non-technical person, often late, often tired, working through results that become a medical record the moment they are locked.

Instrument Blue is used sparingly and always means *this is the live thing* — the active nav pill, the focused field, the primary action. Color that is not blue is status: a four-way vocabulary of success, processing, pending, and error, each a saturated dot and a near-white wash. The palette carries information, never decoration.

**Key Characteristics:**
- Two floating `2rem` panels on a slate ground; ambient shadow reserved for those two panels alone
- Dark graphite rail (`#111827`) against a pure white work surface — the contrast is the layout
- Hairline `slate-200` borders do the structural work; shadows stay at 1px except on the shell
- One accent (Instrument Blue) for liveness; a separate four-color status vocabulary for meaning
- Pill-shaped navigation, `0.75rem` cards, `0.5rem` controls — radius encodes hierarchy
- Every interactive surface presses in by 2% on `:active`

## Colors

A cool, clinical palette: one blue accent used rarely, a graphite rail, slate neutrals, and a four-way status set that is the only other licensed color.

### Primary
- **Instrument Blue** (`#0e6ba8`): The single accent. Primary buttons, the active navigation pill (at 10% opacity behind full-strength text), focused input borders, and icon highlights on the active route. Never used as a large fill.
- **Instrument Blue Deep** (`#094471`): Hover state for primary buttons only.
- **Instrument Blue Wash** (`#e8f4fd`): The tint behind quick-action icon tiles. A backing surface, never a text color.

### Neutral
- **Rail Graphite** (`#111827`): The sidebar body. The darkest surface in the app and the anchor for the whole layout.
- **Rail Graphite Raised** (`#1f2937`): The rail's own border and its raised inner blocks.
- **Surface White** (`#ffffff`): The work surface and every card. Where data is read.
- **Surface Page** (`#f8fafc`) / **Surface Muted** (`#f1f5f9`): The ground the two shell panels float on, and muted fills inside content.
- Slate `200` is the universal hairline border; slate `900` is primary text, `600` secondary, `400` tertiary and inactive rail items.

### Tertiary — Status
Status is a closed vocabulary. Each state pairs a saturated dot and text color with a near-white wash background.
- **Success** (`#15803d` on `#f0fdf4`): Locked, verified, completed.
- **Processing** (`#1d4ed8` on `#eff6ff`): In flight — syncing, in progress.
- **Pending** (`#b45309` on `#fffbeb`): Waiting on a human — unverified results, awaiting return.
- **Error** (`#b91c1c` on `#fef2f2`): Failed or abnormal. Shares its hex with Danger.

### Named Rules

**The One Live Thing Rule.** Instrument Blue marks what is currently live — the route you are on, the field you are in, the action that commits. If two things on a screen are blue, one of them is wrong.

**The Closed Status Rule.** Health, progress, and outcome are expressed only through the four status pairs. Do not introduce a fifth colour, and do not borrow a status colour for a non-status purpose. An abnormal result and a failed sync are allowed to look alike; that is the point.

**The Sister-App Rule.** This app is blue and its sidebar is `#111827`. The staff portal is deliberately teal with a lighter charcoal rail. The divergence is intentional so staff always know whether they are on the home PC or their phone. Do not reconcile the two palettes.

## Typography

**Display Font:** Geist (with Inter, system-ui fallback)
**Body Font:** Inter (with system-ui fallback)
**Label/Mono Font:** Geist Mono (with ui-monospace fallback)

**Character:** Geist appears only for the lab's own name in the rail — an identity mark, not a headline face. Everything else is Inter doing dense, unglamorous work at small sizes. The hierarchy is carried by weight and letter-spacing far more than by size; there is no display type anywhere in the content area.

### Hierarchy
- **Display** (700, 15px, tight tracking): The lab name in the sidebar. This is the only Geist in the app.
- **Headline** (600, 1.5rem / `text-2xl`): Page titles in `PageHeader`, and the large numerals in `StatCard`. The biggest type in the content area.
- **Title** (600, 1.125rem / `text-lg`): Modal titles and empty-state titles.
- **Body** (500, 0.875rem / `text-sm`): The default. Note the medium weight — plain 400 body text is not part of this system.
- **Label** (600, 0.75rem / `text-xs`, uppercase, wide tracking): Input labels and `SectionHeading`.
- **Meta** (500, 11px, slight tracking): Secondary identity and attribution lines that sit under a label — the signed-in user and role beneath the lab name in the rail. The smallest non-uppercase text permitted.
- **Eyebrow** (700, 10px, uppercase, widest tracking): Rail group headings — "Operations", "Administration".
- **Mono** (10px): The version string in the rail footer. Its only appearance.

### Named Rules

**The Weight-Not-Size Rule.** The gap between body and label is `500 → 600` plus uppercase and tracking, not a size jump. Sizes cluster tightly (12–14px) so dense tables stay dense; weight and case do the separating.

## Layout

The app is a fixed full-height shell, never a scrolling document. The outer frame is `bg-slate-100` with `0.75rem` of padding, and it contains exactly two children: a `16rem` fixed rail and a flexible main panel separated by `1rem`. Both are `rounded-[2rem]` and both carry the ambient shadow. Only the inner regions scroll — the rail's nav list and the main panel's content area — so the shell itself never moves.

Content sits at `2.5rem` inset (`px-10 py-10`) inside the white panel. Cards are flex rows with a `200px` minimum width, so stat and quick-action rows reflow without a media query. Vertical rhythm inside content is `1.5rem` between blocks, `1rem` under a page header.

Because this is an Electron window on a known desktop, there are no breakpoints. Layout responds to window resizing through flex and `min-w`, not through declared screen sizes.

## Elevation & Depth

This is a **hairline-and-ambient** system, not a layered one. Structure comes from 1px `slate-200` borders; almost every surface is flat at rest. Real elevation appears exactly twice, on the two shell panels, and it is wide and nearly invisible rather than dark and tight.

### Shadow Vocabulary
- **Ambient** (`box-shadow: 0 8px 30px rgba(0,0,0,0.04)`): The two shell panels only. Its job is to separate the app's furniture from the ground, not to make things look raised.
- **Card** (`box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)`): Every card and quick-action tile at rest. A seam, not a lift.
- **Card Hover** (`box-shadow: 0 4px 12px rgba(0,0,0,0.08)`): The response when a card is actually clickable. Reserved for interactive cards — a static card must not gain a shadow on hover.
- **Overlay** (`box-shadow: 0 24px 60px -12px rgba(15,23,42,0.25)`): Anything genuinely floating above a scrim — dialogs, popovers, toasts. Tinted with slate-900 rather than pure black so overlay depth stays in the cool palette. This is the only shadow permitted to be strong.

### Named Rules

**The Ambient-Is-Furniture Rule.** The wide ambient shadow belongs to the shell. A card, modal, or popover that reaches for it is claiming to be part of the app's frame, and it isn't.

**The Hover-Means-Clickable Rule.** A shadow change on hover is a promise that the surface does something. `StatCard` is static and never lifts; `QuickActionCard` is a button and does.

## Shapes

Radius encodes hierarchy, and the scale is deliberately wide. The shell is `2rem` — soft enough to read as a physical object. Cards are `0.75rem` (`rounded-card`). Controls — buttons, inputs, icon tiles — are `0.5rem`. Anything that represents a *state* rather than a *container* is a full pill: nav links, status badges, and the open/closed indicator.

Borders are always 1px and almost always `slate-200`. Inside the dark rail the same role is played by `slate-800`. Nothing in this system uses a 2px border or a decorative divider; where separation is needed inside a card, it is a `border-t border-slate-100` above a footer row.

## Components

### Buttons
- **Shape:** Gently rounded (`0.5rem`), `inline-flex` with a `0.5rem` gap so an icon and label always align.
- **Primary:** Instrument Blue fill, white text; hover deepens to `#094471`. `1rem × 0.5rem` padding at default size.
- **Secondary:** White fill, `slate-700` text, `slate-200` hairline border, hover to `slate-50`.
- **Danger:** `#dc2626` fill, white text, hover `red-700`.
- **Ghost:** Transparent, `slate-600` text, hover `slate-100` fill.
- **Sizes:** `md` (`0.875rem` text) and `sm` (`0.75rem` text, tighter padding).
- **Focus:** `ring-2` in Instrument Blue at 50% with a 2px offset. Colour transitions run 200ms.

### Cards / Containers
- **Corner Style:** `0.75rem` (`rounded-card`).
- **Background:** Surface White.
- **Border:** 1px `slate-200`, always present.
- **Shadow Strategy:** `card` at rest. See Elevation.
- **Internal Padding:** `1.5rem`, suppressible via `noPadding` for tables and list rows that manage their own insets.

### Inputs / Fields
- **Style:** White fill, 1px `slate-200`, `0.5rem` radius, `0.875rem` text.
- **Label:** Uppercase, `0.75rem`, weight 600, wide tracking, `0.375rem` below.
- **Hover:** Border darkens to `slate-300` — the field advertises itself before focus.
- **Focus:** Border becomes Instrument Blue with `ring-2` at 20%.
- **Error:** Border and ring switch to Danger; the message renders beneath at `0.75rem` in Danger.

### Navigation
- **Style:** Full pill, `1rem × 0.625rem`, `0.875rem` text at weight 500, with an 18px Lucide icon at `strokeWidth 2`.
- **Inactive:** `slate-400` text; hover fills `slate-800` and lifts text to `slate-200`.
- **Active:** Instrument Blue at 10% behind full-strength Instrument Blue text and icon.
- **Grouping:** Two labelled groups — "Operations" for everyone, "Administration" gated to Admin and separated by a `slate-800` rule.
- **Motion:** `300ms ease-out-fluid`, with `active:scale-[0.98]`.
- **Sign out** is a nav-shaped button that reveals a rose tint on hover — the only rose in the rail.

### Status Badge
Pill, `0.625rem × 0.125rem`, `0.75rem` text at weight 500, with a `6px` dot in the saturated status colour on a wash background in the same hue. Five variants: the four status pairs plus a slate `neutral`.

### Stat Card
A static `Card` with a `40px` `slate-100` icon tile, a `1.5rem` semibold value, and a `0.875rem` label. An optional trend row sits above a `slate-100` hairline and colours itself Success or Error with an arrow glyph. Its loading state is a pulse of `slate-100` blocks in the same geometry — the skeleton matches the filled layout exactly.

### Empty State
Centred block with `4rem` vertical padding: a `48px` `slate-100` circle holding a 24px `strokeWidth 1.75` icon, a `1.125rem` `slate-700` title, an optional `0.875rem` description capped at `20rem`, and an optional action. The lighter stroke weight is deliberate — empty states are quieter than live UI.

### Dialogs, Popovers & Toasts
Every floating surface shares one treatment: `0.75rem` radius (`rounded-card`), white fill, `1.5rem` padding for dialogs, and the **Overlay** shadow. Dialogs sit on a `black/40`–`black/50` scrim, close on scrim click and on Escape, and carry `role="dialog"` with an `aria-label`. Popovers (`SearchableSelect`) and toasts (`UndoToast`) use the same radius and shadow at smaller padding, so nothing floating in the app invents its own depth.

### The Floating Shell (signature)
The app's defining component. `bg-slate-100` frame at `0.75rem` padding; a `16rem` `rounded-[2rem]` graphite rail with `#1f2937` border and ambient shadow; a `1rem` gap; a `rounded-[2rem]` white main panel with a `slate-200/60` border and the same ambient shadow. Inside the rail: logo tile, lab name, an open/closed pill with an animated ping dot and cloud-sync glyph, the grouped nav, and a footer holding the update banner, sign-out, and mono version string. Reproduce this frame on any new top-level surface; do not invent a second chrome.

## Do's and Don'ts

### Do:
- **Do** reserve the ambient shadow (`0 8px 30px rgba(0,0,0,0.04)`) for the two shell panels, and use `shadow-card` everywhere else.
- **Do** use radius to signal role: `2rem` shell, `0.75rem` card, `0.5rem` control, full pill for state.
- **Do** give every interactive surface `active:scale-[0.98]` and `duration-200`–`300` with `ease-out-fluid`.
- **Do** set body copy at weight 500. This system has no 400-weight text.
- **Do** pair every status colour with its matching wash — a saturated status colour never sits on white as a background.
- **Do** darken input borders to `slate-300` on hover, so fields are discoverable before focus.
- **Do** keep Geist for the lab's name only.

### Don't:
- **Don't** reintroduce `shadow-inner-bezel` or `shadow-inner-bezel-dark`. They are not defined in `tailwind.config.ts` and render nothing; they were leftovers from an abandoned direction and have been removed from the codebase.
- **Don't** reach for raw Tailwind shadows (`shadow-lg`, `shadow-xl`, `shadow-2xl`). The vocabulary is `card`, `card-hover`, `ambient`, and `overlay` — one of those covers every case.
- **Don't** put a hover shadow on a non-interactive surface.
- **Don't** add a second accent colour. Instrument Blue is the only accent; everything else is status or neutral.
- **Don't** use a 2px border or a decorative divider. Hairline `slate-200` (or `slate-100` inside a card) does all separation.
- **Don't** align this app's palette with the staff portal's teal. The divergence is deliberate.
- **Don't** introduce breakpoints. This is a fixed desktop window; use flex and `min-w` for reflow.
