// Phase 3d Plan D — render the visit's report PDF on demand and stream it.
// Uses the shared @lab/reports LabReport so the rendering matches the desktop
// portal copies (with FullPage layout — no pre-printed letterhead here).

import { NextRequest, NextResponse } from "next/server";
import React from "react";
import { renderToStream, type DocumentProps } from "@react-pdf/renderer";
import { LabReport } from "@lab/reports";
import type { ReactElement } from "react";
import { verifyPatientJwt } from "@portal/lib/jwt";
import { getServiceClient } from "@portal/lib/supabase-server";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { visitId: string } }) {
  const cookie = req.cookies.get("portal_session")?.value;
  if (!cookie) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });

  let patientId: string;
  try { patientId = (await verifyPatientJwt(cookie)).patient_id; }
  catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }

  const sb = getServiceClient();
  const { data: visit } = await sb
    .from("visits")
    .select("id, visit_id, visit_date, patient_id, patients(name, age, sex, phone), visit_tests(id, test_id, tests(name, category), results(parameter_id, value, is_abnormal))")
    .eq("id", params.visitId)
    .maybeSingle();
  if (!visit || visit.patient_id !== patientId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: settings } = await sb.from("lab_settings").select("*").eq("id", "singleton").maybeSingle();

  // Pull parameters for the tests in this visit
  const testIds = (visit.visit_tests ?? []).map((vt: { test_id: string }) => vt.test_id);
  const { data: parameters } = await sb
    .from("parameters")
    .select("id, test_id, name, unit, ref_range_male_min, ref_range_male_max, ref_range_female_min, ref_range_female_max")
    .in("test_id", testIds);

  const patient = Array.isArray(visit.patients) ? visit.patients[0] : visit.patients;
  const sex = (patient?.sex as "Male" | "Female" | "Other") ?? "Male";

  // Group by category for the report.
  const groups = new Map<string, { sectionTitle: string; tests: Array<{ testName: string; value: string; unit: string; refRange: string; isAbnormal: boolean }> }>();
  for (const vt of visit.visit_tests ?? []) {
    const test = Array.isArray(vt.tests) ? vt.tests[0] : vt.tests;
    const params = (parameters ?? []).filter((p) => p.test_id === vt.test_id);
    const category = test?.category ?? "Other";
    if (!groups.has(category)) groups.set(category, { sectionTitle: category, tests: [] });
    for (const p of params) {
      const r = (vt.results ?? []).find((x: { parameter_id: string }) => x.parameter_id === p.id);
      const min = sex === "Female" ? p.ref_range_female_min : p.ref_range_male_min;
      const max = sex === "Female" ? p.ref_range_female_max : p.ref_range_male_max;
      const refRange = (min !== null && max !== null) ? `${min} – ${max}` : "";
      groups.get(category)!.tests.push({
        testName: p.name,
        value: r?.value ?? "—",
        unit: p.unit,
        refRange,
        isAbnormal: !!r?.is_abnormal,
      });
    }
  }

  const element = React.createElement(LabReport, {
    patient: {
      name: patient?.name ?? "",
      age: patient?.age ?? 0,
      sex,
      visitDate: visit.visit_date,
      visitIdDisplay: visit.visit_id,
      referringDoctor: "Self",
      phone: patient?.phone ?? "",
    },
    lab: {
      name: settings?.lab_name ?? "Lab",
      address: settings?.lab_address ?? "",
      phone: settings?.lab_phone ?? "",
      timings: `${settings?.morning_open_time ?? ""}–${settings?.morning_close_time ?? ""}`,
      pathologist: {
        name: settings?.pathologist_name ?? "",
        qualifications: settings?.pathologist_quals ?? "",
      },
      portalUrl: settings?.portal_url ?? undefined,
    },
    groups: Array.from(groups.values()),
    layout: "FullPage",
  }) as unknown as ReactElement<DocumentProps>;

  const stream = await renderToStream(element);

  return new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${visit.visit_id}.pdf"`,
    },
  });
}
