import { getSessionUser } from "@/lib/auth-session";
import { listUnpaidInvoices } from "@/lib/data-payments";
import { PaymentRow } from "./PaymentRow";
import { PageHeader } from "@/components/PageHeader";
import Link from "next/link";

export default async function PaymentsPage() {
  const user = (await getSessionUser())!;
  const invoices = await listUnpaidInvoices(user.token);
  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle={invoices.length ? `${invoices.length} invoice${invoices.length === 1 ? "" : "s"} outstanding` : "All settled"}
      >
        <Link href="/payments/claims" className="btn-ghost">Open claims</Link>
      </PageHeader>

      {invoices.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-8 text-center text-sm text-slate-500">
          <svg viewBox="0 0 24 24" className="h-8 w-8 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" />
          </svg>
          No outstanding invoices — everyone&apos;s paid up.
        </div>
      ) : (
        <ul className="card divide-y divide-slate-100 overflow-hidden">
          {invoices.map((inv) => (
            <PaymentRow key={inv.id as string} invoice={inv} />
          ))}
        </ul>
      )}
    </div>
  );
}
