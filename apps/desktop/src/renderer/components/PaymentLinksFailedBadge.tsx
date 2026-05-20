import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { call } from "@/lib/api";
import type { PaymentLinksStats } from "@shared/api";

/**
 * Polls every 30 s and renders a red badge when there are invoices with
 * paymentLinkStatus = "PollFailed". Admin-only — gate at the mount site.
 *
 * Shares the ["dashboard", "payment-links"] query key with PaymentLinksCard
 * so only one fetch is made when both are mounted.
 */
export function PaymentLinksFailedBadge() {
  const { data } = useQuery({
    queryKey: ["dashboard", "payment-links"],
    queryFn: () => call<PaymentLinksStats>("dashboard:paymentLinksStats", {}),
    refetchInterval: 30_000,
  });

  if (!data || data.failedCount === 0) return null;

  return (
    <Link
      to="/invoices?filter=poll-failed"
      className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-red-700 transition-colors"
    >
      <span className="tabular-nums">{data.failedCount}</span>
      <span>
        {data.failedCount === 1 ? "payment link failed" : "payment links failed"}
      </span>
    </Link>
  );
}
