// Phase 3d Plan D — single visit detail. Lists results inline and offers a
// "Download PDF" button that hits /api/reports/[visitId].

import { redirect } from "next/navigation";
import Link from "next/link";
import { requirePatient } from "@portal/lib/session";
import { getServiceClient } from "@portal/lib/supabase-server";
import { isTestReleasable, reportReleaseState } from "@portal/lib/report-release";
import {
  Band,
  BandBar,
  BandCard,
  Card,
  Container,
  Note,
  Tag,
  btnPrimary,
} from "@portal/components/ui";
import {
  Check,
  Clock,
  Download,
  Report,
  Wallet,
} from "@portal/components/icons";

import { labDate } from "@portal/lib/format";

export const runtime = "nodejs";

interface Param {
  id: string;
  name: string;
  unit: string;
  ref_range_male_min: number | null;
  ref_range_male_max: number | null;
  ref_range_female_min: number | null;
  ref_range_female_max: number | null;
  ref_range_child_min: number | null;
  ref_range_child_max: number | null;
}

interface ResultRow { value: string; is_abnormal: boolean; parameter_id: string; }

export default async function VisitPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  let session;
  try { session = await requirePatient(); } catch { redirect("/login"); }
  const sb = getServiceClient();

  const { data: visit } = await sb
    .from("visits")
    .select("id, visit_id, visit_date, status, patient_id, report_release_override, invoices(id, total, amount_paid)")
    .eq("id", params.id)
    .maybeSingle();
  if (!visit || visit.patient_id !== session!.patientId) redirect("/dashboard");

  const { data: vts } = await sb
    .from("visit_tests")
    .select("id, test_id, is_locked, tests(name, category)")
    .eq("visit_id", visit!.id);

  // The same rule the PDF route enforces, so the page cannot offer a download the
  // server will refuse: verified-and-locked first, then the bill settled.
  const invoice = Array.isArray(visit!.invoices) ? visit!.invoices[0] : visit!.invoices;
  const release = reportReleaseState(vts, invoice, visit!.report_release_override);

  const testIds = (vts ?? []).map((vt) => vt.test_id);
  const { data: params2 } = await sb
    .from("parameters")
    .select("id, test_id, name, unit, ref_range_male_min, ref_range_male_max, ref_range_female_min, ref_range_female_max, ref_range_child_min, ref_range_child_max")
    .in("test_id", testIds);
  const { data: results } = await sb
    .from("results")
    .select("visit_test_id, parameter_id, value, is_abnormal")
    .in("visit_test_id", (vts ?? []).map((vt) => vt.id));

  const paramsByTest = new Map<string, Param[]>();
  (params2 ?? []).forEach((p) => {
    const arr = paramsByTest.get(p.test_id) ?? [];
    arr.push(p);
    paramsByTest.set(p.test_id, arr);
  });
  const resultsByVisitTest = new Map<string, ResultRow[]>();
  (results ?? []).forEach((r) => {
    const arr = resultsByVisitTest.get(r.visit_test_id) ?? [];
    arr.push(r);
    resultsByVisitTest.set(r.visit_test_id, arr);
  });

  const done = visit!.status === "Completed";

  return (
    <>
      <Band waves className="pb-14">
        <Container>
          <BandBar back={{ href: "/dashboard", label: "Back to dashboard" }} title="Your report" />

          <BandCard className="mt-4">
            <div className="flex items-center gap-3.5 rounded-[20px] bg-elev px-5 py-4">
              <span
                className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                  done ? "bg-ok-soft text-ok" : "bg-notice-soft text-notice"
                }`}
              >
                <Report size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono num text-[15px] font-medium text-text">
                  {visit!.visit_id}
                </p>
                <p className="mt-0.5 truncate text-[12.5px] text-muted">
                  {labDate(visit!.visit_date, { weekday: true, year: true })}
                </p>
              </div>
              <Tag tone={done ? "ok" : "notice"}>{visit!.status}</Tag>
            </div>
          </BandCard>
        </Container>
      </Band>

      <Container className="mt-8 space-y-4">
        {/* ─── Release state ─────────────────────────────────────────── */}
        {release.released ? (
          <a href={`/api/reports/${visit!.id}`} className={`${btnPrimary} w-full`}>
            <Download size={17} />
            Download the full PDF
          </a>
        ) : release.reason === "unpaid" ? (
          // The report exists and is signed off — say so plainly, and make paying
          // the obvious next tap rather than leaving the patient to guess.
          <Card className="p-5">
            <div className="flex items-center gap-3.5">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-notice-soft text-notice">
                <Wallet size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-heading text-[15px] font-bold tracking-snug text-text">
                  Your report is ready
                </p>
                <p className="mt-0.5 text-[13px] text-muted">
                  ₹{release.balance.toFixed(0)} of your bill is still unpaid.
                </p>
              </div>
            </div>
            {invoice?.id ? (
              <Link
                href={`/invoices/${invoice.id}/pay`}
                className={`${btnPrimary} mt-4 w-full font-mono num`}
              >
                Pay ₹{release.balance.toFixed(0)} to unlock
              </Link>
            ) : null}
            <p className="mt-3 text-[12px] leading-relaxed text-muted">
              Already paid at the lab? It can take a little while to show here —
              or ask the lab to release it.
            </p>
          </Card>
        ) : (
          <Note tone="notice" icon={<Clock size={17} />}>
            Your report is still being checked by the lab. It will be available
            to download once a doctor has verified every test.
          </Note>
        )}

        {/* ─── Results ───────────────────────────────────────────────── */}
        <div className="space-y-3">
          {(vts ?? []).map((vt) => {
            const testParams = paramsByTest.get(vt.test_id) ?? [];
            const rs = resultsByVisitTest.get(vt.id) ?? [];
            const test = Array.isArray(vt.tests) ? vt.tests[0] : vt.tests;
            // Withhold values for a test that has not been signed off yet, rather
            // than showing the patient a figure that may still change.
            const released = isTestReleasable(vt);
            return (
              <Card key={vt.id} className="overflow-hidden">
                <div className="flex items-center gap-3 border-b border-line px-5 py-4">
                  <span
                    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      released ? "bg-ok-soft text-ok" : "bg-surface text-muted"
                    }`}
                  >
                    {released ? <Check size={15} /> : <Clock size={15} />}
                  </span>
                  <h3 className="flex-1 font-heading text-[15px] font-bold tracking-snug text-text">
                    {test?.name ?? "Test"}
                  </h3>
                  {test?.category && (
                    <span className="shrink-0 text-[11.5px] text-muted">
                      {test.category}
                    </span>
                  )}
                </div>

                {/* The one table in the portal, and the thing patients open the
                    portal to read. On a phone the card is ~328px wide and the
                    result and unit columns cannot wrap, so every pixel the
                    padding takes is a pixel a long parameter name has to wrap
                    around: `px-5` at both ends left "Mean Corpuscular
                    Haemoglobin Concentration" stacking four lines deep, or
                    pushed the table into a sideways scroll. Full padding
                    returns at `sm`, where there is room for it. */}
                {released ? (
                  <div className="pane overflow-x-auto">
                    <table className="w-full text-[13.5px]">
                      <thead>
                        <tr className="border-b border-line text-left">
                          <th className="px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted sm:px-5">
                            Parameter
                          </th>
                          <th className="px-2 py-2.5 text-right text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted sm:px-3">
                            Result
                          </th>
                          <th className="px-3 py-2.5 text-right text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted sm:px-5">
                            Unit
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {testParams.map((p) => {
                          const r = rs.find((x) => x.parameter_id === p.id);
                          return (
                            <tr key={p.id}>
                              <td className="px-3 py-3 text-text sm:px-5">{p.name}</td>
                              <td
                                className={`whitespace-nowrap px-2 py-3 text-right font-mono num font-medium sm:px-3 ${
                                  r?.is_abnormal ? "text-alert" : "text-text"
                                }`}
                              >
                                {r?.value ?? "—"}
                              </td>
                              <td className="whitespace-nowrap px-3 py-3 text-right text-[12px] text-muted sm:px-5">
                                {p.unit}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="px-5 py-5 text-[13px] text-muted">
                    Awaiting verification by the lab.
                  </p>
                )}
              </Card>
            );
          })}
        </div>

        <Note>
          Values shown in red fall outside the reference range for your age and
          sex. Discuss them with your doctor rather than acting on them alone.
        </Note>
      </Container>
    </>
  );
}
