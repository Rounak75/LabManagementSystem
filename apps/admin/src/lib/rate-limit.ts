// A small in-memory rate limiter for the admin app.
//
// Much smaller than the portal's (`apps/portal/src/lib/rate-limit.ts`) and
// deliberately so: everything reachable here is behind a staff session, and the
// lab has three of those. There is no anonymous flood to defend against, and no
// case for spending a database round trip to count one.
//
// What it is actually for is the accident rather than the attacker: a component
// that throws on every render, an error reporter wired into it, and a client
// that then posts a row per render for as long as the tab is open. That fills a
// free-tier table overnight, and the first anyone knows is a quota email.

export interface Limit {
  windowSeconds: number;
  max: number;
}

/** Hit timestamps per key. */
const hits = new Map<string, number[]>();

/**
 * Keys tracked before the map is swept. There are only ever a handful of staff,
 * so this is a guard against a bug rather than against volume.
 */
const MAX_TRACKED_KEYS = 1_000;

/**
 * Whether this caller is still inside its budget.
 *
 * Per-instance, so the real ceiling is this number times however many serverless
 * instances are warm. Fine for what it is for — see the note at the top.
 */
export function withinLimit(
  key: string,
  { windowSeconds, max }: Limit,
  now: number = Date.now(),
): boolean {
  if (hits.size > MAX_TRACKED_KEYS) hits.clear();

  const recent = (hits.get(key) ?? []).filter((t) => t > now - windowSeconds * 1000);
  recent.push(now);
  hits.set(key, recent);

  return recent.length <= max;
}

/** Test seam: forget everything counted so far. */
export function resetLimits(): void {
  hits.clear();
}
