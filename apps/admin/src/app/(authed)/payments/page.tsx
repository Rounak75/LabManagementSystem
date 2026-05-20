import { getSessionUser } from "@/lib/auth-session";
import { listUnpaidInvoices } from "@/lib/data-payments";
import { PaymentRow } from "./PaymentRow";
import Link from "next/link";

export default async function PaymentsPage() {
  const user = (await getSessionUser())!;
  const invoices = await listUnpaidInvoices(user.token);
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Payments</h1>
        <Link href="/payments/claims" className="text-sm text-blue-600 hover:underline">
          Open claims
        </Link>
      </div>
      {invoices.length === 0 ? (
        <p className="text-sm text-gray-500">No outstanding invoices.</p>
      ) : (
        <ul className="bg-white rounded border divide-y">
          {invoices.map((inv) => (
            <PaymentRow key={inv.id as string} invoice={inv} />
          ))}
        </ul>
      )}
    </div>
  );
}
