import { describe, it, expect } from "vitest";
import { labDate } from "../format";

/**
 * `labDate` used to go through toLocaleDateString("en-IN"), which renders
 * "20 May" or "20-May" depending on the runtime's ICU. These assertions pin
 * the separator so a Node upgrade cannot quietly restyle every date the
 * patient sees.
 */
describe("labDate", () => {
  const closure = "2026-05-20T00:00:00Z"; // Wednesday

  it("renders day and short month by default", () => {
    expect(labDate(closure)).toBe("20 May");
  });

  it("prefixes the weekday when asked", () => {
    expect(labDate(closure, { weekday: true })).toBe("Wed, 20 May");
  });

  it("appends the year when asked", () => {
    expect(labDate(closure, { year: true })).toBe("20 May 2026");
  });

  it("renders weekday and year together", () => {
    expect(labDate(closure, { weekday: true, year: true })).toBe("Wed, 20 May 2026");
  });

  it("accepts a Date as well as a string", () => {
    expect(labDate(new Date(closure), { year: true })).toBe("20 May 2026");
  });

  it("reads the stored UTC day rather than the viewer's", () => {
    // The client renders this in the patient's own browser. Read locally,
    // UTC midnight is still the 19th anywhere west of UTC — and the patient
    // would be told to come a day early.
    expect(labDate("2026-05-20T00:00:00Z", { weekday: true })).toBe("Wed, 20 May");
  });

  it("renders nothing for an unparseable date", () => {
    expect(labDate("not a date")).toBe("");
  });
});
