import { describe, it, expect } from "vitest";
import {
  isOpenNow,
  slotsAvailableOn,
  restrictionForSlots,
  type LabConfig,
} from "../lab-status";

const cfg: LabConfig = {
  morningOpenTime: "08:00",
  morningCloseTime: "13:00",
  eveningOpenTime: "18:00",
  eveningCloseTime: "20:00",
  weeklyHolidays: ["Sunday-Evening"],
  isOpenToday: true,
  manualClosureReason: null,
};

/**
 * An instant, given as the lab's own wall clock.
 *
 * `new Date("2026-05-20T09:30:00")` — no zone — is read as *local* time, so
 * the same literal is a different instant on every machine: 09:30 IST on the
 * lab's laptop, 09:30 UTC (15:00 IST, past morning close) on a CI runner. The
 * offset has to be written down, or these tests only assert that the author
 * happened to be sitting in India.
 */
function ist(wallClock: string): Date {
  return new Date(`${wallClock}+05:30`);
}

describe("lab-status — isOpenNow", () => {
  it("returns true at 09:30 weekday morning", () => {
    const t = ist("2026-05-20T09:30:00"); // Wed
    expect(isOpenNow(cfg, [], t).open).toBe(true);
  });

  it("returns false at 14:00 (between sessions)", () => {
    const t = ist("2026-05-20T14:00:00");
    const r = isOpenNow(cfg, [], t);
    expect(r.open).toBe(false);
    expect(r.reason).toMatch(/between sessions/i);
  });

  it("returns false on Sunday evening (session-scoped weekly holiday)", () => {
    const t = ist("2026-05-24T19:00:00"); // Sunday 7pm
    const r = isOpenNow(cfg, [], t);
    expect(r.open).toBe(false);
  });

  it("returns true on Sunday morning when only Sunday-Evening is a holiday", () => {
    const t = ist("2026-05-24T09:30:00"); // Sunday 9:30am
    expect(isOpenNow(cfg, [], t).open).toBe(true);
  });

  it("honors manual closure (isOpenToday=false)", () => {
    const closed = { ...cfg, isOpenToday: false, manualClosureReason: "Holi" };
    const t = ist("2026-05-20T09:30:00");
    const r = isOpenNow(closed, [], t);
    expect(r.open).toBe(false);
    expect(r.reason).toBe("Holi");
  });

  it("falls back to default closed reason when manual closure has no reason", () => {
    const closed = { ...cfg, isOpenToday: false, manualClosureReason: null };
    const t = ist("2026-05-20T09:30:00");
    expect(isOpenNow(closed, [], t)).toEqual({ open: false, reason: "Lab is closed today" });
  });

  it("returns false when today matches a whole-day closure", () => {
    const t = ist("2026-05-20T09:30:00");
    const closures = [{ date: "2026-05-20T00:00:00Z", reason: "Holiday" }];
    expect(isOpenNow(cfg, closures, t).open).toBe(false);
  });

  it("stays open late in the IST evening, when UTC has already turned over", () => {
    // 19:00 IST Wednesday is 13:30 UTC — but 23:00 IST is already Thursday in
    // UTC, and reading the server's own day there would pick the wrong
    // weekday's holidays. The lab is busiest in exactly this window.
    const t = ist("2026-05-20T19:00:00");
    expect(isOpenNow(cfg, [], t).open).toBe(true);
  });

  it("returns 'Lab opens at' before morning opening", () => {
    const t = ist("2026-05-20T07:00:00");
    // Shown to patients, so 12-hour with a meridiem rather than "08:00".
    expect(isOpenNow(cfg, [], t).reason).toMatch(/opens at 8:00 AM/);
  });

  it("returns 'Closed for the day' after evening close", () => {
    const t = ist("2026-05-20T21:00:00");
    expect(isOpenNow(cfg, [], t).reason).toBe("Closed for the day");
  });
});

describe("lab-status — slotsAvailableOn", () => {
  it("returns all three slots on a normal weekday", () => {
    const slots = slotsAvailableOn(cfg, [], new Date("2026-05-20"));
    expect(slots).toEqual(["Morning", "Afternoon", "Evening"]);
  });

  it("returns empty when a whole-day closure covers the date", () => {
    const closures = [{ date: "2026-06-10T00:00:00Z" }];
    expect(slotsAvailableOn(cfg, closures, new Date("2026-06-10"))).toEqual([]);
  });

  it("drops only the Evening slot on Sunday when Sunday-Evening is a holiday", () => {
    const slots = slotsAvailableOn(cfg, [], new Date("2026-05-24")); // Sunday
    expect(slots).toContain("Morning");
    expect(slots).toContain("Afternoon");
    expect(slots).not.toContain("Evening");
  });

  it("returns empty when full-day weekly holiday matches", () => {
    const withFullSunday = { ...cfg, weeklyHolidays: ["Sunday"] };
    expect(slotsAvailableOn(withFullSunday, [], new Date("2026-05-24"))).toEqual([]);
  });

  it("returns empty for today when isOpenToday is false", () => {
    const closed = { ...cfg, isOpenToday: false };
    // Both arguments pinned rather than `new Date()`: the "is this date today?"
    // check asks in IST, so a run between 18:30 and 24:00 UTC would compare a
    // UTC "today" against an IST tomorrow and decide this date wasn't today.
    const date = new Date("2026-05-20T00:00:00Z");
    const now = ist("2026-05-20T09:30:00");
    expect(slotsAvailableOn(closed, [], date, now)).toEqual([]);
  });
});

describe("lab-status — restrictionForSlots", () => {
  it("forces Morning when any test requires fasting", () => {
    const tests = [
      { id: "t1", collectionTimeRestriction: "FastingMorningOnly" as const },
      { id: "t2", collectionTimeRestriction: null },
    ];
    expect(restrictionForSlots(tests)).toEqual(["Morning"]);
  });

  it("forces Morning when any test is MorningOnly", () => {
    const tests = [
      { id: "t1", collectionTimeRestriction: "MorningOnly" as const },
    ];
    expect(restrictionForSlots(tests)).toEqual(["Morning"]);
  });

  it("forces Evening when EveningOnly and no Morning restrictions", () => {
    const tests = [
      { id: "t1", collectionTimeRestriction: "EveningOnly" as const },
    ];
    expect(restrictionForSlots(tests)).toEqual(["Evening"]);
  });

  it("Morning beats Evening when both kinds present", () => {
    const tests = [
      { id: "t1", collectionTimeRestriction: "MorningOnly" as const },
      { id: "t2", collectionTimeRestriction: "EveningOnly" as const },
    ];
    expect(restrictionForSlots(tests)).toEqual(["Morning"]);
  });

  it("returns null when no test has a restriction", () => {
    expect(restrictionForSlots([{ id: "t1", collectionTimeRestriction: null }])).toBeNull();
  });

  it("returns null on empty input", () => {
    expect(restrictionForSlots([])).toBeNull();
  });
});
