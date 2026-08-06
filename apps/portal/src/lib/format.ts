// Presentation-only formatting. Nothing here parses or decides anything —
// it turns values the lab already holds into the shapes a patient reads.

/**
 * "18:00" → "6:00 PM".
 *
 * Lab hours are stored as 24-hour "HH:mm" because that is unambiguous to
 * store and to compare. Patients do not read clocks that way, so the
 * conversion happens at the edge, once, here. Anything that isn't HH:mm is
 * handed back untouched rather than rendered as "NaN:NaN PM".
 */
export function to12Hour(hhmm: string | null | undefined): string {
  if (!hhmm) return "";
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return hhmm;

  const hour = Number(m[1]);
  const minute = m[2];
  if (!Number.isFinite(hour) || hour > 23) return hhmm;

  const suffix = hour < 12 ? "AM" : "PM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${minute} ${suffix}`;
}

/** "08:00"–"13:00" → "8:00 AM – 1:00 PM". */
export function hourRange(from: string | null | undefined, to: string | null | undefined): string {
  return `${to12Hour(from)} – ${to12Hour(to)}`;
}

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const SHORT_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * A calendar day the lab picked — a closure, a preferred collection date.
 * "20 May", or "Wed, 20 May 2026" with the flags on.
 *
 * Read in UTC, because these are stored as UTC midnight of the intended day.
 * Left to the runtime's own zone the same row renders as one day on a UTC
 * server and the day before on anything west of it — and on the client, that
 * zone is the patient's own browser.
 *
 * Built by hand rather than through toLocaleDateString("en-IN"). CLDR changed
 * en-IN's short-month forms from "20 May" to "20-May", so the separator
 * depended on which ICU the runtime happened to ship: the lab saw spaces
 * locally and hyphens on Vercel, and a Node upgrade could flip it back with no
 * change to this repo. The admin app's `formatDateShort` reads the same dates,
 * so the two have to agree.
 *
 * The options are booleans rather than Intl.DateTimeFormatOptions: the old
 * signature advertised the whole Intl surface, and nothing here can honour it.
 */
export function labDate(
  value: string | Date,
  opts: { weekday?: boolean; year?: boolean } = {},
): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";

  const day = String(d.getUTCDate()).padStart(2, "0");
  let out = `${day} ${SHORT_MONTHS[d.getUTCMonth()]}`;
  if (opts.year) out += ` ${d.getUTCFullYear()}`;
  if (opts.weekday) out = `${SHORT_WEEKDAYS[d.getUTCDay()]}, ${out}`;
  return out;
}

/**
 * The weekday and month of a date the browser built for itself.
 *
 * Read in local time, deliberately — the opposite of `labDate`. These label the
 * booking rail's day buttons, whose value comes from a local `ymd()`. Shifting
 * them to UTC would print one day on a button that books another, which is the
 * class of bug the rail has already had once.
 *
 * Written out by hand for the same reason as everything else here: the labels
 * came from toLocaleDateString("en-IN", …), whose output depends on the ICU the
 * browser ships.
 */
export function localWeekday(d: Date): string {
  return Number.isNaN(d.getTime()) ? "" : (SHORT_WEEKDAYS[d.getDay()] ?? "");
}

export function localMonth(d: Date): string {
  return Number.isNaN(d.getTime()) ? "" : (SHORT_MONTHS[d.getMonth()] ?? "");
}

/**
 * A wall-clock time as "3:04 pm".
 *
 * Read in the reader's own zone, deliberately: the only use is telling someone
 * when their login lockout ends, and the clock that answers that is theirs.
 * Only the format is pinned here — toLocaleTimeString("en-IN", …) rendered
 * "pm" or "PM" depending on the runtime.
 */
export function clockTime(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";

  const hours24 = d.getHours();
  const suffix = hours24 < 12 ? "am" : "pm";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(d.getMinutes()).padStart(2, "0")} ${suffix}`;
}
