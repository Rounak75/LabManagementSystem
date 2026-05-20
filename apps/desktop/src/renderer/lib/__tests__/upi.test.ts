import { describe, it, expect } from "vitest";
import { buildUpiUri, validateVpa, maskVpa } from "../upi";

describe("buildUpiUri", () => {
  it("builds a standards-compliant URI for typical input", () => {
    const uri = buildUpiUri({
      vpa: "9876543210@ybl",
      payeeName: "Golmuri Janch Ghar",
      amount: 350,
      invoiceId: "INV-2026-0001",
      note: "Lab visit INV-2026-0001",
    });
    expect(uri).toContain("upi://pay?");
    expect(uri).toContain("pa=9876543210%40ybl");
    expect(uri).toContain("pn=Golmuri%20Janch%20Ghar");
    expect(uri).toContain("am=350.00");
    expect(uri).toContain("cu=INR");
    expect(uri).toContain("tr=INV-2026-0001");
    expect(uri).toContain("tn=Lab%20visit%20INV-2026-0001");
  });

  it("formats amount to two decimals", () => {
    const uri = buildUpiUri({ vpa: "x@y", payeeName: "X", amount: 100, invoiceId: "I", note: "N" });
    expect(uri).toContain("am=100.00");
    const uri2 = buildUpiUri({ vpa: "x@y", payeeName: "X", amount: 100.5, invoiceId: "I", note: "N" });
    expect(uri2).toContain("am=100.50");
    const uri3 = buildUpiUri({ vpa: "x@y", payeeName: "X", amount: 100.555, invoiceId: "I", note: "N" });
    expect(uri3).toContain("am=100.56");
  });

  it("URL-encodes special characters in payee name", () => {
    const uri = buildUpiUri({ vpa: "x@y", payeeName: "S&S Lab + Diag", amount: 1, invoiceId: "I", note: "N" });
    expect(uri).toContain("pn=S%26S%20Lab%20%2B%20Diag");
  });

  it("throws on empty VPA", () => {
    expect(() => buildUpiUri({ vpa: "", payeeName: "X", amount: 1, invoiceId: "I", note: "N" }))
      .toThrow(/VPA/);
  });

  it("throws on non-positive amount", () => {
    expect(() => buildUpiUri({ vpa: "x@y", payeeName: "X", amount: 0, invoiceId: "I", note: "N" }))
      .toThrow(/amount/);
    expect(() => buildUpiUri({ vpa: "x@y", payeeName: "X", amount: -5, invoiceId: "I", note: "N" }))
      .toThrow(/amount/);
  });
});

describe("validateVpa", () => {
  it("accepts standard handles", () => {
    expect(validateVpa("9876543210@ybl")).toBe(true);
    expect(validateVpa("name.surname@okhdfcbank")).toBe(true);
    expect(validateVpa("user_123@paytm")).toBe(true);
    expect(validateVpa("abc-def@upi")).toBe(true);
  });

  it("rejects bad shapes", () => {
    expect(validateVpa("")).toBe(false);
    expect(validateVpa("noatsign")).toBe(false);
    expect(validateVpa("@bank")).toBe(false);
    expect(validateVpa("user@")).toBe(false);
    expect(validateVpa("user@bank@extra")).toBe(false);
    expect(validateVpa("user @bank")).toBe(false);
  });
});

describe("maskVpa", () => {
  it("masks the middle of the user portion", () => {
    expect(maskVpa("9876543210@ybl")).toBe("98xxxxxx10@ybl");
    expect(maskVpa("abc@bank")).toBe("axc@bank");
    expect(maskVpa("ab@bank")).toBe("ab@bank");
  });

  it("returns input unchanged when invalid", () => {
    expect(maskVpa("nobank")).toBe("nobank");
    expect(maskVpa("")).toBe("");
  });
});
