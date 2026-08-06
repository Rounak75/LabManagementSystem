// The calendar day the lab means, written the way a patient reads it.
//
// This existed three times — triggers.ts, sms.sender.ts and email.sender.ts each
// carried their own `d.toLocaleDateString("en-IN", { day, month, year })` — and
// all three were wrong in the same two ways.
//
// 1. The format was whatever ICU the runtime shipped. CLDR changed en-IN's
//    day/short-month/year form from "12 May 2026" to "12-May-2026", so the same
//    call renders differently depending on the Node build. The admin and portal
//    apps were fixed for exactly this (see their `formatDateShort` / `labDate`);
//    the desktop's notification path was missed. The month is spelled out here
//    so a runtime upgrade cannot change what a patient is told.
//
// 2. There was no time zone, so the day came from whatever zone the machine was
//    set to. A visit stored as UTC midnight rendered as the *previous* day on
//    any machine west of UTC, which is how emailSender.test.ts fails under
//    TZ=America/Los_Angeles. The lab is in Jamshedpur, so the day it means is
//    the IST day, and that is what a patient is told regardless of the clock on
//    the PC sending the message.

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * IST is a fixed +5:30 with no daylight saving, so shifting by the offset and
 * reading the UTC fields gives the IST calendar day exactly — no Intl, and
 * nothing that varies with the host.
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * A visit or collection date as "12 May 2026", in the lab's own time zone.
 *
 * Days are unpadded, matching what the notification templates have always
 * rendered. Returns "" for an unusable date rather than "Invalid Date", which
 * is not something to send a patient.
 */
export function labDate(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";

  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return `${ist.getUTCDate()} ${SHORT_MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}`;
}
