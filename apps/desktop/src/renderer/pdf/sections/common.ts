import { StyleSheet } from "@react-pdf/renderer";

export const BIOCHEM_NAMES = new Set([
  "Blood Glucose Fasting", "PP Glucose", "Random Glucose", "Urea", "Creatinine",
  "Total Bilirubin", "Direct Bilirubin", "Indirect Bilirubin", "Alk-Phosphates",
  "SGPT (ALT)", "SGOT (AST)", "Total Protein", "Albumin", "Globulin", "A:G Ratio",
  "Total Cholesterol", "HDL", "LDL", "VLDL", "Triglyceride", "LDH", "CPK", "CPK-MB",
  "Uric Acid", "Calcium", "Sodium", "Potassium", "Chloride", "Iron Phosphate",
  "Bicarbonate", "Acid Phosphate-Total", "Prs Fact", "Amylase", "Copper",
  "Lithium", "Phosphorus", "Urine Sugar"
]);

export const SEROLOGY_NAMES = new Set([
  "VDRL", "Blood Group", "RA Factor", "ASO", "HBsAg", "HIV 1/2", "HCV",
  "MP Blood Film", "MP Card", "Dengue IgG/IgM", "Sickling Test", "Mantoux Test",
  "PT (Prothrombin Time)", "CRP", "Direct Coombs Test", "Peripheral Blood Smear",
  "Sputum for AFB", "Semen Examination"
]);

export const sectionStyles = StyleSheet.create({
  section: { marginBottom: 10 },
  title:   { backgroundColor: "#1e293b", color: "white", padding: 3, marginBottom: 4,
             fontSize: 10, fontWeight: 700, textAlign: "center" },
  row:     { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#cbd5e1",
             paddingVertical: 2 },
  cell1:   { flex: 2 },
  cell2:   { flex: 1, textAlign: "right" },
  cell3:   { flex: 2, textAlign: "right" },
  header:  { fontWeight: 700 },
  abn:     { color: "#b91c1c", fontWeight: 700 },
  /** The H / L marker beside an abnormal value, so the flag survives a black-and-white print. */
  abnFlag: { color: "#b91c1c", fontWeight: 700 },
  subhead: { fontWeight: 700, marginTop: 4, marginBottom: 2, fontSize: 9 },
  pairRow: { flexDirection: "row", paddingVertical: 1 },
  pairLabel: { flex: 1, color: "#475569" },
  pairValue: { flex: 1, fontWeight: 500 },
  gridTable: { marginTop: 2 },
  gridHead:  { flexDirection: "row", backgroundColor: "#f1f5f9",
               borderBottomWidth: 0.5, borderColor: "#cbd5e1" },
  gridCell:  { padding: 2, fontSize: 8, flex: 1, textAlign: "center" },
  gridLabel: { padding: 2, fontSize: 8, flex: 2, textAlign: "left", fontWeight: 700 },
  legend:    { marginTop: 4, fontSize: 7, color: "#475569", fontStyle: "italic" }
});

export type ReportTest = {
  name: string;
  parameters: {
    name: string; value: string; unit: string; range: string; isAbnormal: boolean;
    resultType: string; qualitativeOptions: string | null; notes: string | null;
  }[];
  outsourcedSentTo: string | null;
};

/**
 * The marker printed next to an out-of-range result: H, L, or a neutral *.
 *
 * An abnormal value used to be distinguished by red text alone. The lab prints
 * in black and white, so on the paper a patient is actually handed a dangerously
 * high result looked exactly like a normal one. A letter survives any printer.
 *
 * Called only for results already judged abnormal, so anything it cannot place
 * against a numeric range still gets a mark. Returning "" for those would mean
 * a qualitative abnormal — "Positive" where "Negative" is normal — printed
 * exactly like a normal one, which is the failure this exists to prevent.
 */
export function abnormalFlag(value: string, range: string): "H" | "L" | "*" {
  const bounds = /(-?\d+(?:\.\d+)?)\s*[–—-]\s*(-?\d+(?:\.\d+)?)/.exec(range ?? "");
  const n = Number(String(value ?? "").trim());
  if (!bounds || !Number.isFinite(n)) return "*";

  const min = Number(bounds[1]);
  const max = Number(bounds[2]);
  if (n > max) return "H";
  if (n < min) return "L";
  return "*";
}

export function safeJson<T>(s: string, fallback: T): T {
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

export function flattenTests(groups: { category: string; tests: ReportTest[] }[]): ReportTest[] {
  return groups.flatMap(g => g.tests);
}
