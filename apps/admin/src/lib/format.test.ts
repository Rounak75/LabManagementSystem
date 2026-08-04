import { describe, it, expect } from "vitest";
import { formatINR, formatPhone, formatDateShort } from "./format";

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
});
