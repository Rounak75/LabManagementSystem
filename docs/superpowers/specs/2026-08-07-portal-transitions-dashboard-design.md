# Patient portal — smooth navigation & dashboard slate rebuild

**Date:** 2026-08-07
**App:** `apps/portal` (Next 15.5.22, App Router, React 19, Tailwind 3)

## Problem

Two complaints from the lab's own use of the portal.

**1. Page switching feels "direct and a bit laggy."** Every route in the portal
is an `async` server component that queries Supabase, and there is not a single
`loading.tsx` in `apps/portal/src/app`. Tapping a tile therefore produces no
visible response at all until the server round-trip completes, and then the new
page replaces the old one in one hard swap. The absence of loading boundaries
compounds itself: Next prefetches a dynamic route only as far as its nearest
loading boundary, so with none, every navigation is a cold fetch even though
`experimental.staleTimes.dynamic` is already pinned to 30.

**2. The signed-in dashboard's four action slates "look weird."** They are
`.glass` tiles — translucent by construction — positioned at `-mt-6` so they
straddle the teal band's bottom edge. The band's colour shows through their top
half and the near-black canvas through their bottom half, producing a seam
across every tile. The band's `waves` decoration (white at 5–9% alpha) sits in
exactly that zone and smears behind the labels. Separately, the empty dashboard
prints "No visits on record yet" twice — once in the band card, once in the
`Your visits` section.

## Non-goals

- The landing page's own five tiles. They sit on a uniform background and read
  correctly; their tight `gap-0.5` is noted but not changed.
- Next's experimental `viewTransition` flag. The requested feel is "a normal
  smooth switch", which does not justify an experimental flag whose behaviour
  differs across Safari and older Android — most of this lab's traffic.

## Design

### Part 1 — Navigation

Three independent layers, each with one job.

#### 1a. Loading skeletons

A shared `src/components/skeleton.tsx` exporting a small vocabulary that mirrors
the portal's existing surfaces: a shimmer primitive plus band, card, row-list and
tray blocks. Each route then gets a thin `loading.tsx` composing those into that
page's real geometry, so the skeleton and the content it is replaced by occupy
the same space and the swap does not shift layout.

Routes receiving a `loading.tsx`:

| Route | Why it is slow |
| --- | --- |
| `/` | `force-dynamic`, three Supabase queries |
| `/tests` | full catalogue fetch |
| `/info` | settings + closures |
| `/book` | test catalogue for the picker |
| `(authed)/dashboard` | visits + patient + heartbeat |
| `(authed)/invoices` | invoice list |
| `(authed)/invoices/[id]/pay` | invoice + payment state |
| `(authed)/visits/[id]` | visit + results |
| `(authed)/account` | patient record |

This is the load-bearing fix. The skeleton appears on tap with zero latency, and
prefetch now has a boundary to warm.

#### 1b. Root `template.tsx`

`template.tsx` remounts its children on every navigation, so a CSS animation
placed there replays on every page change — one file covering the whole portal.

```css
@keyframes page-in { from { opacity: 0 } to { opacity: 1 } }
.page-in { animation: page-in 220ms cubic-bezier(0.23, 1, 0.32, 1); }
```

Opacity only: one composited layer, no layout, no paint beyond it. 220ms is long
enough to read as a transition and short enough not to read as delay. The
existing `.rise` choreography continues to handle the skeleton→content swap
within a route.

Reduced motion drops it to a 120ms fade with no other change, matching how
`globals.css` already treats `.shift` and `.pop`.

#### 1c. Tap feedback via `useLinkStatus`

`useLinkStatus` (available in the installed 15.5.22) reports the pending state of
the enclosing `<Link>`. Exposed through a leaf client component so the pages that
use it stay server components:

```tsx
"use client";
import { useLinkStatus } from "next/link";
export function LinkPending() {
  const { pending } = useLinkStatus();
  return pending ? <span className="link-pending" aria-hidden /> : null;
}
```

`.link-pending` is an `inset-0` overlay that pulses while the route resolves. It
requires its parent to be `relative overflow-hidden`, which the tiles already
are. Placed in: landing quick-action tiles, the search pill, the category tiles,
the "What you can do here" cards, the dashboard tray cells, and the nav dock
links.

#### 1d. `data-scroll-behavior="smooth"`

`globals.css` sets `scroll-behavior: smooth` on `html`. Next 15.5 still
neutralises this during route transitions, but only emits a dev warning; from
Next 16 it stops, at which point every navigation would animate its scroll to
top and reintroduce exactly the lag being fixed here. Adding the attribute to
`<html>` in `layout.tsx` now keeps the current behaviour across that upgrade.

This is a forward-fix, not a current cause.

### Part 2 — Dashboard

#### 2a. The action tray

The four `.glass` tiles become one opaque card:

- `bg-elev`, `border-line`, `shadow-card`, `rounded-3xl`
- `-mt-9`, so roughly 40% of its height sits over the band's curve
- four equal cells split by `divide-x divide-line`
- icons at 22px, labels at 12px `text-soft`
- hover fills the cell `bg-surface` and lifts the icon; press keeps `.tap`

Because the card is opaque, nothing beneath it shows through — the teal/black
seam and the wave smear both disappear by construction rather than by tuning
alpha values. The overlap itself is kept deliberately: it is the same pattern as
the landing page's search pill, which already crosses the band edge and reads
correctly.

`.glass`/`.sheen` are dropped here. They remain in use on the landing page,
where the tiles sit on a single flat background and the effect works.

#### 2b. One empty state, not two

When the patient has no visits:

- the band card becomes the single empty state and carries the
  **Book a home collection** action
- the `Your visits` section is omitted entirely

When the patient has visits, nothing changes: latest visit in the band card,
full list below. This also closes the dead vertical gap, since the band card
stops being a hollow box with a button stranded far below it.

## Files

**New**

- `src/components/skeleton.tsx`
- `src/components/LinkPending.tsx`
- `src/app/template.tsx`
- `loading.tsx` × 9 (routes listed in 1a)

**Modified**

- `src/app/globals.css` — `page-in`, `link-pending`, shimmer keyframes, plus
  their reduced-motion cases
- `src/app/layout.tsx` — `data-scroll-behavior="smooth"`
- `src/app/(authed)/dashboard/page.tsx` — tray, empty state
- `src/app/page.tsx` — `LinkPending` in tiles and cards
- `src/components/NavDock.tsx` — `LinkPending` in dock links

## Verification

The portal's vitest is configured `environment: "node"` with
`include: ["src/**/*.{test,spec}.ts"]` — no JSX, no testing-library. There is no
component-test path here, and adding a browser test harness is out of proportion
to the change.

Verification is therefore:

1. `npm run typecheck` — clean
2. `npm run lint` — clean
3. `npm run build` — clean
4. `npm run dev`, then check by hand: landing, dashboard signed in and empty,
   dashboard with visits, in both light and dark, and navigation between them.

Item 4 is the one that actually answers the complaint, so it is not optional.
