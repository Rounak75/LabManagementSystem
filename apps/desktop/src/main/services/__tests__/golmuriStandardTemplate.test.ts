import { describe, it, expect, vi } from "vitest";

/**
 * Integration test for the Golmuri Standard PDF template. Drives the same
 * buildReportData → renderReportPdf pipeline as the default report test but
 * with `layout: "golmuri-standard"` so the renderer branches to
 * GolmuriStandardTemplate. The fixture covers a Biochem + CBC + Urine + Widal
 * visit so multiple sections fire.
 */

vi.mock("@main/db", () => ({
  prisma: () => ({
    visit: {
      findUnique: async () => ({
        id: "v1",
        visitId: "VIS-2026-00010",
        visitDate: new Date("2026-05-12T10:00:00Z"),
        patient: {
          id: "p1",
          patientId: "LAB-2026-00010",
          name: "Test Patient",
          age: 35,
          sex: "Male",
          phone: "9000000010",
          address: "Jamshedpur",
          referredBy: { name: "Self" }
        },
        visitTests: [
          {
            outsourcedSentTo: null,
            test: {
              category: "Blood",
              name: "Blood Glucose Fasting",
              parameters: [{
                id: "pa-bgf",
                name: "Value",
                unit: "mg/dl",
                resultType: "Numeric",
                displayOrder: 0,
                refRangeMaleMin: 70, refRangeMaleMax: 110,
                refRangeFemaleMin: 70, refRangeFemaleMax: 110,
                refRangeChildMin: null, refRangeChildMax: null,
                qualitativeOptions: null, normalQualitative: null
              }]
            },
            results: [{ parameterId: "pa-bgf", value: "92", isAbnormal: false }]
          },
          {
            outsourcedSentTo: null,
            test: {
              category: "Blood",
              name: "CBC / Blood Examination",
              parameters: [
                {
                  id: "pa-hb", name: "Haemoglobin", unit: "GM%",
                  resultType: "Numeric", displayOrder: 0,
                  refRangeMaleMin: 11.5, refRangeMaleMax: 16,
                  refRangeFemaleMin: 11.5, refRangeFemaleMax: 15,
                  refRangeChildMin: null, refRangeChildMax: null,
                  qualitativeOptions: null, normalQualitative: null
                },
                {
                  id: "pa-neut", name: "Neutrophils", unit: "%",
                  resultType: "Numeric", displayOrder: 1,
                  refRangeMaleMin: 50, refRangeMaleMax: 70,
                  refRangeFemaleMin: 50, refRangeFemaleMax: 70,
                  refRangeChildMin: null, refRangeChildMax: null,
                  qualitativeOptions: null, normalQualitative: null
                }
              ]
            },
            results: [
              { parameterId: "pa-hb",   value: "14.2", isAbnormal: false },
              { parameterId: "pa-neut", value: "62",   isAbnormal: false }
            ]
          },
          {
            outsourcedSentTo: null,
            test: {
              category: "Urine",
              name: "Urine Routine Examination",
              parameters: [
                {
                  id: "pa-ucolour", name: "Colour", unit: "",
                  resultType: "Qualitative", displayOrder: 0,
                  refRangeMaleMin: null, refRangeMaleMax: null,
                  refRangeFemaleMin: null, refRangeFemaleMax: null,
                  refRangeChildMin: null, refRangeChildMax: null,
                  qualitativeOptions: JSON.stringify(["Pale yellow","Yellow"]),
                  normalQualitative: "Pale yellow"
                },
                {
                  id: "pa-uph", name: "Reaction (pH)", unit: "",
                  resultType: "Numeric", displayOrder: 1,
                  refRangeMaleMin: 4.6, refRangeMaleMax: 8,
                  refRangeFemaleMin: 4.6, refRangeFemaleMax: 8,
                  refRangeChildMin: null, refRangeChildMax: null,
                  qualitativeOptions: null, normalQualitative: null
                }
              ]
            },
            results: [
              { parameterId: "pa-ucolour", value: "Pale yellow", isAbnormal: false },
              { parameterId: "pa-uph",     value: "6.5",         isAbnormal: false }
            ]
          },
          {
            outsourcedSentTo: null,
            test: {
              category: "Blood",
              name: "Widal Test",
              parameters: [
                {
                  id: "pa-wgrid", name: "Titer Grid", unit: "",
                  resultType: "TiterGrid", displayOrder: 0,
                  refRangeMaleMin: null, refRangeMaleMax: null,
                  refRangeFemaleMin: null, refRangeFemaleMax: null,
                  refRangeChildMin: null, refRangeChildMax: null,
                  qualitativeOptions: JSON.stringify({
                    antigens: ["O","H"], dilutions: ["1:80","1:160"]
                  }),
                  normalQualitative: null
                },
                {
                  id: "pa-wop", name: "Opinion", unit: "",
                  resultType: "Qualitative", displayOrder: 1,
                  refRangeMaleMin: null, refRangeMaleMax: null,
                  refRangeFemaleMin: null, refRangeFemaleMax: null,
                  refRangeChildMin: null, refRangeChildMax: null,
                  qualitativeOptions: JSON.stringify(["Negative","Suggestive of Typhoid"]),
                  normalQualitative: "Negative"
                }
              ]
            },
            results: [
              { parameterId: "pa-wgrid",
                value: JSON.stringify({ results: { "O@1:80": "Positive", "H@1:160": "Negative" } }),
                isAbnormal: false },
              { parameterId: "pa-wop", value: "Negative", isAbnormal: false }
            ]
          }
        ]
      })
    },
    labSettings: {
      findUnique: async () => ({
        labName: "Golmuri Janch Ghar",
        labAddress: "Main Road, Golmuri Chowk, Jamshedpur",
        labPhone: "6202924306",
        labEmail: null,
        pathologistName: "Dr. P. C. Dubey",
        pathologistQuals: "M.D. (Patho)",
        labLogo: null,
        childAgeBoundary: 12
      })
    }
  })
}));

import { buildReportData } from "../report.service";
import { renderReportPdf } from "../pdf.service";
import type { TemplateConfig } from "@shared/template-config";

const golmuriConfig: TemplateConfig = {
  layout: "golmuri-standard",
  headerText: "",
  footerText: "",
  signatureLine: "Dr. P. C. Dubey, M.D. (Patho)",
  fontFamily: "Times",
  fontSize: 10,
  accentColor: "#1e293b",
  sections: {
    logo: true, doctorInfo: true, parametersTable: true,
    abnormalLegend: true, disclaimer: false
  },
  columns: {
    testName: true, result: true, unit: true,
    referenceRange: true, flag: true, comments: false
  }
};

describe("GolmuriStandardTemplate (integration)", () => {
  it("renders a non-empty PDF for a Biochem + CBC + Urine + Widal visit", async () => {
    const data = await buildReportData("v1");
    const buffer = await renderReportPdf(data, golmuriConfig);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.subarray(0, 4).toString("ascii")).toBe("%PDF");
  }, 20000);
});
