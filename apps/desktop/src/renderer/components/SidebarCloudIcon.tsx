import { useQuery } from "@tanstack/react-query";
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

export function SidebarCloudIcon() {
  const { data } = useQuery({
    queryKey: ["cloud", "status"],
    queryFn: () => call<CloudStatus>("cloud:getStatus", {}),
    refetchInterval: 30_000,
  });

  if (!data || !data.enabled) return null;

  const ageMs = data.lastPushAt ? Date.now() - new Date(data.lastPushAt).getTime() : Number.POSITIVE_INFINITY;
  let color = "bg-emerald-500";
  if (data.failedCount > 0 || ageMs > 5 * 60_000) color = "bg-rose-500";
  else if (ageMs > 60_000) color = "bg-amber-500";

  const tooltip = `Last sync: ${formatAge(data.lastPushAt)} — ${data.pendingCount} pending, ${data.failedCount} failed`;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
      title={tooltip}
    >
      <span className={`h-2 w-2 rounded-full ${color}`} aria-hidden="true" />
      <span>Cloud</span>
    </span>
  );
}
