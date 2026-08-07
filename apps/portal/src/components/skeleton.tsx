// The portal's pages before their data arrives.
//
// Every page here is an async server component that queries Supabase, so
// without a loading boundary a tap produces nothing at all until the round
// trip finishes and then swaps the whole page in at once. That is the "direct
// and laggy" feel. These blocks are what a `loading.tsx` renders in the
// meantime.
//
// Two rules keep them from being worse than nothing:
//
//   1. A skeleton copies the *geometry* of the page it stands in for — same
//      container, same band depth, same card radii, same row heights. If the
//      shapes disagree, content landing shifts the layout and the swap draws
//      more attention than the wait did.
//   2. It copies the vocabulary too. These are the same four surfaces `ui.tsx`
//      defines, drawn empty, which is why there is no separate "skeleton grey"
//      anywhere in this file — `.skeleton` fills with `--surface`.
//
// Presentational and server-safe, like `ui.tsx`, so a `loading.tsx` can be a
// server component.

import { Band, BandCard, Card, Container } from "./ui";

/* ─── Primitive ──────────────────────────────────────────────────── */

/**
 * One pulsing block. `i` staggers it against its siblings on the same
 * terms as `.rise`, so the loading screen and the loaded one share a rhythm.
 */
export function Bar({
  className = "",
  i = 0,
  onBand = false,
}: {
  className?: string;
  i?: number;
  /** Fill for the deep-teal band, where `--surface` is invisible. */
  onBand?: boolean;
}) {
  return (
    <span
      aria-hidden
      style={{ "--i": i } as React.CSSProperties}
      className={`skeleton block rounded-full ${onBand ? "skeleton-band" : ""} ${className}`}
    />
  );
}

/** Round plate — stands in for an `IconChip` or a status circle. */
export function Disc({
  className = "h-11 w-11",
  i = 0,
  onBand = false,
}: {
  className?: string;
  i?: number;
  onBand?: boolean;
}) {
  return (
    <span
      aria-hidden
      style={{ "--i": i } as React.CSSProperties}
      className={`skeleton block shrink-0 rounded-full ${onBand ? "skeleton-band" : ""} ${className}`}
    />
  );
}

/* ─── Page-shaped blocks ─────────────────────────────────────────── */

/**
 * The `BandBar` shape — back arrow, centred title, trailing slot. Used by
 * every interior page, so its skeleton is worth having once.
 */
export function SkBandBar() {
  return (
    <div className="flex items-center gap-3 pb-1 pt-5">
      <Disc className="h-11 w-11" onBand />
      <div className="flex flex-1 justify-center">
        <Bar className="h-4 w-32" i={1} onBand />
      </div>
      <span className="h-11 w-11 shrink-0" />
    </div>
  );
}

/**
 * The interior-page opening: teal band, back bar, and the translucent card
 * pulled into it. `dashboard`, `invoices`, `visits/[id]` and `account` all
 * open this way.
 */
export function SkInteriorBand({ card = true }: { card?: boolean }) {
  return (
    <Band waves className="pb-14">
      <Container>
        <SkBandBar />
        {card && (
          <BandCard className="mt-4">
            <div className="flex items-center gap-4 rounded-[20px] bg-elev px-5 py-4">
              <Disc i={2} />
              <div className="min-w-0 flex-1 space-y-2">
                <Bar className="h-3 w-24" i={2} />
                <Bar className="h-4 w-40" i={3} />
              </div>
            </div>
          </BandCard>
        )}
      </Container>
    </Band>
  );
}

/**
 * A centred band — the shape the landing page, `/tests`, `/info` and `/book`
 * open with. `lines` is how many paragraph rows sit under the heading.
 */
export function SkCentredBand({
  lines = 2,
  className = "pb-14",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <Band waves className={className}>
      <Container className="pt-8">
        <div className="flex flex-col items-center gap-3">
          <Bar className="h-8 w-64 max-w-full sm:h-10 sm:w-96" onBand />
          {Array.from({ length: lines }, (_, i) => (
            <Bar
              key={i}
              i={i + 1}
              onBand
              className={`h-3.5 ${i === 0 ? "w-80" : "w-56"} max-w-full`}
            />
          ))}
        </div>
      </Container>
    </Band>
  );
}

/** A list row: plate, two lines, trailing chip. The visit and invoice rows. */
export function SkRow({ i = 0 }: { i?: number }) {
  return (
    <Card as="li" className="p-4">
      <div className="flex items-center gap-3.5">
        <Disc className="h-10 w-10" i={i} />
        <div className="min-w-0 flex-1 space-y-2">
          <Bar className="h-4 w-32" i={i} />
          <Bar className="h-3 w-20" i={i + 1} />
        </div>
        <Bar className="h-6 w-20 rounded-full" i={i + 1} />
      </div>
    </Card>
  );
}

/** `count` list rows, staggered. */
export function SkRows({ count = 4 }: { count?: number }) {
  return (
    <ul className="space-y-2.5">
      {Array.from({ length: count }, (_, i) => (
        <SkRow key={i} i={Math.min(i, 6)} />
      ))}
    </ul>
  );
}

/** A block of copy inside a card — the shape of a prose section. */
export function SkCard({
  lines = 3,
  className = "p-5",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <Card className={className}>
      <div className="space-y-2.5">
        <Bar className="h-4 w-40" />
        {Array.from({ length: lines }, (_, i) => (
          <Bar
            key={i}
            i={i + 1}
            className={`h-3 ${i === lines - 1 ? "w-1/2" : "w-full"}`}
          />
        ))}
      </div>
    </Card>
  );
}

/** The dashboard's four-cell action tray, drawn empty. */
export function SkTray() {
  return (
    <div className="-mt-9 grid grid-cols-4 divide-x divide-line overflow-hidden rounded-3xl border border-line bg-elev shadow-card">
      {Array.from({ length: 4 }, (_, i) => (
        <div
          key={i}
          className="flex min-h-[88px] flex-col items-center justify-center gap-2.5 px-1"
        >
          <Disc className="h-9 w-9" i={i + 1} />
          <Bar className="h-2.5 w-12" i={i + 1} />
        </div>
      ))}
    </div>
  );
}

/** A section heading plus its optional trailing link. */
export function SkSectionHead() {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <Bar className="h-4 w-32" />
      <Bar className="h-3 w-16" i={1} />
    </div>
  );
}
