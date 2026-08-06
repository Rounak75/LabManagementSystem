import { describe, it, expect } from "vitest";
import { formatINR, formatPhone, formatDateShort, formatDateTime } from "./format";

describe("format", () => {
  it("formatINR adds ₹ and groups in the Indian system", () => {
    expect(formatINR(150000)).toBe("₹1,50,000");
    expect(formatINR(99.5)).toBe("₹100");
  });
  it("formatPhone groups Indian mobile number", () => {
    expect(formatPhone("9876543210")).toBe("98765 43210");
  });
  it("formatDateShort returns DD MMM YYYY", () => {
    expect(formatDateShort("2026-05-20")).toBe("20 May 2026");
  });
  it("formatDateShort reads the stored UTC day, not the runtime's", () => {
    // TIMESTAMPTZ at UTC midnight. Read in local time on anything west of UTC
    // this is still the 19th, and the lab would see the wrong visit date.
    expect(formatDateShort("2026-05-20T00:00:00Z")).toBe("20 May 2026");
  });
  it("formatDateShort renders nothing for a missing date", () => {
    // BookingRow passes `preferred_date ?? ""`; "Invalid Date" is not a thing
    // to show a receptionist.
    expect(formatDateShort("")).toBe("");
  });

  // An audit row is a real instant, unlike the date-only columns formatDateShort
  // reads. Staff reading it are standing in the lab, so it is shown in IST — and
  // in IST regardless of whether Vercel rendered it on the server or the
  // browser did, which is what "en-IN" could not promise.
  it("formatDateTime reads an instant in IST, not the runtime's zone", () => {
    expect(formatDateTime("2026-05-20T09:34:00Z")).toBe("20 May 2026, 3:04 pm");
  });
  it("formatDateTime keeps the IST day when UTC is still the day before", () => {
    expect(formatDateTime("2026-05-19T22:30:00Z")).toBe("20 May 2026, 4:00 am");
  });
  it("formatDateTime writes midnight and noon as 12", () => {
    expect(formatDateTime("2026-05-19T18:30:00Z")).toBe("20 May 2026, 12:00 am");
    expect(formatDateTime("2026-05-20T06:30:00Z")).toBe("20 May 2026, 12:00 pm");
  });
  it("formatDateTime renders nothing for a missing date", () => {
    expect(formatDateTime("")).toBe("");
  });
});
