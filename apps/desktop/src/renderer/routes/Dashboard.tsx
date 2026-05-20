import { useQuery } from "@tanstack/react-query";
import { call } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/stores/auth.store";
import { NotificationsFailedBadge } from "@/components/NotificationsFailedBadge";
import { PaymentLinksCard } from "@/components/PaymentLinksCard";
import { PaymentLinksFailedBadge } from "@/components/PaymentLinksFailedBadge";
import { SyncStatusCard } from "@/components/SyncStatusCard";
import { FreeTierUsageCard } from "@/components/FreeTierUsageCard";
import { BackfillProgressCard } from "@/components/BackfillProgressCard";
import type { DashboardStats } from "@shared/api";

const inrFmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function formatINR(n: number): string {
  return inrFmt.format(n);
}

function StatCard({
  value,
  label,
  delta,
  isCurrency,
  isLoading,
}: {
  value?: number;
  label: string;
  delta?: number;
  isCurrency?: boolean;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <Card className="flex-1 animate-pulse">
        <div className="h-9 w-24 rounded bg-slate-200" />
        <div className="mt-2 h-3 w-32 rounded bg-slate-200" />
      </Card>
    );
  }

  const display =
    value === undefined
      ? "—"
      : isCurrency
        ? formatINR(value)
        : value.toLocaleString("en-IN");

  let deltaNode: React.ReactNode = null;
  if (delta !== undefined) {
    let cls = "text-slate-500";
    let prefix = "";
    if (delta > 0) {
      cls = "text-emerald-600";
      prefix = "+";
    } else if (delta < 0) {
      cls = "text-rose-600";
    }
    deltaNode = (
      <div className={`mt-1 text-xs ${cls}`}>
        vs yesterday: {delta === 0 ? "—" : `${prefix}${delta}`}
      </div>
    );
  }

  return (
    <Card className="flex-1">
      <div className="text-4xl font-semibold text-slate-900">{display}</div>
      <div className="mt-1 text-sm text-slate-500">{label}</div>
      {deltaNode}
    </Card>
  );
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-500">
      {children}
    </h2>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["dashboard:stats"],
    queryFn: () => call<DashboardStats>("dashboard:stats"),
    refetchInterval: 60_000,
  });

  const today = data?.today;
  const money = data?.money;
  const backlog = data?.backlog;

  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        <h1 className="text-2xl font-semibold">Today</h1>
        {user?.role === "Admin" && <NotificationsFailedBadge />}
        {user?.role === "Admin" && <PaymentLinksFailedBadge />}
      </div>

      {isError && (
        <div className="mb-4 text-sm text-rose-600">
          Couldn't load dashboard. {(error as Error)?.message}
        </div>
      )}

      <section className="mb-8">
        <GroupHeading>Today's volume</GroupHeading>
        <div className="flex flex-wrap gap-4">
          <StatCard
            value={today?.visits}
            label="Visits today"
            delta={today?.deltaVisits}
            isLoading={isLoading}
          />
          <StatCard value={today?.tests} label="Tests run today" isLoading={isLoading} />
          <StatCard
            value={today?.reports}
            label="Reports generated today"
            isLoading={isLoading}
          />
          <StatCard
            value={today?.reportsPending}
            label="Reports pending"
            isLoading={isLoading}
          />
        </div>
      </section>

      {money !== null && (
        <section className="mb-8">
          <GroupHeading>Today's money</GroupHeading>
          <div className="flex flex-wrap gap-4">
            <StatCard
              value={money?.billed}
              label="Billed today"
              isCurrency
              isLoading={isLoading}
            />
            <StatCard
              value={money?.collected}
              label="Collected today"
              isCurrency
              isLoading={isLoading}
            />
            <StatCard
              value={money?.discount}
              label="Discount given"
              isCurrency
              isLoading={isLoading}
            />
          </div>
        </section>
      )}

      {user?.role === "Admin" && (
        <section className="mb-8">
          <GroupHeading>Payment links</GroupHeading>
          <div className="flex flex-wrap gap-4">
            <PaymentLinksCard />
          </div>
        </section>
      )}

      {user?.role === "Admin" && (
        <section className="mb-8">
          <GroupHeading>Cloud sync</GroupHeading>
          <div className="flex flex-wrap gap-4">
            <SyncStatusCard />
            <FreeTierUsageCard />
            <BackfillProgressCard />
          </div>
        </section>
      )}

      <section className="mb-8">
        <GroupHeading>Backlog</GroupHeading>
        <div className="flex flex-wrap gap-4">
          <StatCard
            value={backlog?.pendingResults}
            label="Tests pending lock"
            isLoading={isLoading}
          />
          <StatCard value={backlog?.openVisits} label="Open visits" isLoading={isLoading} />
          <StatCard
            value={backlog?.outsourcedSent}
            label="Outsourced awaiting return"
            isLoading={isLoading}
          />
        </div>
      </section>
    </div>
  );
}
