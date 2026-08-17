import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import { call } from "@/lib/api";

interface CloudStatus {
  enabled: boolean;
  lastPushAt: string | null;
  pendingCount: number;
  failedCount: number;
  /** Cloud rows quarantined after repeatedly failing to apply locally. */
  stuckRowCount: number;
  lastTickErrors: string[];
  cloudUnreachable: boolean;
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
  // Pull health counts as much as push health: rows stuck coming *down* mean
  // results typed at the lab are not reaching this machine.
  const stuck = data.stuckRowCount ?? 0;
  const pullErrors = data.lastTickErrors?.length ?? 0;
  let tone: "green" | "yellow" | "red" = "green";
  let label = "Cloud sync: healthy";
  if (data.failedCount > 0 || stuck > 0 || ageMs > 5 * 60_000) {
    tone = "red";
    label = "Cloud sync: error";
  } else if (data.cloudUnreachable) {
    tone = "yellow";
    label = "Cloud sync: offline";
  } else if (pullErrors > 0 || ageMs > 60_000) {
    tone = "yellow";
    label = "Cloud sync: slow";
  }

  const toneDot =
    tone === "green" ? "bg-status-success" :
    tone === "yellow" ? "bg-status-pending" :
    "bg-status-error";

  return (
    <Card className="flex-1">
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${toneDot}`} />
        <div className="text-sm font-medium text-slate-700">{label}</div>
      </div>
      <div className="mt-1 text-xs text-slate-500">Last push: {formatAge(data.lastPushAt)}</div>
      {data.failedCount > 0 && (
        <Link to="/sync?status=Failed" className="mt-1 inline-block text-xs text-rose-600 underline">
          {data.failedCount} failed
        </Link>
      )}
      {stuck > 0 && (
        <div className="mt-1 text-xs text-rose-600">
          {stuck} incoming {stuck === 1 ? "row" : "rows"} stuck — results from the lab may be
          missing
        </div>
      )}
      {data.pendingCount > 0 && (
        <div className="mt-1 text-xs text-slate-500">{data.pendingCount} pending</div>
      )}
    </Card>
  );
}
