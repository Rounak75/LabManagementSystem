import { prisma } from "@main/db";

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
    parameters: { name: string; value: string; unit: string; range: string; isAbnormal: boolean }[];
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
        isAbnormal: !!r?.isAbnormal
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
      phone: visit.patient.phone, address: visit.patient.address,
      referredByName: visit.patient.referredBy?.name ?? "Self"
    },
    visit: { visitId: visit.visitId, visitDate: visit.visitDate.toISOString() },
    groups: Array.from(grouped.entries()).map(([category, tests]) => ({ category, tests })),
    generatedAt: new Date().toISOString()
  };
}
