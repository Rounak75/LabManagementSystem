const STYLES: Record<string, string> = {
  // Visit statuses. InProgress and PendingVerify were the same amber tint, and
  // they are the two that appear side by side in the visits list — so the one
  // state that needs an Admin looked exactly like the one that needs nothing.
  // PendingVerify is now the only *filled* chip in the app, which is what makes
  // it findable while scrolling a shift's worth of rows.
  Open: "bg-sky-50 text-sky-700 ring-sky-200",
  InProgress: "bg-amber-50 text-amber-800 ring-amber-200",
  PendingVerify: "bg-amber-700 text-white ring-amber-800",
  Completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  // slate-500 on slate-100 is 4.34:1 — just under AA, on the one status that
  // means a visit was abandoned.
  Cancelled: "bg-slate-100 text-slate-600 ring-slate-300",
  // Booking statuses
  Pending: "bg-amber-50 text-amber-800 ring-amber-300",
  Approved: "bg-sky-50 text-sky-700 ring-sky-200",
  Declined: "bg-rose-50 text-rose-700 ring-rose-200",
  // Payment statuses
  Partial: "bg-amber-50 text-amber-800 ring-amber-300",
  Paid: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

const LABELS: Record<string, string> = {
  PendingVerify: "Awaiting verify",
  InProgress: "In progress",
};

export function StatusBadge({ status }: { status: string }) {
  const cls = STYLES[status] ?? "bg-slate-100 text-slate-600 ring-slate-200";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}>
      {LABELS[status] ?? status}
    </span>
  );
}

export function SourceBadge({ source }: { source: string | null }) {
  if (source !== "admin") return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-100">
      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" />
      </svg>
      Phone
    </span>
  );
}
