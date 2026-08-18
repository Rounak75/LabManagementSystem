/**
 * Turns a failed `Response` into a sentence a staff member can act on.
 *
 * The forms here used to do `throw new Error(await r.text())` and render the
 * result, so whatever the route happened to return was shown at the counter:
 * a bare code (`{"error":"unauthorized"}`), a Zod `flatten()` object, or — from
 * the routes that pass a Supabase failure straight through — a raw Postgres
 * string like `duplicate key value violates unique constraint "patients_phone_key"`.
 *
 * The rule here is that a message is only ever shown if this module wrote it.
 * Anything unrecognised becomes status-based copy, and the original text goes to
 * the console so it is still diagnosable.
 */

const BY_CODE: Record<string, string> = {
  unauthorized: "Your session has ended. Sign in again to continue.",
  forbidden: "Only an Admin can do that.",
  result_locked: "This test is verified and locked — ask an Admin to unlock it.",
  not_found: "That record no longer exists. Go back and reload the list.",
  bad_json: "Something was wrong with the form. Check the fields and try again.",
  rate_limited: "Too many attempts. Wait a moment and try again.",
};

const BY_STATUS: Record<number, string> = {
  400: "Some details were not accepted. Check the fields and try again.",
  401: "Your session has ended. Sign in again to continue.",
  403: "Only an Admin can do that.",
  404: "That record no longer exists. Go back and reload the list.",
  409: "Someone else changed this while you were working. Reload and try again.",
  429: "Too many attempts. Wait a moment and try again.",
};

const SERVER_SIDE = "The lab server could not complete that. Try again in a moment.";

/** A short snake_case token is a code; anything with spaces is prose we did not write. */
const looksLikeCode = (s: string) => /^[a-z][a-z0-9_]{2,40}$/.test(s);

export async function messageForFailure(r: Response, fallback: string): Promise<string> {
  let raw = "";
  let code: string | undefined;

  try {
    raw = await r.text();
    const parsed = JSON.parse(raw) as { code?: unknown; error?: unknown };
    if (typeof parsed.code === "string") code = parsed.code;
    else if (typeof parsed.error === "string" && looksLikeCode(parsed.error)) code = parsed.error;

    // The one raw-database case worth translating: re-registering a patient whose
    // phone number is already on file is a normal counter mistake, not a fault.
    if (!code && typeof parsed.error === "string" && /duplicate key|already exists/i.test(parsed.error)) {
      if (/phone/i.test(parsed.error)) {
        return "A patient with this phone number is already registered. Search for them instead.";
      }
      return "That record already exists.";
    }
  } catch {
    // Not JSON. Nothing here is safe to show.
  }

  if (raw) {
    // Keep the real text reachable without putting it in front of the lab.
    console.error(`[api ${r.status}]`, raw);
  }

  if (code && BY_CODE[code]) return BY_CODE[code];
  if (BY_STATUS[r.status]) return BY_STATUS[r.status];
  if (r.status >= 500) return SERVER_SIDE;
  return fallback;
}
