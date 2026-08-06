export function formatINR(amount: number): string {
  const rounded = Math.round(amount);
  return "₹" + rounded.toLocaleString("en-IN");
}
export function formatPhone(p: string): string {
  if (p?.length === 10) return `${p.slice(0, 5)} ${p.slice(5)}`;
  return p;
}
const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * A calendar day the lab holds — a visit date, a requested collection date —
 * as "20 May 2026".
 *
 * Written out by hand rather than handed to toLocaleDateString("en-IN"). CLDR
 * changed en-IN's day/short-month/year form from "20 May 2026" to
 * "20-May-2026", so the same call renders differently depending on which ICU
 * the runtime happens to ship: one string on a dev machine, another on the
 * build runner, another again whenever Vercel moves its Node. The lab should
 * not see its date format change under it during a runtime upgrade nobody
 * asked for.
 *
 * Read in UTC for the same reason the portal's `labDate` is: these are
 * TIMESTAMPTZ columns holding UTC midnight of the intended day, so a runtime
 * west of UTC would render the day before.
 */
export function formatDateShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${day} ${SHORT_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** IST is a fixed +5:30 with no daylight saving, so the offset can be added and
 *  the UTC fields read straight off. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * A moment something happened — an audit row, a logged client error — as
 * "20 May 2026, 3:04 pm".
 *
 * Read in IST, not UTC, and that difference from `formatDateShort` is the
 * point. Those are date-only columns holding UTC midnight of the day the lab
 * meant. These are real timestamps, and the people reading them are staff
 * standing in the lab.
 *
 * Left to `toLocaleString("en-IN")` this rendered in whatever zone the process
 * happened to be in — UTC when Vercel rendered it on the server, the machine's
 * own zone when the browser did — so the same audit row could read two
 * different times depending on where it was drawn. The format was ICU's to
 * change, too.
 */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  const day = String(ist.getUTCDate()).padStart(2, "0");
  const date = `${day} ${SHORT_MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}`;

  const hours24 = ist.getUTCHours();
  const suffix = hours24 < 12 ? "am" : "pm";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${date}, ${hours12}:${String(ist.getUTCMinutes()).padStart(2, "0")} ${suffix}`;
}
