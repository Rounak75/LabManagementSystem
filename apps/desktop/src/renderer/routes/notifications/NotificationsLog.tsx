import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, Fragment } from "react";
import { call } from "@/lib/api";
import { useToast } from "@/lib/toast.store";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const PAGE_SIZE = 50;

const STATUS_OPTIONS = ["Pending", "Sending", "Sent", "Failed", "WaitingForPayment"] as const;
const CHANNEL_OPTIONS = ["SMS", "Email"] as const;
const PURPOSE_OPTIONS = ["ReportReady", "VisitBooked", "PaymentDue", "HomeVisitReminder"] as const;

function formatDate(val: string | null | undefined): string {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleString();
  } catch {
    return val;
  }
}

function statusClass(status: string): string {
  switch (status) {
    case "Sent":               return "text-green-700 font-medium";
    case "Failed":             return "text-red-700 font-medium";
    case "WaitingForPayment":  return "text-amber-700 font-medium";
    case "Sending":            return "text-blue-700 font-medium";
    default:                   return "text-slate-600";
  }
}

export default function NotificationsLog() {
  const qc = useQueryClient();
  const toast = useToast();

  const [status,  setStatus]  = useState("");
  const [channel, setChannel] = useState("");
  const [purpose, setPurpose] = useState("");
  const [page,    setPage]    = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["notifications:list", status, channel, purpose, page],
    queryFn: () =>
      call<{ rows: any[]; total: number }>("notifications:list", {
        status:   status   || undefined,
        channel:  channel  || undefined,
        purpose:  purpose  || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  const rows  = data?.rows  ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const retry = useMutation({
    mutationFn: (id: string) => call("notifications:retry", { id }),
    onSuccess: () => {
      toast.success("Queued for retry.");
      qc.invalidateQueries({ queryKey: ["notifications:list"] });
    },
    onError: (err: any) => {
      toast.error(err?.message ?? "Retry failed.");
    },
  });

  const cancel = useMutation({
    mutationFn: (id: string) => call("notifications:cancel", { id }),
    onSuccess: () => {
      toast.success("Notification cancelled.");
      qc.invalidateQueries({ queryKey: ["notifications:list"] });
    },
    onError: (err: any) => {
      toast.error(err?.message ?? "Cancel failed.");
    },
  });

  function onFilterChange<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setPage(1); };
  }

  function resetFilters() {
    setStatus(""); setChannel(""); setPurpose(""); setPage(1);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Notifications log</h1>
      </div>

      {/* Filters */}
      <Card className="mb-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Status</span>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={status}
              onChange={(e) => onFilterChange(setStatus)(e.target.value)}
            >
              <option value="">All</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Channel</span>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={channel}
              onChange={(e) => onFilterChange(setChannel)(e.target.value)}
            >
              <option value="">All</option>
              {CHANNEL_OPTIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Purpose</span>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={purpose}
              onChange={(e) => onFilterChange(setPurpose)(e.target.value)}
            >
              <option value="">All</option>
              {PURPOSE_OPTIONS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>

          <div className="flex items-end">
            <Button variant="secondary" onClick={resetFilters} className="w-full">
              Reset filters
            </Button>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="p-0">
        {isLoading ? (
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left">
              <tr>
                {["Created At", "Channel", "Purpose", "To", "Status", "Attempts", "Next Attempt At", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t animate-pulse">
                  {Array.from({ length: 8 }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-3 bg-slate-200 rounded w-24" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-4xl mb-3">&#128276;</div>
            <div className="text-lg font-medium text-slate-700 mb-1">No notifications</div>
            <div className="text-sm text-slate-500 max-w-xs">
              No notifications match the current filters.
            </div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left">
              <tr>
                <th className="px-4 py-3 w-6" />
                <th className="px-4 py-3">Created At</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Purpose</th>
                <th className="px-4 py-3">To</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Attempts</th>
                <th className="px-4 py-3">Next Attempt At</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => {
                const isOpen = expanded === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr className="border-t align-top hover:bg-slate-50 transition-colors">
                      {/* Chevron toggle */}
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          className="text-slate-400 hover:text-slate-700"
                          aria-label={isOpen ? "Collapse row" : "Expand row"}
                          onClick={() => setExpanded(isOpen ? null : r.id)}
                        >
                          {isOpen ? "▾" : "▸"}
                        </button>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                        {formatDate(r.createdAt)}
                      </td>
                      <td className="px-4 py-3">{r.channel}</td>
                      <td className="px-4 py-3">{r.purpose}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">
                        {r.recipient ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={statusClass(r.status)}>{r.status}</span>
                      </td>
                      <td className="px-4 py-3 text-center">{r.attempts}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                        {formatDate(r.nextAttemptAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          {r.status === "Failed" && (
                            <button
                              type="button"
                              className="text-brand hover:underline disabled:opacity-50"
                              disabled={retry.isPending}
                              onClick={() => retry.mutate(r.id)}
                            >
                              Retry
                            </button>
                          )}
                          {r.status === "Pending" && (
                            <button
                              type="button"
                              className="text-red-600 hover:underline disabled:opacity-50"
                              disabled={cancel.isPending}
                              onClick={() => cancel.mutate(r.id)}
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Expanded detail panel */}
                    {isOpen && (
                      <tr className="border-t bg-slate-50">
                        <td colSpan={9} className="px-6 py-4">
                          <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
                            {r.channel === "Email" && (
                              <div>
                                <span className="font-semibold text-slate-600">Subject: </span>
                                <span className="text-slate-800">{r.subject ?? "—"}</span>
                              </div>
                            )}
                            <div className="sm:col-span-2 lg:col-span-3">
                              <span className="font-semibold text-slate-600">Body/Payload: </span>
                              <pre className="mt-1 overflow-x-auto rounded bg-white p-2 text-xs text-slate-800 shadow-inner whitespace-pre-wrap">
                                {r.payload ?? "(not yet rendered)"}
                              </pre>
                            </div>
                            <div>
                              <span className="font-semibold text-slate-600">Scheduled for: </span>
                              <span className="text-slate-800">{formatDate(r.scheduledFor)}</span>
                            </div>
                            <div>
                              <span className="font-semibold text-slate-600">Next attempt at: </span>
                              <span className="text-slate-800">{formatDate(r.nextAttemptAt)}</span>
                            </div>
                            <div>
                              <span className="font-semibold text-slate-600">Sent at: </span>
                              <span className="text-slate-800">{formatDate(r.sentAt)}</span>
                            </div>
                            <div>
                              <span className="font-semibold text-slate-600">Message ID: </span>
                              <span className="font-mono text-slate-800">{r.messageId ?? "—"}</span>
                            </div>
                            {r.error && (
                              <div className="sm:col-span-2 lg:col-span-3">
                                <span className="font-semibold text-red-600">Last error: </span>
                                <span className="text-red-700">{r.error}</span>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
        <div>
          Page {page} of {totalPages} ({total} total)
          {isFetching && !isLoading && (
            <span className="ml-2 text-slate-400">refreshing…</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </Button>
          <Button
            variant="secondary"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
