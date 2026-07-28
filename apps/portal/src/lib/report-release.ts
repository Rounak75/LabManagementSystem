// When a result may be shown to a patient.
//
// Two independent things have to be true before a patient can download their
// report, and they fail for different reasons and need different words:
//
//  1. Every test in the visit has been verified and locked by an Admin. Until
//     then the value is a draft a staff member may still be typing, and the PDF
//     carries the pathologist's name and qualifications — releasing an unverified
//     value presents a draft as an authorised result.
//  2. The bill has been settled. The lab's money used to depend on the patient
//     coming back to the counter; the portal handed over the PDF regardless.
//
// Both rules live here rather than in each caller so the PDF endpoint and the
// visit page cannot drift apart on what counts as "ready". The physical print on
// the desktop is deliberately NOT gated: the owner is standing in the lab and
// knows the patient, and blocking a legitimate handover is worse than the money
// risk the gate exists to manage.

export interface LockableTest {
  is_locked?: boolean | null;
}

/** The money side of the gate. Absent when the visit was never billed. */
export interface ReleaseInvoice {
  total?: number | string | null;
  amount_paid?: number | string | null;
}

export type ReportReleaseState =
  /** Verified and settled — hand over the PDF. */
  | { released: true }
  /** Not every test is verified and locked yet. */
  | { released: false; reason: "not_verified" }
  /** Verified, but the patient still owes money. */
  | { released: false; reason: "unpaid"; balance: number };

/** True when this individual test has been verified and locked. */
export function isTestReleasable(visitTest: LockableTest): boolean {
  // Nullable on clouds predating the column; anything other than an explicit
  // true is treated as unlocked, so the failure mode is withholding a report
  // rather than releasing a draft.
  return visitTest.is_locked === true;
}

/**
 * True when every test in the visit is verified and locked. An empty visit is
 * withheld — there is nothing signed off to report.
 *
 * This is only the verification half of the gate; use `reportReleaseState` to
 * decide whether a patient may actually download the PDF.
 */
export function isReportReleasable(visitTests: LockableTest[] | null | undefined): boolean {
  if (!visitTests || visitTests.length === 0) return false;
  return visitTests.every(isTestReleasable);
}

/** What is still owed on a visit. Never negative — an overpayment is not a debt. */
export function outstandingBalance(invoice: ReleaseInvoice | null | undefined): number {
  if (!invoice) return 0;
  const total = Number(invoice.total ?? 0);
  const paid = Number(invoice.amount_paid ?? 0);
  if (!Number.isFinite(total) || !Number.isFinite(paid)) return 0;
  return Math.max(0, total - paid);
}

/**
 * Whether this visit's report may be handed to the patient, and if not, why.
 *
 * `overridden` is the Admin's per-visit decision to release an unpaid report
 * anyway — for a regular, or a patient the lab has extended credit to. It skips
 * the money check but never the verification check: releasing an unverified
 * result is a clinical problem, not a commercial one, and is not the owner's to
 * waive from a "release anyway" button.
 *
 * A visit with no invoice is treated as owing nothing. The lab never billed it,
 * so there is nothing to collect, and withholding the report would punish the
 * patient for the lab's own omission.
 */
export function reportReleaseState(
  visitTests: LockableTest[] | null | undefined,
  invoice: ReleaseInvoice | null | undefined,
  overridden: boolean | null | undefined = false,
): ReportReleaseState {
  if (!isReportReleasable(visitTests)) return { released: false, reason: "not_verified" };
  if (overridden === true) return { released: true };

  const balance = outstandingBalance(invoice);
  if (balance > 0) return { released: false, reason: "unpaid", balance };

  return { released: true };
}
