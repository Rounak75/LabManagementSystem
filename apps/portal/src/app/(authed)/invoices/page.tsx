import { redirect } from "next/navigation";
import Link from "next/link";
import { requirePatient } from "@portal/lib/session";
import { getServiceClient } from "@portal/lib/supabase-server";
import {
  Band,
  BandBar,
  BandCard,
  Card,
  Container,
  Tag,
} from "@portal/components/ui";
import { ArrowRight, Check, Wallet } from "@portal/components/icons";

export const runtime = "nodejs";

export default async function InvoicesPage() {
  let session;
  try { session = await requirePatient(); } catch { redirect("/login"); }
  const sb = getServiceClient();

  const { data: invoices } = await sb
    .from("invoices")
    .select("id, total, payment_status, amount_paid, created_at, visits(visit_id, patient_id)")
    .order("created_at", { ascending: false });

  const mine = (invoices ?? []).filter((i) => {
    const v = Array.isArray(i.visits) ? i.visits[0] : i.visits;
    return v?.patient_id === session!.patientId;
  });

  const totalDue = mine.reduce(
    (sum, i) => sum + Math.max(0, Number(i.total) - Number(i.amount_paid ?? 0)),
    0
  );

  return (
    <>
      <Band waves className="pb-14">
        <Container>
          <BandBar back={{ href: "/dashboard", label: "Back to dashboard" }} title="My bills" />

          <BandCard className="mt-4">
            <div className="flex items-center gap-4 rounded-[20px] bg-elev px-5 py-4">
              <span
                className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                  totalDue > 0 ? "bg-notice-soft text-notice" : "bg-ok-soft text-ok"
                }`}
              >
                {totalDue > 0 ? <Wallet size={20} /> : <Check size={20} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Total outstanding
                </p>
                <p className="mt-0.5 font-mono num text-[22px] font-semibold text-text">
                  ₹{totalDue.toFixed(0)}
                </p>
              </div>
              {totalDue === 0 && (
                <Tag tone="ok">
                  <Check size={12} />
                  All settled
                </Tag>
              )}
            </div>
          </BandCard>
        </Container>
      </Band>

      <Container className="mt-8">
        {mine.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-[14px] text-muted">No bills on record.</p>
          </Card>
        ) : (
          <ul className="space-y-2.5">
            {mine.map((i, idx) => {
              const v = Array.isArray(i.visits) ? i.visits[0] : i.visits;
              const due = Number(i.total) - Number(i.amount_paid ?? 0);
              const paid = i.payment_status === "Paid";
              return (
                <Card
                  as="li"
                  key={i.id}
                  className="rise p-4"
                  style={{ "--i": Math.min(idx, 6) } as React.CSSProperties}
                >
                  <div className="flex items-center gap-3.5">
                    <span
                      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                        paid ? "bg-ok-soft text-ok" : "bg-brand-soft text-brand"
                      }`}
                    >
                      {paid ? <Check size={18} /> : <Wallet size={18} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono num text-[14.5px] font-medium text-text">
                        {v?.visit_id ?? "Visit"}
                      </p>
                      <p className="mt-0.5 text-[12px] text-muted">
                        {new Date(i.created_at).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-mono num text-[15px] font-semibold text-text">
                        ₹{Number(i.total).toFixed(0)}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-muted">
                        {i.payment_status}
                      </p>
                    </div>
                  </div>

                  {!paid && (
                    <div className="mt-3.5 border-t border-line pt-3.5">
                      <Link
                        href={`/invoices/${i.id}/pay`}
                        className="tap inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 font-mono num text-[12.5px] font-semibold text-brand-fg hover:bg-brand-hover"
                      >
                        Pay ₹{due.toFixed(0)}
                        <ArrowRight size={13} />
                      </Link>
                    </div>
                  )}
                </Card>
              );
            })}
          </ul>
        )}
      </Container>
    </>
  );
}
