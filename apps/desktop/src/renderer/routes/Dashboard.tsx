import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { call } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { StatCard } from "@/components/ui/StatCard";
import { QuickActionCard } from "@/components/ui/QuickActionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useAuth } from "@/stores/auth.store";
import { NotificationsFailedBadge } from "@/components/NotificationsFailedBadge";
import { PaymentLinksCard } from "@/components/PaymentLinksCard";
import { PaymentLinksFailedBadge } from "@/components/PaymentLinksFailedBadge";
import { BackupStatusCard } from "@/components/BackupStatusCard";
import {
  Users, TestTube, FileText, Clock,
  PlusCircle, Calendar, FlaskConical, FileBarChart,
  Wallet, CheckCircle2, AlertCircle, ListChecks,
  RefreshCw
} from "lucide-react";

import type { DashboardStats } from "@shared/api";
import { labDate } from "@shared/lab-date";

const inrFmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function formatINR(n: number): string {
  return inrFmt.format(n);
}

function trendFor(delta: number | undefined): { value: string; direction: "up" | "down" | "neutral" } | undefined {
  if (delta === undefined) return undefined;
  if (delta > 0) return { value: `+${delta} vs yesterday`, direction: "up" };
  if (delta < 0) return { value: `${delta} vs yesterday`, direction: "down" };
  return { value: "0% vs yesterday", direction: "neutral" };
}

function PipelineStat({ label, value, color }: { label: string; value?: number; color: string }) {
  return (
    <div className="flex-1 text-center">
      <div className="mb-2 flex items-center justify-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${color}`} />
        <span className="text-xs font-medium text-slate-500">{label}</span>
      </div>
      <div className="text-2xl font-semibold text-slate-900">{value ?? 0}</div>
      <div className="mt-0.5 text-xs text-slate-400">samples</div>
    </div>
  );
}

