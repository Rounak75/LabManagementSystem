// Per-address throttling for the login route.
//
// `record_failed_patient_login` already stops someone guessing at one patient's
// code. It does nothing about the other shape of the attack: one guess against
// each of thousands of phone numbers, which never trips any single account's
// counter and also tells the attacker which numbers are registered patients.
// That needs counting by origin rather than by account.
//
// The counter feeds the captcha the /book form already uses, rather than a hard
// block: a shared clinic or college NAT puts many legitimate patients behind one
// address, and locking that address out would lock out the ward.

import { createHmac } from "node:crypto";
import { getServiceClient } from "./supabase-server";

/** Failures from one address before a puzzle is required. */
export const CAPTCHA_AFTER_FAILURES = 2;

/** How far back failures are counted. */
export const FAILURE_WINDOW_MINUTES = 15;

export function captchaRequired(recentFailures: number): boolean {
  return recentFailures >= CAPTCHA_AFTER_FAILURES;
}

/**
 * Keyed digest of an address.
 *
 * The table this feeds would otherwise be a log of who tried to sign in from
 * where. A plain hash would not help — the entire IPv4 space is four billion
 * digests — so the project's server secret is mixed in, making the table
 * useless to anyone who does not also hold that secret.
 */
export function hashIp(ip: string, secret: string): string {
  return createHmac("sha256", secret).update(ip).digest("hex");
}

/**
 * The address key for a request, or null when the platform gave us nothing.
 *
 * `x-forwarded-for` is a chain — the client is the first entry and each proxy
 * appends itself — so the front of the list is the one to count. `x-real-ip` is
 * set by the platform itself and is preferred where present.
 */
export function clientIpKey(headers: Headers, secret: string): string | null {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return hashIp(realIp, secret);

  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return hashIp(first, secret);

  return null;
}

/**
 * Failures recorded for this origin inside the window.
 *
 * Throttling must never be the reason a patient cannot reach their results, so
 * a database that is unreachable or an RPC that has not been migrated yet reads
 * as "no failures" and login proceeds normally.
 */
export async function recentFailuresForOrigin(ipKey: string): Promise<number> {
  try {
    const { data } = await getServiceClient().rpc("count_failed_logins_origin", {
      p_ip_key: ipKey,
      p_window_minutes: FAILURE_WINDOW_MINUTES,
    });
    return Number(data ?? 0);
  } catch {
    return 0;
  }
}

export async function recordFailureForOrigin(ipKey: string): Promise<void> {
  try {
    await getServiceClient().rpc("record_failed_login_origin", {
      p_ip_key: ipKey,
      p_window_minutes: FAILURE_WINDOW_MINUTES,
    });
  } catch {
    // Best effort — never turn a bookkeeping problem into a failed login.
  }
}

export async function clearFailuresForOrigin(ipKey: string): Promise<void> {
  try {
    await getServiceClient().rpc("clear_failed_logins_origin", { p_ip_key: ipKey });
  } catch {
    // As above.
  }
}
