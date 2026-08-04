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
