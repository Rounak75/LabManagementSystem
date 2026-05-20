import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { call } from "@/lib/api";

type NotificationRow = {
  id: string;
  channel: string;
  recipient: string | null;
  status: string;
  scheduledFor: string | null;
  sentAt: string | null;
};

function statusColor(status: string): string {
  switch (status) {
    case "Sent":              return "text-green-700";
    case "Failed":            return "text-red-700";
    case "WaitingForPayment": return "text-amber-700";
    case "Sending":           return "text-blue-700";
    default:                  return "text-slate-500";
  }
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffS  = Math.round(diffMs / 1000);
  if (diffS < 60)   return `${diffS}s ago`;
  const diffM = Math.round(diffS / 60);
  if (diffM < 60)   return `${diffM}m ago`;
  const diffH = Math.round(diffM / 60);
  return `${diffH}h ago`;
}

function pendingLabel(scheduledFor: string | null | undefined): string {
  if (!scheduledFor) return "Pending";
  const diffMs = new Date(scheduledFor).getTime() - Date.now();
  if (diffMs <= 0) return "Pending (sending soon)";
  const diffS = Math.round(diffMs / 1000);
  if (diffS < 60)   return `Pending (sends in ${diffS}s)`;
  const diffM = Math.round(diffS / 60);
  return `Pending (sends in ${diffM}m)`;
}

function formatEntry(n: NotificationRow): string {
  const to = n.recipient ?? "unknown";
  const channelLabel = `${n.channel} to ${to}`;

  if (n.status === "Sent" && n.sentAt) {
    return `${channelLabel} — Sent ${relativeTime(n.sentAt)}`;
  }
  if (n.status === "Pending" || n.status === "WaitingForPayment") {
    return `${channelLabel} — ${pendingLabel(n.scheduledFor)}`;
  }
  return `${channelLabel} — ${n.status}`;
}

interface Props {
  visitId: string;
}

/**
 * Compact one-line notification summary for a visit, shown on the VisitDetail
 * page. Renders nothing when there are no notifications for this visit.
 */
export function VisitNotificationsLine({ visitId }: Props) {
  const { data } = useQuery({
    queryKey: ["notifications:list", { visitId }],
    queryFn: () =>
      call<{ rows: NotificationRow[]; total: number }>("notifications:list", { visitId }),
    enabled: !!visitId,
  });

  const rows = data?.rows ?? [];
  if (rows.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {rows.map((n) => (
        <span key={n.id} className={statusColor(n.status)}>
          {formatEntry(n)}
        </span>
      ))}
      <Link
        to={`/notifications?visitId=${visitId}`}
        className="ml-1 text-slate-400 underline hover:text-slate-600"
      >
        View all
      </Link>
    </div>
  );
}
