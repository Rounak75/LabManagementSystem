import { describe, it, expect } from "vitest";
import { labDate, labDateTime } from "@shared/lab-date";

/**
 * The date a patient is told, in the lab's own time zone and in a format no
 * runtime upgrade can change.
 */
describe("labDate", () => {
  it("writes the month out rather than leaving it to ICU", () => {
    expect(labDate(new Date("2026-05-12T06:00:00+05:30"))).toBe("12 May 2026");
  });

  // The bug this replaced: a visit stored as UTC midnight rendered as the
  // previous day on any machine set west of UTC, so a patient in Jamshedpur was
  // told the wrong collection date whenever the sending PC's clock disagreed.
  it("reads UTC midnight as the IST day it stands for", () => {
    expect(labDate(new Date("2026-05-12T00:00:00Z"))).toBe("12 May 2026");
  });

  // 04:00 IST is 22:30 UTC the evening before. The lab means the 12th.
  it("keeps the IST day for an early-morning visit", () => {
    expect(labDate(new Date("2026-05-11T22:30:00Z"))).toBe("12 May 2026");
  });

  // 23:00 IST is 17:30 UTC the same day — no wrap either way.
  it("keeps the IST day for a late-evening visit", () => {
    expect(labDate(new Date("2026-05-12T17:30:00Z"))).toBe("12 May 2026");
  });

  it("does not pad single-digit days, as the templates have always rendered", () => {
    expect(labDate(new Date("2026-05-05T06:00:00+05:30"))).toBe("5 May 2026");
  });

  it("rolls the year over correctly", () => {
    expect(labDate(new Date("2025-12-31T20:00:00Z"))).toBe("1 Jan 2026");
  });

  it("accepts an ISO string", () => {
    expect(labDate("2026-05-12T00:00:00Z")).toBe("12 May 2026");
  });

  // "Invalid Date" is not something to send a patient.
  it("returns empty for an unusable date", () => {
    expect(labDate(new Date("nonsense"))).toBe("");
    expect(labDate("nonsense")).toBe("");
    expect(labDate(null)).toBe("");
    expect(labDate(undefined)).toBe("");
  });
});

describe("labDateTime", () => {
  it("writes the time in IST, 12-hour", () => {
    expect(labDateTime(new Date("2026-05-12T09:34:00Z"))).toBe("12 May 2026, 3:04 pm");
  });

  it("pads minutes but not hours", () => {
    expect(labDateTime(new Date("2026-05-12T03:35:00Z"))).toBe("12 May 2026, 9:05 am");
  });

  it("writes IST midnight as 12:00 am on the right day", () => {
    expect(labDateTime(new Date("2026-05-11T18:30:00Z"))).toBe("12 May 2026, 12:00 am");
  });

  it("writes IST noon as 12:00 pm", () => {
    expect(labDateTime(new Date("2026-05-12T06:30:00Z"))).toBe("12 May 2026, 12:00 pm");
  });

  // The log views are read for the exact second something happened.
  it("adds seconds when asked", () => {
    expect(labDateTime(new Date("2026-05-12T09:34:07Z"), { seconds: true }))
      .toBe("12 May 2026, 3:04:07 pm");
  });

  it("returns empty for an unusable date", () => {
    expect(labDateTime(null)).toBe("");
    expect(labDateTime("nonsense")).toBe("");
  });
});
