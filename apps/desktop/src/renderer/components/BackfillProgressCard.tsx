import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { call } from "@/lib/api";

interface CloudStatus {
  enabled: boolean;
  backfillCompletedAt: string | null;
  pendingCount: number;
}

export function BackfillProgressCard() {
  const { data } = useQuery({
    queryKey: ["cloud", "status"],
    queryFn: () => call<CloudStatus>("cloud:getStatus", {}),
    refetchInterval: 30_000,
  });

  if (!data || !data.enabled) return null;
  if (data.backfillCompletedAt) return null;
  if (data.pendingCount === 0) return null;

  return (
    <Card className="flex-1 border-l-4 border-blue-500">
      <div className="text-sm font-medium text-slate-700">Backfilling cloud sync</div>
      <div className="mt-1 text-xs text-slate-500">
        {data.pendingCount} events pending — pushed in the background.
      </div>
    </Card>
  );
}
