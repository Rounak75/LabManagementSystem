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
});
