"use client";

// Feedback at the point of the tap.
//
// Skeletons cover the wait *after* a navigation commits, but there is still a
// moment between the finger landing and the router having anything to show —
// short on wifi, not always short on the mobile data most of this lab's
// patients are using. Without a signal there, a tile reads as broken and gets
// tapped again.
//
// `useLinkStatus` reports the pending state of the enclosing `<Link>`. Keeping
// it in a leaf like this is deliberate: the pages that use it — the landing
// page, the dashboard — stay server components, which they would not if the
// hook lived on the tile itself.

import { useLinkStatus } from "next/link";

/**
 * Renders a sweep across the enclosing `<Link>` while its route loads.
 *
 * Requires a `relative overflow-hidden` parent; every surface this is used on
 * already has both, since they all clip the `.sheen` highlight.
 */
export function LinkPending({ onBand = false }: { onBand?: boolean }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span aria-hidden className={`link-pending ${onBand ? "link-pending-band" : ""}`} />
  );
}
