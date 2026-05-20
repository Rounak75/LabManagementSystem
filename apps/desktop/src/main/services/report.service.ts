import { prisma } from "@main/db";
import fs from "node:fs";
import path from "node:path";

/**
 * Convert a stored logo reference into a base64 `data:` URI.
 *
 * The PDF main-process renderer (react-pdf) cannot reliably load `file://`
 * URLs, so we persist logos as data URIs in the DB. This helper is idempotent:
 * - null in → null out
 * - already-data-URI → returned unchanged
 * - file path that exists → converted to `data:<mime>;base64,…`
 * - file path that's missing → null (caller decides whether to clear the field)
 */
export function migrateLogoToDataUri(stored: string | null): string | null {
  if (!stored) return null;
  if (stored.startsWith("data:")) return stored;
  if (!fs.existsSync(stored)) return null;
  const ext = path.extname(stored).toLowerCase();
  const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
  const bytes = fs.readFileSync(stored);
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

/**
 * Idempotent one-time migration: if labSettings.labLogo holds a filesystem
 * path (legacy format), convert it to a base64 data URI in place. Safe to
 * call on every boot — after the first successful conversion subsequent
 * runs are no-ops. If the legacy path no longer exists on disk we leave the
 * column untouched so the user can re-upload the logo.
 */
export async function migrateLogoFieldOnce(): Promise<void> {
  try {
    const settings = await prisma().labSettings.findFirst();
    if (!settings?.labLogo) return;
    if (settings.labLogo.startsWith("data:")) return;
    const dataUri = migrateLogoToDataUri(settings.labLogo);
    if (!dataUri) return; // file missing — leave field as-is so user can re-upload
    await prisma().labSettings.update({
      where: { id: settings.id },
      data: { labLogo: dataUri }
    });
    console.log("[migrateLogoFieldOnce] Converted legacy logo path to data URI");
  } catch (err) {
    // Migration is best-effort — log but don't crash boot
    console.error("[migrateLogoFieldOnce] failed:", err);
  }
}

export interface ReportData {
  lab: {
    name: string; address: string; phone: string; email: string | null;
    pathologistName: string | null; pathologistQuals: string | null; logo: string | null;
  };
  patient: { id: string; patientId: string; name: string; age: number; sex: string; phone: string; address: string | null;
            referredByName: string };
  visit: { visitId: string; visitDate: string };
  groups: { category: string; tests: {
    name: string;
    parameters: { name: string; value: string; unit: string; range: string; isAbnormal: boolean;
                  resultType: string; qualitativeOptions: string | null; notes: string | null }[];
    outsourcedSentTo: string | null;
  }[] }[];
  generatedAt: string;
}

export async function buildReportData(visitId: string): Promise<ReportData> {
  const visit = await prisma().visit.findUnique({
    where: { id: visitId },
    include: {
      patient: { include: { referredBy: true } },
      visitTests: { include: { test: { include: { parameters: { orderBy: { displayOrder: "asc" } } } }, results: true } }
    }
  });
  if (!visit) throw new Error("NOT_FOUND");
  const settings = (await prisma().labSettings.findUnique({ where: { id: "singleton" } }))!;

  const isChild = visit.patient.age < settings.childAgeBoundary;

  const grouped = new Map<string, ReportData["groups"][number]["tests"]>();
  for (const vt of visit.visitTests) {
    const cat = vt.test.category;
    if (!grouped.has(cat)) grouped.set(cat, []);
    const params = vt.test.parameters.map(p => {
      const r = vt.results.find(rr => rr.parameterId === p.id);
      let range = "";
      if (p.resultType === "Numeric") {
        let min: any = null, max: any = null;
        if (isChild && p.refRangeChildMin && p.refRangeChildMax) { min = p.refRangeChildMin; max = p.refRangeChildMax; }
        else if (visit.patient.sex === "Female") { min = p.refRangeFemaleMin; max = p.refRangeFemaleMax; }
        else                                      { min = p.refRangeMaleMin;   max = p.refRangeMaleMax; }
        if (min !== null && max !== null) range = `${Number(min)} – ${Number(max)}`;
      } else if (p.normalQualitative) {
        range = `Normal: ${p.normalQualitative}`;
      }
      return {
        name: p.name,
        value: r?.value ?? "",
        unit: p.unit,
        range,
        isAbnormal: !!r?.isAbnormal,
        resultType: p.resultType,
        qualitativeOptions: p.qualitativeOptions,
        notes: (r as any)?.notes ?? null
      };
    });
    grouped.get(cat)!.push({
      name: vt.test.name,
      parameters: params,
      outsourcedSentTo: vt.outsourcedSentTo
    });
  }

  return {
    lab: {
      name: settings.labName, address: settings.labAddress, phone: settings.labPhone, email: settings.labEmail,
      pathologistName: settings.pathologistName, pathologistQuals: settings.pathologistQuals, logo: settings.labLogo
    },
    patient: {
      id: visit.patient.id, patientId: visit.patient.patientId,
      name: visit.patient.name, age: visit.patient.age, sex: visit.patient.sex,
      phone: visit.patient.phone ?? "", address: visit.patient.address,
      referredByName: visit.patient.referredBy?.name ?? "Self"
    },
    visit: { visitId: visit.visitId, visitDate: visit.visitDate.toISOString() },
    groups: Array.from(grouped.entries()).map(([category, tests]) => ({ category, tests })),
    generatedAt: new Date().toISOString()
  };
}