function ReportStatusCol({ label, value, icon, trend }: { label: string; value?: number; icon: React.ReactNode; trend?: string }) {
  return (
    <div className="flex-1 text-center">
      <div className="mb-2 flex items-center justify-center gap-1.5">
        {icon}
        <span className="text-xs font-medium text-slate-500">{label}</span>
      </div>
      <div className="text-2xl font-semibold text-slate-900">{value ?? 0}</div>
      <div className="mt-0.5 text-xs text-slate-400">reports</div>
      {trend ? <div className="mt-1 text-xs text-slate-400">{trend}</div> : null}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ["dashboard:stats"],
    queryFn: () => call("dashboard:stats"),
    refetchInterval: 60_000,
  });

  const today = data?.today;
  const money = data?.money;
  const backlog = data?.backlog;

  const todayDate = labDate(new Date());

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Overview of today's laboratory operations"
        actions={
          <div className="flex items-center gap-3">
            {user?.role === "Admin" ? <NotificationsFailedBadge /> : null}
            {user?.role === "Admin" ? <PaymentLinksFailedBadge /> : null}
            <Button variant="secondary" size="sm" className="gap-2">
              <Calendar className="h-4 w-4" />
              {todayDate}
            </Button>
            <Button 
              variant="secondary" 
              size="sm" 
              className="group gap-2"
              disabled={isFetching}
              onClick={() => qc.invalidateQueries({ queryKey: ["dashboard:stats"] })}
            >
              <RefreshCw className={`h-4 w-4 transition-transform duration-500 ease-in-out ${isFetching ? 'animate-spin' : 'group-hover:rotate-180'}`} />
              {isFetching ? "Refreshing..." : "Refresh"}
            </Button>
          </div>
        }
      />

      {isError ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Couldn't load dashboard. {(error as Error)?.message}
        </div>
      ) : null}

      {/* Above the day's numbers on purpose: an unwritten off-machine backup is
          the only thing on this page that cannot be put right later. Renders
          nothing at all while backups are healthy — and carries its own margin
          so that a healthy lab gets no empty gap here. */}
      <BackupStatusCard />

      {/* Today's Operations */}
      <section className="mb-8">
        <SectionHeading>Today's Operations</SectionHeading>
        <div className="grid grid-cols-4 gap-4">
          <StatCard
            icon={<Users className="h-5 w-5" />}
            value={today?.visits ?? 0}
            label="Visits today"
            trend={trendFor(today?.deltaVisits)}
            isLoading={isLoading}
          />
          <StatCard
            icon={<TestTube className="h-5 w-5" />}
            value={today?.tests ?? 0}
            label="Tests run today"
            trend={trendFor(undefined)}
            isLoading={isLoading}
          />
          <StatCard
            icon={<FileText className="h-5 w-5" />}
            value={today?.reports ?? 0}
            label="Reports generated today"
            trend={trendFor(undefined)}
            isLoading={isLoading}
          />
          <StatCard
            icon={<Clock className="h-5 w-5" />}
            value={today?.reportsPending ?? 0}
            label="Reports pending"
            trend={trendFor(undefined)}
            isLoading={isLoading}
          />
        </div>
      </section>

      {/* Sample Pipeline + Report Status */}
      <section className="mb-8 grid grid-cols-2 gap-4">
        <div>
          <SectionHeading>Sample Pipeline</SectionHeading>
          <Card>
            <div className="flex divide-x divide-slate-100">
              <PipelineStat label="Collected" value={0} color="bg-status-success" />
              <PipelineStat label="Processing" value={0} color="bg-orange-400" />
              <PipelineStat label="Completed" value={0} color="bg-status-processing" />
              <PipelineStat label="Rejected" value={0} color="bg-status-error" />
            </div>
          </Card>
        </div>
        <div>
          <SectionHeading>Reports Status</SectionHeading>
          <Card>
            <div className="flex divide-x divide-slate-100">
              <ReportStatusCol label="Generated" value={today?.reports} icon={<FileText className="h-3.5 w-3.5 text-status-processing" />} trend="0% vs yesterday" />
              <ReportStatusCol label="Pending" value={today?.reportsPending} icon={<AlertCircle className="h-3.5 w-3.5 text-status-pending" />} trend={today?.reportsPending ? `↑ ${today.reportsPending} vs yesterday` : undefined} />
              <ReportStatusCol label="Delayed" value={0} icon={<AlertCircle className="h-3.5 w-3.5 text-status-error" />} trend="0% vs yesterday" />
            </div>
          </Card>
        </div>
      </section>

      {/* Revenue + Pending Actions */}
      <section className="mb-8 grid grid-cols-2 gap-4">
        <div>
          <SectionHeading>Today's Revenue</SectionHeading>
          <Card>
            <div className="flex items-start gap-4 mb-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-brand">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <div className="text-2xl font-semibold text-slate-900">{formatINR(money?.billed ?? 0)}</div>
                <div className="text-sm text-slate-500">Total revenue</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
              <div>
                <div className="mb-1 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-status-success" />
                  <span className="text-xs text-slate-500">Collected</span>
                </div>
                <div className="text-lg font-semibold text-slate-900">{formatINR(money?.collected ?? 0)}</div>
                <div className="text-xs text-slate-400">{money?.billed ? Math.round(((money?.collected ?? 0) / money.billed) * 100) : 0}% of total</div>
              </div>
              <div>
                <div className="mb-1 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-status-pending" />
                  <span className="text-xs text-slate-500">Pending</span>
                </div>
                <div className="text-lg font-semibold text-slate-900">{formatINR((money?.billed ?? 0) - (money?.collected ?? 0))}</div>
                <div className="text-xs text-slate-400">{money?.billed ? Math.round((((money?.billed ?? 0) - (money?.collected ?? 0)) / money.billed) * 100) : 0}% of total</div>
              </div>
            </div>
          </Card>
        </div>
        <div>
          <SectionHeading>Pending Actions</SectionHeading>
          <Card className="h-[calc(100%-2rem)]">
            {(backlog?.pendingResults ?? 0) === 0 && (backlog?.openVisits ?? 0) === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <ListChecks className="h-6 w-6" />
                </div>
                <div className="text-sm font-medium text-slate-700">No pending actions</div>
                <div className="text-xs text-slate-500">All tasks are up to date</div>
              </div>
            ) : (
              <div className="space-y-3">
                {(backlog?.pendingResults ?? 0) > 0 ? (
                  <div className="flex items-center justify-between rounded-lg bg-amber-50 px-4 py-3">
                    <span className="text-sm text-slate-700">{backlog?.pendingResults} tests pending lock</span>
                    <StatusBadge variant="pending">Pending</StatusBadge>
                  </div>
                ) : null}
                {(backlog?.openVisits ?? 0) > 0 ? (
                  <div className="flex items-center justify-between rounded-lg bg-blue-50 px-4 py-3">
                    <span className="text-sm text-slate-700">{backlog?.openVisits} open visits</span>
                    <StatusBadge variant="processing">Active</StatusBadge>
                  </div>
                ) : null}
                {(backlog?.outsourcedSent ?? 0) > 0 ? (
                  <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
                    <span className="text-sm text-slate-700">{backlog?.outsourcedSent} outsourced awaiting return</span>
                    <StatusBadge variant="neutral">Waiting</StatusBadge>
                  </div>
                ) : null}
              </div>
            )}
          </Card>
        </div>
      </section>

      {/* Payment Links (Admin only) */}
      {user?.role === "Admin" ? (
        <section className="mb-8">
          <SectionHeading>Payment Links</SectionHeading>
          <PaymentLinksCard />
        </section>
      ) : null}

      {/* Quick Actions */}
      <section className="mb-8">
        <SectionHeading>Quick Actions</SectionHeading>
        <div className="grid grid-cols-4 gap-4">
          <QuickActionCard
            icon={<PlusCircle className="h-5 w-5" />}
            title="New Visit"
            description="Create a new patient visit"
            onClick={() => nav("/visits/new")}
          />
          <QuickActionCard
            icon={<Calendar className="h-5 w-5" />}
            title="New Booking"
            description="Schedule a new booking"
            onClick={() => nav("/bookings")}
          />
          <QuickActionCard
            icon={<FlaskConical className="h-5 w-5" />}
            title="Run Test"
            description="Record test result"
            onClick={() => nav("/reports")}
          />
          <QuickActionCard
            icon={<FileBarChart className="h-5 w-5" />}
            title="Generate Report"
            description="Generate patient report"
            onClick={() => nav("/reports")}
          />
        </div>
      </section>
    </div>
  );
}
