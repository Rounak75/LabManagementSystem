import { describe, it, expect, vi } from "vitest";

/**
 * Integration test for the report PDF pipeline.
 *
 * The IPC handler `reports:generatePdf` is registered in
 * `apps/desktop/src/main/ipc/reports.ipc.ts`. It is not exported as a callable
 * function — it composes `buildReportData(visitId)` + `renderReportPdf(data, config)`
 * + a `writeFile` for caching. The interesting work — and the part that can
 * fail and break the iframe in ReportPreview — is the PDF rendering itself.
 *
 * This test mocks prisma to return a minimal but realistic visit fixture
 * (one patient, one test with one numeric parameter, one entered result)
 * and drives the same `buildReportData → renderReportPdf` flow the IPC
 * handler runs, then asserts the resulting buffer is a non-empty PDF.
 *
 * Why mocked prisma rather than a real DB: every other test in this folder
 * mocks `@main/db`, the vitest environment is jsdom, and there is no test
 * harness for spinning up a real SQLite file with seeded data. Mocking
 * matches the conventions of `report.service.test.ts` and the other
 * service tests, and still exercises the real react-pdf render pipeline —
 * which is the only thing that can actually produce an empty / corrupt PDF.
 */

vi.mock("@main/db", () => ({
  prisma: () => ({
    visit: {
      findUnique: async () => ({
        id: "v1",
        visitId: "VIS-2026-00001",
        visitDate: new Date("2026-04-29T10:00:00Z"),
        patient: {
          id: "p1",
          patientId: "LAB-2026-00001",
          name: "Test Patient",
          age: 30,
          sex: "Male",
          phone: "9000000001",
          address: null,
          referredBy: { name: "Self" }
        },
        visitTests: [{
          outsourcedSentTo: null,
          test: {
            category: "Hematology",
            name: "CBC",
            parameters: [{
              id: "pa1",
              name: "Hb",
              unit: "g/dL",
              resultType: "Numeric",
              displayOrder: 0,
              refRangeMaleMin: 13,
              refRangeMaleMax: 17,
              refRangeFemaleMin: null,
              refRangeFemaleMax: null,
              refRangeChildMin: null,
              refRangeChildMax: null,
              qualitativeOptions: null,
              normalQualitative: null
            }]
          },
          results: [{ parameterId: "pa1", value: "12.5", isAbnormal: true }]
        }]
      })
    },
    labSettings: {
      findUnique: async () => ({
        labName: "Test Lab",
        labAddress: "123 Test St",
        labPhone: "9000000000",
        labEmail: null,
        pathologistName: null,
        pathologistQuals: null,
        labLogo: null,
        childAgeBoundary: 12
      })
    }
  })
}));

import { buildReportData } from "../report.service";
import { renderReportPdf } from "../pdf.service";
import type { TemplateConfig } from "@shared/template-config";

const templateConfig: TemplateConfig = {
  headerText: "Test Laboratory",
  footerText: "Thank you",
  signatureLine: "Authorized Signatory",
  fontFamily: "Inter",
  fontSize: 11,
  accentColor: "#0066cc",
  sections: {
    logo: false,
    doctorInfo: true,
    parametersTable: true,
    abnormalLegend: true,
    disclaimer: true
  },
  columns: {
    testName: true,
    result: true,
    unit: true,
    referenceRange: true,
    flag: true,
    comments: false
  }
};

describe("reports:generatePdf pipeline (integration)", () => {
  it("produces a non-empty PDF buffer for a valid visit", async () => {
    const data = await buildReportData("v1");
    const buffer = await renderReportPdf(data, templateConfig);

    // Sanity: it's a Buffer
    expect(Buffer.isBuffer(buffer)).toBe(true);

    // The PDF must be substantially non-empty. A blank/corrupt render
    // typically yields a few hundred bytes or less; a real one-test report
    // with text content runs into the kilobytes.
    expect(buffer.length).toBeGreaterThan(1000);

    // Sanity: first four bytes are the PDF magic number "%PDF".
    expect(buffer.subarray(0, 4).toString("ascii")).toBe("%PDF");

    // Round-tripping through base64 (which is what the IPC handler returns
    // to the renderer) must also yield non-empty bytes.
    const base64 = buffer.toString("base64");
    expect(base64).toBeTruthy();
    expect(Buffer.from(base64, "base64").length).toBeGreaterThan(1000);
  }, 20000); // react-pdf cold-start can take a few seconds
});
