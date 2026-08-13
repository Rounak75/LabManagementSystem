// Per-origin rate limiting for the routes that are not login.
//
// Two backends, and choosing between them is the only decision a caller has to
// make:
//
//   `enforceRateLimit`  — counted in Postgres. Accurate across every serverless
//                         instance. Costs one round trip per request.
//   `memoryRateLimit`   — counted in this instance's memory. Free, and only as
//                         accurate as the number of instances is small.
//
// The rule for picking one: **does an abusive request leave anything behind?**
//
// A booking, a dispute or a payment claim writes a row that a human then has to
// look at. Ten thousand of those is a quota problem and a morning of staff time,
// and deleting the rows afterwards does not give the morning back — so those are
// counted properly, in the database, and paying a round trip to do it is worth
// it. `/api/captcha` and `/api/client-errors` leave nothing behind; the only cost
// of abusing them is the invocation itself, and spending a *database* round trip
// to protect against a wasted invocation makes each abusive request more
// expensive rather than less. Those get the in-memory counter, whose job is to
// blunt a naive flood rather than to be exact.
//
// Both fail open, and for these routes that is close to free: if Supabase is
// unreachable, `/api/bookings` cannot write a booking either. The limiter is not
// the thing standing between an attacker and the database — it is the thing
// standing between them and a *successful* write, and that has already failed.
// (`login-throttle.ts` fails open for a different and weaker reason — that a
// patient must never be locked out of their results by a bookkeeping blip.)

import { NextResponse, type NextRequest } from "next/server";
import { getServiceClient } from "./supabase-server";
import { clientIpKey } from "./login-throttle";

export interface Limit {
  /** How far back hits are counted. */
  windowSeconds: number;
  /** How many are allowed inside that window, inclusive. */
  max: number;
}

/**
 * The budget for each route.
 *
 * Set generously on purpose. A hostel, a clinic or a family share one address —
 * the same reason `login-throttle` answers with a puzzle rather than a block —
 * so these numbers are chosen to sit far above what a room full of real patients
 * would ever do, and still far below what a script does in a second.
 */
export const LIMITS = {
  /** A real patient books once. Ten an hour is a family; a hundred is a script. */
  bookings: { windowSeconds: 3600, max: 10 },
  /** Raised against a specific invoice, and a patient has few. */
  disputes: { windowSeconds: 3600, max: 10 },
  /** "I have paid" — clicked more than once by an anxious patient, not 50 times. */
  paymentClaims: { windowSeconds: 3600, max: 20 },
  /** Cancelling your own booking. */
  bookingCancel: { windowSeconds: 3600, max: 20 },
  /**
   * Proving you know the phone number on a booking.
   *
   * Tighter than the rest, because this one is a guess at a secret rather than
   * an action: ten digits is a small space if you are allowed to keep trying.
   * A patient who booked knows their own number and needs one attempt, or two
   * if they typed it wrong.
   */
  bookingAccess: { windowSeconds: 900, max: 8 },
} as const satisfies Record<string, Limit>;

export type Bucket = keyof typeof LIMITS;

/** What a limiter decided. */
export interface Decision {
  allowed: boolean;
  /** Seconds until there is room again. Only meaningful when refused. */
  retryAfterSeconds: number;
}

/**
 * Counts this request in Postgres and says whether it is allowed.
 *
 * Exported for tests and for callers that want the decision rather than a
 * response; most routes want `enforceRateLimit` below.
 */
