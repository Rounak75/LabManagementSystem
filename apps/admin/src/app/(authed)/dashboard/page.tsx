import Link from "next/link";
import { getSessionUser } from "@/lib/auth-session";
import { countPendingVerify, countOpenVisits, countVisitsToday } from "@/lib/data-visits";
import { countPendingBookings } from "@/lib/data-bookings";
import { listUnpaidInvoices } from "@/lib/data-payments";
import { formatINR } from "@/lib/format";
import { StatCard } from "@/components/StatCard";

const icons = {
  verify: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m9 11 3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  open: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
    </svg>
  ),
  money: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 3h12M6 8h12M9 3a6 6 0 0 1 0 12H6l8 6M6 8a6 6 0 0 0 6 6" />
    </svg>
  ),
  booking: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 11l19-9-9 19-2-8-8-2z" />
    </svg>
  ),
  today: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  ),
};

export default async function DashboardPage() {
  const user = (await getSessionUser())!;
  const isAdmin = user.role === "Admin";

  const [pendingVerify, openVisits, todayVisits, pendingBookings, invoices] = await Promise.all([
    isAdmin ? countPendingVerify(user.token) : Promise.resolve(0),
    countOpenVisits(user.token),
    countVisitsToday(user.token),
    countPendingBookings(user.token),
    listUnpaidInvoices(user.token),
  ]);

  const outstanding = invoices.reduce(
    (sum, inv) => sum + (Number(inv.total ?? 0) - Number(inv.amount_paid ?? 0)),
    0,
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Welcome back, {user.username}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Signed in as <span className="font-medium text-slate-700">{user.role}</span> · here&apos;s what needs attention.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/patients/new" className="btn-primary">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New patient
          </Link>
          <Link href="/visits/new" className="btn-ghost">New visit</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {isAdmin && (
          <StatCard
            href="/visits?status=PendingVerify"
            label="Awaiting verify"
            value={pendingVerify}
            tone="amber"
            icon={icons.verify}
            urgent={pendingVerify > 0}
            hint={pendingVerify > 0 ? "Review now" : "All clear"}
          />
        )}
        <StatCard href="/visits?status=Open" label="Open visits" value={openVisits} tone="sky" icon={icons.open} hint="Enter results" />
        <StatCard href="/payments" label="Outstanding" value={formatINR(outstanding)} tone="emerald" icon={icons.money} hint="Collect" />
        <StatCard href="/bookings?status=Pending" label="Pending bookings" value={pendingBookings} tone="brand" icon={icons.booking} urgent={pendingBookings > 0} hint="Approve" />
        <StatCard href="/visits" label="Registered today" value={todayVisits} tone="slate" icon={icons.today} hint="All visits" />
      </div>

      {isAdmin && pendingVerify === 0 && (
        <div className="mt-6 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" />
          </svg>
          You&apos;re all caught up — no visits waiting to be verified.
        </div>
      )}
    </div>
  );
}
