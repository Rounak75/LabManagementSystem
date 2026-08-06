import { describe, it, expect } from "vitest";
import { labDate, localWeekday, localMonth, clockTime } from "../format";

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

/**
 * The booking rail builds its own local dates — `ymd()` is deliberately local
 * so the patient is never offered yesterday before 5:30am IST. These label
 * those same dates, so they read local fields too, unlike labDate.
 */
describe("localWeekday / localMonth", () => {
  it("names the weekday and month of the local date it is given", () => {
    const d = new Date(2026, 4, 20); // 20 May 2026, local midnight — a Wednesday
    expect(localWeekday(d)).toBe("Wed");
    expect(localMonth(d)).toBe("May");
  });

  it("labels the day the rail would book, not the UTC one", () => {
    // Local midnight on the 1st. Anywhere east of UTC this instant is still the
    // previous month in UTC, and a UTC read would label the button "Apr".
    const d = new Date(2026, 5, 1); // 1 June 2026 — a Monday
    expect(localMonth(d)).toBe("Jun");
    expect(localWeekday(d)).toBe("Mon");
  });

  it("renders nothing for an unusable date", () => {
    expect(localWeekday(new Date("nonsense"))).toBe("");
    expect(localMonth(new Date("nonsense"))).toBe("");
  });
});

/**
 * The lockout time is read in the patient's own zone on purpose — it answers
 * "when may I try again", and that is their clock. Only the format is pinned.
 */
describe("clockTime", () => {
  it("writes a 12-hour time with a lowercase suffix", () => {
    expect(clockTime(new Date(2026, 4, 20, 15, 4))).toBe("3:04 pm");
    expect(clockTime(new Date(2026, 4, 20, 9, 5))).toBe("9:05 am");
  });

  it("writes midnight and noon as 12", () => {
    expect(clockTime(new Date(2026, 4, 20, 0, 0))).toBe("12:00 am");
    expect(clockTime(new Date(2026, 4, 20, 12, 0))).toBe("12:00 pm");
  });

  it("renders nothing for an unusable date", () => {
    expect(clockTime("nonsense")).toBe("");
  });
});
