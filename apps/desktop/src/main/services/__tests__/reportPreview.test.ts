import { describe, it, expect, vi } from "vitest";
import * as fs from "fs";
import { join } from "path";

/**
 * A realistic report — abnormal high, abnormal low, and a qualitative abnormal
 * with no direction — rendered end to end.
 *
 * A PDF template is the one thing here that cannot be judged from a passing
 * assertion: "renders a non-empty buffer" is equally true of a page with the
 * columns overlapping. So this doubles as the way to *look* at it. Run
 *
 *   REPORT_PREVIEW=1 npx vitest run src/main/services/__tests__/reportPreview.test.ts
 *
 * and open the `report-preview.pdf` it names. Without that variable it stays a
 * normal test and writes nothing, so the suite does not litter the working tree.
 */

vi.mock("@main/db", () => ({
  prisma: () => ({
    visit: {
      findUnique: async () => ({
        id: "v1",
        visitId: "VIS-2026-00042",
        visitDate: new Date("2026-08-06T10:00:00Z"),
        patient: {
          id: "p1",
          patientId: "LAB-2026-00042",
          name: "Sujata Mahato",
          age: 44,
          sex: "Female",
          phone: "9876543210",
          address: "Golmuri Chowk, Jamshedpur",
          referredBy: { name: "Dr. R. Sinha" },
        },
        visitTests: [
          {
            outsourcedSentTo: null,
            test: {
              category: "Blood",
              name: "Blood Glucose Fasting",
              parameters: [{
                id: "p-bgf", name: "Value", unit: "mg/dl", resultType: "Numeric", displayOrder: 0,
                refRangeMaleMin: 70, refRangeMaleMax: 110,
                refRangeFemaleMin: 70, refRangeFemaleMax: 110,
                refRangeChildMin: null, refRangeChildMax: null,
                qualitativeOptions: null, normalQualitative: null,
              }],
            },
            // Deliberately high, so the abnormal marker is on the page.
            results: [{ parameterId: "p-bgf", value: "168", isAbnormal: true }],
          },
          {
            outsourcedSentTo: null,
            test: {
              category: "Blood",
              name: "CBC / Blood Examination",
              parameters: [
                { id: "p-hb", name: "Haemoglobin", unit: "GM%", resultType: "Numeric", displayOrder: 0,
                  refRangeMaleMin: 13, refRangeMaleMax: 17,
                  refRangeFemaleMin: 11.5, refRangeFemaleMax: 15,
                  refRangeChildMin: null, refRangeChildMax: null,
                  qualitativeOptions: null, normalQualitative: null },
                { id: "p-tlc", name: "Total Leucocyte Count", unit: "/cmm", resultType: "Numeric", displayOrder: 1,
                  refRangeMaleMin: 4000, refRangeMaleMax: 11000,
                  refRangeFemaleMin: 4000, refRangeFemaleMax: 11000,
                  refRangeChildMin: null, refRangeChildMax: null,
                  qualitativeOptions: null, normalQualitative: null },
                { id: "p-neut", name: "Neutrophils", unit: "%", resultType: "Numeric", displayOrder: 2,
                  refRangeMaleMin: 50, refRangeMaleMax: 70,
                  refRangeFemaleMin: 50, refRangeFemaleMax: 70,
                  refRangeChildMin: null, refRangeChildMax: null,
                  qualitativeOptions: null, normalQualitative: null },
                { id: "p-lymph", name: "Lymphocytes", unit: "%", resultType: "Numeric", displayOrder: 3,
                  refRangeMaleMin: 20, refRangeMaleMax: 40,
                  refRangeFemaleMin: 20, refRangeFemaleMax: 40,
                  refRangeChildMin: null, refRangeChildMax: null,
                  qualitativeOptions: null, normalQualitative: null },
              ],
            },
            results: [
              { parameterId: "p-hb", value: "9.4", isAbnormal: true },
              { parameterId: "p-tlc", value: "7800", isAbnormal: false },
              { parameterId: "p-neut", value: "64", isAbnormal: false },
              { parameterId: "p-lymph", value: "31", isAbnormal: false },
            ],
          },
          {
            outsourcedSentTo: null,
            test: {
              category: "Urine",
              name: "Urine Routine Examination",
              parameters: [
                { id: "p-uc", name: "Colour", unit: "", resultType: "Qualitative", displayOrder: 0,
                  refRangeMaleMin: null, refRangeMaleMax: null, refRangeFemaleMin: null,
                  refRangeFemaleMax: null, refRangeChildMin: null, refRangeChildMax: null,
                  qualitativeOptions: JSON.stringify(["Pale yellow", "Yellow"]),
                  normalQualitative: "Pale yellow" },
                { id: "p-ualb", name: "Albumin", unit: "", resultType: "Qualitative", displayOrder: 1,
                  refRangeMaleMin: null, refRangeMaleMax: null, refRangeFemaleMin: null,
                  refRangeFemaleMax: null, refRangeChildMin: null, refRangeChildMax: null,
                  qualitativeOptions: JSON.stringify(["Absent", "Present"]),
                  normalQualitative: "Absent" },
              ],
            },
            results: [
              { parameterId: "p-uc", value: "Pale yellow", isAbnormal: false },
              // Qualitative abnormal — no direction, must still be marked.
              { parameterId: "p-ualb", value: "Present", isAbnormal: true },
            ],
          },
        ],
      }),
    },
    labSettings: {
      findUnique: async () => ({
        labName: "Golmuri Janch Ghar",
        labAddress: "Main Road, Golmuri Chowk, Jamshedpur 831003",
        labPhone: "6202924306",
        labEmail: null,
        pathologistName: "Dr. P. C. Dubey",
        pathologistQuals: "M.D. (Pathology)",
        labLogo: null,
        childAgeBoundary: 12,
        portalUrl: "golmurijanchghar.vercel.app",
      }),
    },
  }),
}));

import { buildReportData } from "../report.service";
import { renderReportPdf } from "../pdf.service";
import type { TemplateConfig } from "@shared/template-config";

const config: TemplateConfig = {
  layout: "golmuri-standard",
  headerText: "",
  footerText: "",
  signatureLine: "",
  fontFamily: "Times",
  fontSize: 10,
  accentColor: "#0f172a",
  sections: { logo: true, doctorInfo: true, parametersTable: true, abnormalLegend: true, disclaimer: false },
  columns: { testName: true, result: true, unit: true, referenceRange: true, flag: true, comments: false },
};

describe("the printed report", () => {
  it("renders a visit carrying high, low and qualitative abnormals", async () => {
    const data = await buildReportData("v1");
    const buffer = await renderReportPdf(data, config);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.subarray(0, 4).toString("ascii")).toBe("%PDF");
    expect(buffer.length).toBeGreaterThan(1000);

    if (process.env.REPORT_PREVIEW) {
      const out = join(process.cwd(), "report-preview.pdf");
      fs.writeFileSync(out, buffer);
      console.log(`\n  Report preview written to: ${out}\n`);
    }
  }, 30000);

  // The sign-in strip is the only written record of their patient id a patient
  // receives, so the report must still render when the lab has not set the
  // portal address yet rather than failing on an undefined.
  it("still renders when no portal address has been configured", async () => {
    const data = await buildReportData("v1");
    const buffer = await renderReportPdf({ ...data, lab: { ...data.lab, portalUrl: null } }, config);

    expect(buffer.subarray(0, 4).toString("ascii")).toBe("%PDF");
  }, 30000);
});
