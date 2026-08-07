import { NextResponse } from "next/server";

const MESSAGES: Record<string, string> = {
  bad_json: "The request was malformed.",
  invalid_phone: "Enter a valid 10-digit phone number.",
  // Deliberately vague, and the same for a wrong id, a wrong password and a
  // mismatched phone: naming which half was wrong would confirm to someone
  // counting through ids that a given one exists.
  invalid_code: "Those sign-in details are incorrect.",
  no_patient_found: "No patient found for that phone number.",
  account_locked: "Your account is temporarily locked. Please try again later.",
  unauthorized: "Please log in to continue.",
  not_found: "We couldn't find what you were looking for.",
  rate_limited: "Too many attempts. Please wait a moment and try again.",
};

const GENERIC = "Something went wrong. Please try again.";

/** Consistent error response: { error: { code, message } } with the given HTTP status. */
export function apiError(code: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message: MESSAGES[code] ?? GENERIC } }, { status });
}

/** Consistent success response. */
export function apiOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}
