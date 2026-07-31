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

/**
 * A calendar day the lab picked — a closure, a preferred collection date.
 *
 * These are stored as UTC midnight of the intended day, so the formatting has
 * to be pinned to UTC as well. Left to the runtime's own zone, the same row
 * renders as one day on a UTC server and the day before on anything west of
 * it, which is the sort of bug that only shows up after deploying.
 */
export function labDate(
  value: string | Date,
  opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" },
): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { ...opts, timeZone: "UTC" });
}
