// The one way this app writes a date.
//
// Every date the desktop showed or sent went through toLocaleDateString /
// toLocaleString, which has two faults the lab has already been bitten by.
//
// 1. The format is whatever ICU the runtime ships. CLDR changed en-IN's
//    day/short-month/year form from "12 May 2026" to "12-May-2026", so the same
//    call renders differently on different Node builds — c97b46a took these out
//    of the admin and portal apps for exactly that reason.
//
// 2. There is no time zone, so the day comes from whatever the machine's clock
//    is set to. A date stored as UTC midnight renders as the day before
//    anywhere west of UTC.
//
// The lab is in Jamshedpur, so the day it means is the IST day. IST is a fixed
// +5:30 with no daylight saving, so shifting by the offset and reading the UTC
// fields gives that day exactly — no Intl, and nothing that moves under a
// runtime upgrade.

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The date shifted into IST, or null when it is not a usable date. */
function toIst(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + IST_OFFSET_MS);
}

/**
 * A calendar day as "12 May 2026".
 *
 * Days are unpadded, matching what the notification templates have always
 * rendered. Returns "" rather than "Invalid Date" for anything unusable — that
 * is not a string to put in front of a patient or on a report.
 */
export function labDate(value: Date | string | number | null | undefined): string {
  const ist = toIst(value);
  if (!ist) return "";
  return `${ist.getUTCDate()} ${SHORT_MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}`;
}

/**
 * A moment as "12 May 2026, 3:04 pm", or with seconds for the log views where
 * the exact second is what someone is reading the row for.
 */
export function labDateTime(
  value: Date | string | number | null | undefined,
  opts: { seconds?: boolean } = {},
): string {
  const ist = toIst(value);
  if (!ist) return "";

  const hours24 = ist.getUTCHours();
  const suffix = hours24 < 12 ? "am" : "pm";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const minutes = String(ist.getUTCMinutes()).padStart(2, "0");

  let time = `${hours12}:${minutes}`;
  if (opts.seconds) time += `:${String(ist.getUTCSeconds()).padStart(2, "0")}`;

  return `${labDate(value)}, ${time} ${suffix}`;
}
