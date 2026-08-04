// What a phone number has to look like before the lab will store it.
//
// Indian mobile numbers are ten digits and begin 6, 7, 8 or 9 — the 0–5 ranges
// are landline trunk prefixes and service codes, none of which can receive the
// confirmation call or an SMS. A number in that shape is always a typo, so it
// is worth refusing at the point of entry rather than discovering it when the
// phlebotomist cannot reach the patient.
//
// The same rule lives in @lab/types for the desktop and admin apps. The portal
// deploys separately and does not depend on that package, so the rule is stated
// twice on purpose; keep them in step.

export const MOBILE_RE = /^[6-9]\d{9}$/;

/** The message shown wherever a number fails the rule. */
export const INVALID_PHONE_MESSAGE =
  "Invalid phone number — enter the 10-digit mobile number, starting with 6, 7, 8 or 9.";

export function isValidMobile(phone: string): boolean {
  return MOBILE_RE.test(phone);
}
