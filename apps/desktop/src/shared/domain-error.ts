/**
 * Every failure the lab computer can name, and the words it says.
 *
 * A domain error crosses the IPC seam as an `Error` whose message is its code —
 * that wire convention is unchanged. What changed is that the code is no longer
 * a bare string matched by a regex: it is a key of this table, so a code with no
 * wording is a compile error rather than a raw `STALE_VERSION` on a screen in
 * front of a patient.
 *
 * The table is the single source of the union. Derive, don't declare:
 * `DomainCode` is `keyof typeof DOMAIN_MESSAGES`, which makes it impossible to
 * add a code without also writing the sentence a human reads.
 *
 * Wording is addressed to lab staff and the owner, not to a developer. It says
 * what happened and what to do next, and never names a table, a column or a
 * library.
 */
export const DOMAIN_MESSAGES = {
  // session + permission
  UNAUTHENTICATED: "Please log in.",
  UNAUTHORIZED: "You don't have permission for this action.",
  FORBIDDEN: "You don't have permission for this action.",
  INVALID_CREDENTIALS: "Username or password is incorrect.",
  INVALID_PASSWORD: "Password incorrect.",
  INVALID_RECOVERY_CODE: "That recovery code is wrong.",
  ADMIN_LOCKOUT_PROTECTED: "You can't disable yourself while you're the only Admin.",

  // general
  NOT_FOUND: "Record not found.",
  INVALID_INPUT: "Some fields are invalid.",
  INVALID_STATE: "That action isn't allowed in the current state.",
  INTERNAL_ERROR: "Something went wrong on the lab computer. Please try again.",
  FILE_TOO_LARGE: "File is too large (max 256 KB).",
  REASON_REQUIRED: "A reason is required (at least 10 characters).",
  STALE_VERSION:
    "Someone else updated these results since you opened the page. Reload and try again.",

  // patients
  DUPLICATE_PHONE: "A patient with that phone number already exists.",
  INVALID_PHONE:
    "Invalid phone number — enter the 10-digit mobile number, starting with 6, 7, 8 or 9.",
  PATIENT_HAS_VISITS: "Cancel the patient's visits first, then delete the patient.",

  // staff accounts
  DUPLICATE_USERNAME: "Username is already taken.",
  USER_HAS_HISTORY:
    "This user has activity in the audit log — disable them instead of deleting.",

  // tests + parameters
  DUPLICATE_TEST_NAME: "A test with that name already exists.",
  PARAMETER_HAS_RESULTS:
    "Parameter is used by existing results — deactivate instead of removing.",
  EMPTY_PARAMETERS: "Some parameters have no value.",

  // visits + results
  VISIT_DELETED: "This visit has been cancelled.",
  VISIT_HAS_LOCKED_RESULTS: "This visit has verified results — cannot cancel.",
  VISIT_INVOICE_PAID: "Invoice is paid — refund the invoice first.",

  // invoices
  ALREADY_CANCELLED: "This invoice has already been cancelled.",
  // Kept only so an older renderer still shows words, not a code: unlocking no
  // longer depends on the invoice, and the message told the owner to do
  // something the app could not do.
  INVOICE_PAID_BEFORE_UNLOCK:
    "The invoice is paid — cancel it first before unlocking results.",

  // bookings
  ALREADY_CONVERTED: "That booking has already been turned into a visit.",
  PHONE_CONFIRM_REQUIRED:
    "Record whether you reached the patient on the phone before approving.",

  // report templates
  NO_TEMPLATE:
    "No report template is set. Choose a default template in Settings first.",
  TEMPLATE_IN_USE: "Can't delete a template that's set as default.",
  INVALID_TEMPLATE_CONFIG:
    "That report template can't be read. Open it in Settings and save it again.",

  // notifications
  NOT_FAILED: "That message hasn't failed, so there's nothing to retry.",
  ALREADY_SENT: "That message has already been sent — it can't be cancelled now.",
  CANCEL_FAILED: "Couldn't cancel that message. Please try again.",

  // payments
  RAZORPAY_DISABLED:
    "Online payments are switched off. Turn them on in Settings to use payment links.",
  RAZORPAY_NOT_CONFIGURED:
    "Online payments aren't set up yet. Add your Razorpay keys in Settings first.",

  // backup + cloud
  BACKUP_PATH_UNREACHABLE: "Couldn't write to the secondary backup location.",
  SECRET_UNREADABLE:
    "Stored secret can't be read (probably from an old app version). Please re-enter it and click Save.",
  CLOUD_NOT_CONFIGURED:
    "Cloud sync isn't fully configured yet. Fill in all three Supabase fields and click Save first.",
} as const satisfies Record<string, string>;

/** A failure this app can name. Every one of these has wording above. */
export type DomainCode = keyof typeof DOMAIN_MESSAGES;

/**
 * Build a domain error to throw.
 *
 * Returns the `Error` rather than throwing it so call sites keep writing
 * `throw domainError("NOT_FOUND")`. Keeping the `throw` at the call site means
 * TypeScript's control-flow narrowing is completely unaffected — a helper that
 * threw internally would need a `never` return to narrow, and would change how
 * every guard after it reads.
 */
export function domainError(code: DomainCode): Error {
  return new Error(code);
}

/** Whether a thrown message is one of our codes, rather than free text. */
export function isDomainCode(value: unknown): value is DomainCode {
  return typeof value === "string" && Object.hasOwn(DOMAIN_MESSAGES, value);
}

/** The sentence shown for a code. */
export function messageForCode(code: DomainCode): string {
  return DOMAIN_MESSAGES[code];
}
