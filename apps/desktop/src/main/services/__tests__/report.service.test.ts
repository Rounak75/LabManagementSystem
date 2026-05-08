import { describe, it, expect, vi } from "vitest";

vi.mock("@main/db", () => ({
  prisma: () => ({
    visit: { findUnique: async () => ({
      id: "v1", visitId: "VIS-2026-00001",
      visitDate: new Date("2026-04-29T10:00:00Z"),
      patient: { id: "p1", patientId: "LAB-2026-00001", name: "Test", age: 40, sex: "Male", phone: "1", address: null,
                referredBy: { name: "Self" } },
      visitTests: [{
        outsourcedSentTo: null,
        test: { category: "Blood", name: "CBC",
          parameters: [{ id: "pa1", name: "Hb", unit: "g/dL", resultType: "Numeric", displayOrder: 0,
            refRangeMaleMin: 13, refRangeMaleMax: 17, refRangeFemaleMin: null, refRangeFemaleMax: null,
            refRangeChildMin: null, refRangeChildMax: null, qualitativeOptions: null, normalQualitative: null }] },
        results: [{ parameterId: "pa1", value: "10", isAbnormal: true }]
      }]
    }) },
    labSettings: { findUnique: async () => ({ labName: "Lab", labAddress: "addr", labPhone: "1", labEmail: null,
      pathologistName: null, pathologistQuals: null, labLogo: null, childAgeBoundary: 12 }) }
  })
}));

import { buildReportData } from "../report.service";

describe("buildReportData", () => {
  it("groups tests by category and computes range string", async () => {
    const d = await buildReportData("v1");
    expect(d.groups[0]?.category).toBe("Blood");
    expect(d.groups[0]?.tests[0]?.parameters[0]?.range).toBe("13 – 17");
    expect(d.groups[0]?.tests[0]?.parameters[0]?.isAbnormal).toBe(true);
  });
});
