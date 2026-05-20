import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import { call } from "@/lib/api";

interface CloudStatus {
  enabled: boolean;
  lastPushAt: string | null;
  pendingCount: number;
  failedCount: number;
}

function formatAge(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  return `${Math.round(ms / 3_600_000)}h ago`;
}

export function SyncStatusCard() {
  const { data } = useQuery({
    queryKey: ["cloud", "status"],
    queryFn: () => call<CloudStatus>("cloud:getStatus", {}),
    refetchInterval: 30_000,
  });

  if (!data || !data.enabled) return null;

  const ageMs = data.lastPushAt ? Date.now() - new Date(data.lastPushAt).getTime() : Number.POSITIVE_INFINITY;
  let tone: "green" | "yellow" | "red" = "green";
  let label = "Cloud sync: healthy";
  if (data.failedCount > 0 || ageMs > 5 * 60_000) {
    tone = "red";
    label = "Cloud sync: error";
  } else if (ageMs > 60_000) {
    tone = "yellow";
    label = "Cloud sync: slow";
  }

  const toneClass =
    tone === "green" ? "border-l-4 border-emerald-500" :
    tone === "yellow" ? "border-l-4 border-amber-500" :
    "border-l-4 border-rose-500";

  return (
    <Card className={`flex-1 ${toneClass}`}>
      <div className="text-sm font-medium text-slate-700">{label}</div>
      <div className="mt-1 text-xs text-slate-500">Last push: {formatAge(data.lastPushAt)}</div>
      {data.failedCount > 0 && (
        <Link to="/sync?status=Failed" className="mt-1 inline-block text-xs text-rose-600 underline">
          {data.failedCount} failed
        </Link>
      )}
      {data.pendingCount > 0 && (
        <div className="mt-1 text-xs text-slate-500">{data.pendingCount} pending</div>
      )}
    </Card>
  );
}
