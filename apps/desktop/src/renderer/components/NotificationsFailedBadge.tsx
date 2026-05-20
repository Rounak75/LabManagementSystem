import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { call } from "@/lib/api";

/**
 * Polls the count of Failed notifications every 30 s and renders a red badge
 * when the count is > 0. Admin-only — gate at the mount site.
 */
export function NotificationsFailedBadge() {
  const { data } = useQuery({
    queryKey: ["notifications:failedCount"],
    queryFn: () => call<number>("notifications:failedCount"),
    refetchInterval: 30_000,
  });

  if (!data || data <= 0) return null;

  return (
    <Link
      to="/notifications?status=Failed"
      className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-red-700 transition-colors"
    >
      <span className="tabular-nums">{data}</span>
      <span>{data === 1 ? "notification failed" : "notifications failed"}</span>
    </Link>
  );
}
