import { useQuery } from "@tanstack/react-query";
import { call } from "@/lib/api";
import { Link } from "react-router-dom";
import type { PaymentLinksStats } from "@shared/api";

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

  if (!data || data.activeCount === 0) return null;

  return (
    <Link
      to="/invoices?filter=unpaid-with-link"
      className="block p-4 bg-white rounded shadow hover:bg-gray-50"
    >
      <div className="text-sm text-gray-500">Open payment links</div>
      <div className="text-2xl font-semibold">{data.activeCount}</div>
      <div className="text-sm text-gray-500">
        Rs. {data.activeOutstandingTotal.toFixed(2)} outstanding
      </div>
    </Link>
  );
}
