import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { call } from "@/lib/api";

interface CloudStatus {
  enabled: boolean;
  freeTierBytes: number | null;
  freeTierLimit: number;
}

function formatMB(b: number): string {
  return (b / (1024 * 1024)).toFixed(0) + " MB";
}

export function FreeTierUsageCard() {
  const { data } = useQuery({
    queryKey: ["cloud", "status"],
    queryFn: () => call<CloudStatus>("cloud:getStatus", {}),
    refetchInterval: 30_000,
  });

  if (!data || !data.enabled) return null;
  if (data.freeTierBytes == null) return null;

  const ratio = data.freeTierBytes / data.freeTierLimit;
  if (ratio < 0.6) return null;

  const tone = ratio >= 0.95 ? "rose" : "amber";
  const borderClass = tone === "rose" ? "border-l-4 border-rose-500" : "border-l-4 border-amber-500";
  const barClass = tone === "rose" ? "bg-rose-500" : "bg-amber-500";

  return (
    <Card className={`flex-1 ${borderClass}`}>
      <div className="text-sm font-medium text-slate-700">Supabase free-tier usage</div>
      <div className="mt-1 text-xs text-slate-500">
        {formatMB(data.freeTierBytes)} / {formatMB(data.freeTierLimit)} ({Math.round(ratio * 100)}%)
      </div>
      <div className="mt-2 h-2 w-full rounded-full bg-slate-200">
        <div className={`h-2 rounded-full ${barClass}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </div>
      {tone === "rose" && (
        <div className="mt-2 text-xs text-rose-700">Near free-tier limit — consider upgrading.</div>
      )}
    </Card>
  );
}
