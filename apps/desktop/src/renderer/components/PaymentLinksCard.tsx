import { useQuery } from "@tanstack/react-query";
import { call } from "@/lib/api";
import { Link } from "react-router-dom";
import type { PaymentLinksStats } from "@shared/api";
import { Card } from "@/components/ui/Card";

/**
 * Shows a summary card of invoices with active Razorpay payment links.
 * Renders nothing if there are no active links.
 * Admin-only — gate at the mount site.
 */

export function PaymentLinksCard() {
  const { data } = useQuery({
    queryKey: ["dashboard", "payment-links"],
    queryFn: () => call<PaymentLinksStats>("dashboard:paymentLinksStats", {}),
    refetchInterval: 30_000,
  });

  if (!data || data.activeCount === 0) {
    return (
      <div className="flex w-full items-center justify-center rounded-[2rem] border border-dashed border-slate-200/60 bg-slate-50 p-6 text-sm font-medium text-slate-400">
        No active payment links
      </div>
    );
  }

  return (
    <Link to="/invoices?filter=unpaid-with-link" className="group block flex-1">
      <Card className="flex-1 transition-transform duration-500 ease-out-fluid group-hover:-translate-y-1">
        <div className="font-display text-5xl font-bold tracking-tight text-slate-900">{data.activeCount}</div>
        <div className="mt-2 text-sm font-medium text-slate-500">Open payment links</div>
        <div className="mt-3 inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-slate-500">
          Rs. {data.activeOutstandingTotal.toFixed(2)} outstanding
        </div>
      </Card>
    </Link>
  );
}
