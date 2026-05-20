// Phase 3d Plan E — portal pay page. UPI direct is the default path (Razorpay
// is dormant until KYC clears; flipped on by LabSettings.preferredPaymentGateway).
// "Already paid?" submits a PaymentClaim (soft signal for staff — no auto-reconcile).

import { redirect } from "next/navigation";
import { requirePatient } from "@portal/lib/session";
import { getServiceClient } from "@portal/lib/supabase-server";
import { PayClient } from "./PayClient";

export const runtime = "nodejs";

export default async function PayPage({ params }: { params: { id: string } }) {
  let session;
  try { session = await requirePatient(); } catch { redirect("/login"); }
  const sb = getServiceClient();

  const { data: invoice } = await sb
    .from("invoices")
    .select("id, total, amount_paid, payment_status, razorpay_payment_link_short_url, visits(visit_id, patient_id, patients(name))")
    .eq("id", params.id)
    .maybeSingle();
  if (!invoice) redirect("/invoices");
  const v = Array.isArray(invoice.visits) ? invoice.visits[0] : invoice.visits;
  if (v?.patient_id !== session!.patientId) redirect("/invoices");
  const patient = v
    ? Array.isArray(v.patients)
      ? v.patients[0]
      : (v.patients as { name?: string } | null | undefined)
    : null;

  const { data: settings } = await sb
    .from("lab_settings")
    .select("lab_upi_vpa, lab_upi_payee_name, preferred_payment_gateway")
    .eq("id", "singleton")
    .maybeSingle();

  const due = Number(invoice.total) - Number(invoice.amount_paid ?? 0);

  return (
    <PayClient
      invoice={{
        id: invoice.id,
        visitDisplayId: v?.visit_id ?? "",
        patientName: patient?.name ?? "",
        total: Number(invoice.total),
        amountPaid: Number(invoice.amount_paid ?? 0),
        paymentStatus: invoice.payment_status,
        due,
        razorpayLink: invoice.razorpay_payment_link_short_url ?? null,
      }}
      lab={{
        upiVpa: settings?.lab_upi_vpa ?? null,
        upiPayeeName: settings?.lab_upi_payee_name ?? null,
        preferredGateway: (settings?.preferred_payment_gateway as "UPI" | "Razorpay") ?? "UPI",
      }}
    />
  );
}
