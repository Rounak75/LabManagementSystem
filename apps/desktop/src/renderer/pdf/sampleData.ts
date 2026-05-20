// Static fixture for the template editor's live preview and any UI that wants
// to render DefaultReportTemplate without a real visit. Exercises every column
// (including "comments") and includes both normal and abnormal parameter rows
// so the abnormal-flag styling is visually verifiable.
import type { ReportData } from "@main/services/report.service";

export const sampleData: ReportData = {
  lab: {
    name: "Golmuri Janch Ghar",
    address: "Sample Lane, Jamshedpur, Jharkhand 831003",
    phone: "+91-9999900000",
    email: "info@example.com",
    pathologistName: "Dr. P. C. Du",
    pathologistQuals: "MD (Pathology)",
    logo: null,
  },
  patient: {
    id: "sample-patient",
    patientId: "P-000001",
    name: "Anita Sharma",
    age: 38,
    sex: "Female",
    phone: "+91-9000000000",
    address: "12 Example Road",
    referredByName: "Dr. R. Verma",
  },
  visit: {
    visitId: "V-000123",
    visitDate: new Date("2026-05-06T09:30:00.000Z").toISOString(),
  },
  groups: [
    {
      category: "Hematology",
      tests: [
        {
          name: "Complete Blood Count (CBC)",
          outsourcedSentTo: null,
          parameters: [
            { name: "Hemoglobin",      value: "10.2", unit: "g/dL",     range: "12 – 16",        isAbnormal: true,  resultType: "Numeric", qualitativeOptions: null, notes: null },
            { name: "WBC Count",       value: "7.4",  unit: "x10^3/uL", range: "4.0 – 11.0",     isAbnormal: false, resultType: "Numeric", qualitativeOptions: null, notes: null },
            { name: "Platelet Count",  value: "510",  unit: "x10^3/uL", range: "150 – 410",      isAbnormal: true,  resultType: "Numeric", qualitativeOptions: null, notes: null },
          ],
        },
      ],
    },
    {
      category: "Biochemistry",
      tests: [
        {
          name: "Lipid Profile",
          outsourcedSentTo: null,
          parameters: [
            { name: "Total Cholesterol", value: "180", unit: "mg/dL", range: "< 200",   isAbnormal: false, resultType: "Numeric", qualitativeOptions: null, notes: null },
            { name: "HDL",               value: "32",  unit: "mg/dL", range: "> 40",    isAbnormal: true,  resultType: "Numeric", qualitativeOptions: null, notes: null },
          ],
        },
      ],
    },
  ],
  generatedAt: new Date("2026-05-06T09:35:00.000Z").toISOString(),
};

export const sampleReportData = sampleData;
