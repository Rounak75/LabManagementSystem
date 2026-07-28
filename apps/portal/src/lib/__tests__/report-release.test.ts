import { describe, it, expect } from "vitest";
import {
  isReportReleasable,
  isTestReleasable,
  outstandingBalance,
  reportReleaseState,
} from "../report-release";

describe("isTestReleasable", () => {
  it("releases a verified and locked test", () => {
    expect(isTestReleasable({ is_locked: true })).toBe(true);
  });

  it("withholds a test that is not locked", () => {
    expect(isTestReleasable({ is_locked: false })).toBe(false);
  });

  it("withholds a test whose lock flag is null (cloud predating the column)", () => {
    expect(isTestReleasable({ is_locked: null })).toBe(false);
  });

  it("withholds a test whose lock flag is missing entirely", () => {
    expect(isTestReleasable({})).toBe(false);
  });
});

describe("isReportReleasable", () => {
  it("releases when every test is locked", () => {
    expect(isReportReleasable([{ is_locked: true }, { is_locked: true }])).toBe(true);
  });

  it("withholds when any test is still unlocked", () => {
    expect(isReportReleasable([{ is_locked: true }, { is_locked: false }])).toBe(false);
  });

  // An empty visit has nothing signed off, so there is no report to release.
  // Treating it as releasable would emit a pathologist-signed PDF with no results.
  it("withholds a visit with no tests", () => {
    expect(isReportReleasable([])).toBe(false);
  });

  it("withholds when the test list is missing", () => {
    expect(isReportReleasable(undefined)).toBe(false);
  });
});

describe("outstandingBalance", () => {
  it("is what is left of the total after payments", () => {
    expect(outstandingBalance({ total: 500, amount_paid: 300 })).toBe(200);
  });

  it("is zero once the bill is settled", () => {
    expect(outstandingBalance({ total: 500, amount_paid: 500 })).toBe(0);
  });

  // Postgres NUMERIC comes back as a string through PostgREST, so a naive
  // subtraction would produce NaN and the gate would misjudge every visit.
  it("handles numeric columns arriving as strings", () => {
    expect(outstandingBalance({ total: "500", amount_paid: "120.50" })).toBe(379.5);
  });

  it("treats an overpayment as nothing owed rather than a negative debt", () => {
    expect(outstandingBalance({ total: 500, amount_paid: 600 })).toBe(0);
  });

  it("treats a visit with no invoice as owing nothing", () => {
    expect(outstandingBalance(null)).toBe(0);
  });
});

describe("reportReleaseState", () => {
  const verified = [{ is_locked: true }, { is_locked: true }];
  const draft = [{ is_locked: true }, { is_locked: false }];

  it("releases a verified, fully paid report", () => {
    expect(reportReleaseState(verified, { total: 500, amount_paid: 500 })).toEqual({ released: true });
  });

  it("withholds an unverified report even when it is paid for", () => {
    expect(reportReleaseState(draft, { total: 500, amount_paid: 500 })).toEqual({
      released: false,
      reason: "not_verified",
    });
  });

  // The lab's money used to depend on the patient coming back to the counter —
  // the portal handed over the PDF whether or not they had paid.
  it("withholds a verified report while money is still owed, and says how much", () => {
    expect(reportReleaseState(verified, { total: 500, amount_paid: 300 })).toEqual({
      released: false,
      reason: "unpaid",
      balance: 200,
    });
  });

  it("releases a verified report for a visit that was never billed", () => {
    expect(reportReleaseState(verified, null)).toEqual({ released: true });
  });

  it("releases an unpaid report when an Admin has overridden the visit", () => {
    expect(reportReleaseState(verified, { total: 500, amount_paid: 0 }, true)).toEqual({
      released: true,
    });
  });

  // Releasing an unverified result is a clinical problem, not a commercial one.
  // The override waives the bill, never the pathologist's sign-off.
  it("does not let the override release an unverified report", () => {
    expect(reportReleaseState(draft, { total: 500, amount_paid: 500 }, true)).toEqual({
      released: false,
      reason: "not_verified",
    });
  });

  it("withholds an unpaid report when the override is absent or false", () => {
    const unpaid = { total: 500, amount_paid: 0 };
    expect(reportReleaseState(verified, unpaid, false)).toMatchObject({ reason: "unpaid" });
    expect(reportReleaseState(verified, unpaid, null)).toMatchObject({ reason: "unpaid" });
    expect(reportReleaseState(verified, unpaid)).toMatchObject({ reason: "unpaid" });
  });
});
