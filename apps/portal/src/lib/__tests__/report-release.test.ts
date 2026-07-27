import { describe, it, expect } from "vitest";
import { isReportReleasable, isTestReleasable } from "../report-release";

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
