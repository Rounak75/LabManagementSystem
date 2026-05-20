// Phase 3d Plan A — shared report rendering types used by desktop and portal.
// Kept independent of the desktop's TemplateConfig so the portal can render
// PDFs without importing desktop-specific code. The desktop adapter shim
// converts its richer TemplateConfig into these primitive props.

export type Layout = "FullPage" | "ContentOnly" | "AlignmentTest";

export interface Calibration {
  xOffsetMm: number;
  yOffsetMm: number;
}

export interface PatientInfo {
  name: string;
  age: number;
  sex: "Male" | "Female" | "Other";
  visitDate: string; // ISO 8601
  visitIdDisplay: string; // e.g. "VIS-2026-00042"
  referringDoctor: string | null;
  phone?: string; // shown in the access-code footer (Plan B)
}

export interface ResultRow {
  testName: string;
  value: string;
  unit: string;
  refRange: string;
  isAbnormal: boolean;
}

export interface ResultGroup {
  sectionTitle: string; // e.g. "Clinical Biochemistry"
  tests: ResultRow[];
}

export interface LabInfo {
  name: string;
  address: string;
  phone: string;
  timings: string;
  pathologist: { name: string; qualifications: string };
  logo?: string; // base64 or file:// URI; FullPage only
  portalUrl?: string; // printed in the access-code footer (Plan B)
}

export interface LabReportProps {
  patient: PatientInfo;
  lab: LabInfo;
  groups: ResultGroup[];
  layout?: Layout; // default "FullPage"
  calibration?: Calibration; // default { 0, 0 }
  accessCode?: string; // Plan B: when present, prints the access-code footer
}