export async function checkRateLimit(
  bucket: Bucket,
  ipKey: string,
  limit: Limit = LIMITS[bucket],
): Promise<Decision> {
  try {
    const { data } = await getServiceClient().rpc("hit_rate_limit", {
      p_bucket: bucket,
      p_ip_key: ipKey,
      p_window_seconds: limit.windowSeconds,
      p_max: limit.max,
    });
    const row = data as { allowed?: boolean; retry_after_seconds?: number } | null;
    // A migration that has not been applied yet returns nothing rather than
    // throwing. Treated as "allowed", like any other failure to count.
    if (!row || typeof row.allowed !== "boolean") return { allowed: true, retryAfterSeconds: 0 };
    return {
      allowed: row.allowed,
      retryAfterSeconds: Number(row.retry_after_seconds ?? limit.windowSeconds),
    };
  } catch {
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

/**
 * The response a refused caller gets, or `null` to carry on.
 *
 * Shaped so a route reads:
 *
 * ```ts
 * const limited = await enforceRateLimit("bookings", req);
 * if (limited) return limited;
 * ```
 *
 * A request the platform gave us no address for is allowed through. That is not
 * a hole worth closing by refusing: it would mean an infrastructure change that
 * drops `x-forwarded-for` takes the whole portal down rather than degrading it,
 * and the routes behind this all have their own authentication or captcha.
 */
export async function enforceRateLimit(
  bucket: Bucket,
  req: NextRequest,
): Promise<NextResponse | null> {
  const ipKey = clientIpKey(req.headers, process.env.SUPABASE_JWT_SECRET ?? "");
  if (!ipKey) return null;

  const { allowed, retryAfterSeconds } = await checkRateLimit(bucket, ipKey);
  if (allowed) return null;

  return tooManyRequests(retryAfterSeconds);
}

/**
 * A 429 that says when to come back.
 *
 * The message is written for a patient rather than a developer, because on this
 * app a real person hitting a limit is far more likely to be someone tapping a
 * stuck button twenty times than an attacker.
 */
export function tooManyRequests(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: "rate_limited",
        message: "That is a lot of requests in a short time. Please wait a moment and try again.",
      },
    },
    { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterSeconds)) } },
  );
}

// ---------------------------------------------------------------------------
// In-memory counter, for routes where a database round trip would cost more
// than the abuse it prevents.
// ---------------------------------------------------------------------------

/** Hit timestamps per key. Trimmed on read; see `memoryRateLimit`. */
const memoryHits = new Map<string, number[]>();

/**
 * Keys tracked before the map is swept. Without a ceiling the map itself is the
 * amplification: one request per forged address grows it without bound, which
 * turns a rate limiter into a memory exhaustion bug.
 */
const MAX_TRACKED_KEYS = 10_000;

/**
 * Counts this request in this instance's memory.
 *
 * Deliberately not exact. Serverless instances do not share memory, so traffic
 * spread across instances is counted separately and the real ceiling is this
 * number times however many instances are warm. That is fine for what it is
 * for: stopping one client hammering one endpoint in a loop, on routes where
 * being wrong costs an invocation and nothing else.
 */
export function memoryRateLimit(
  bucket: string,
  ipKey: string,
  { windowSeconds, max }: Limit,
  now: number = Date.now(),
): Decision {
  const key = `${bucket}:${ipKey}`;
  const cutoff = now - windowSeconds * 1000;

  if (memoryHits.size > MAX_TRACKED_KEYS) memoryHits.clear();

  const hits = (memoryHits.get(key) ?? []).filter((t) => t > cutoff);
  hits.push(now);
  memoryHits.set(key, hits);

  if (hits.length <= max) return { allowed: true, retryAfterSeconds: 0 };

  const oldest = hits[0] ?? now;
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowSeconds * 1000 - now) / 1000)),
  };
}

/**
 * Budgets for the routes that leave nothing behind.
 *
 * Higher than the database-backed ones because these are hit in the ordinary
 * course of using the site — `/api/captcha` fires on every load of /book and
 * /login — so the number has to sit above a patient reloading a page repeatedly
 * on a bad connection.
 */
export const MEMORY_LIMITS = {
  captcha: { windowSeconds: 60, max: 60 },
  clientErrors: { windowSeconds: 60, max: 30 },
} as const satisfies Record<string, Limit>;

export type MemoryBucket = keyof typeof MEMORY_LIMITS;

/**
 * The in-memory equivalent of `enforceRateLimit`: a 429 to return, or `null`.
 *
 * Takes plain `Headers` rather than a `NextRequest` so it can be called from a
 * route whose handler signature is `(req: Request)`.
 */
export function enforceMemoryRateLimit(
  bucket: MemoryBucket,
  headers: Headers,
): NextResponse | null {
  const ipKey = clientIpKey(headers, process.env.SUPABASE_JWT_SECRET ?? "");
  if (!ipKey) return null;

  const { allowed, retryAfterSeconds } = memoryRateLimit(bucket, ipKey, MEMORY_LIMITS[bucket]);
  return allowed ? null : tooManyRequests(retryAfterSeconds);
}

/** Test seam: forget everything counted so far. */
export function resetMemoryRateLimits(): void {
  memoryHits.clear();
}
