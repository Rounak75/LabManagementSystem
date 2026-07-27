// When a result may be shown to a patient.
//
// A result is only releasable once its visit test has been verified and locked by
// an Admin. Until then the value is a draft a staff member may still be typing.
// The patient-facing PDF carries the pathologist's name and qualifications, so
// releasing an unverified value presents a draft as an authorised result.
//
// This rule lives here rather than in each caller so the PDF endpoint and the
// visit page cannot drift apart on what counts as "ready".

export interface LockableTest {
  is_locked?: boolean | null;
}

/** True when this individual test has been verified and locked. */
export function isTestReleasable(visitTest: LockableTest): boolean {
  // Nullable on clouds predating the column; anything other than an explicit
  // true is treated as unlocked, so the failure mode is withholding a report
  // rather than releasing a draft.
  return visitTest.is_locked === true;
}

/**
 * True when the whole visit's report may be released: it has at least one test
 * and every one of them is verified and locked. An empty visit is withheld —
 * there is nothing signed off to report.
 */
export function isReportReleasable(visitTests: LockableTest[] | null | undefined): boolean {
  if (!visitTests || visitTests.length === 0) return false;
  return visitTests.every(isTestReleasable);
}
