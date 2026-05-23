import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, Fragment } from "react";
import { call } from "@/lib/api";
import { useToast } from "@/lib/toast.store";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";

const PAGE_SIZE = 50;

const STATUS_OPTIONS = ["Pending", "Sent", "Failed", "Cancelled"] as const;
const TABLE_OPTIONS = [
  "patients", "visits", "visit_tests", "results", "invoices",
  "payments", "doctors", "tests", "parameters", "lab_settings", "home_visits",
] as const;

function formatDate(val: string | Date | null | undefined): string {
  if (!val) return "—";
  try { return new Date(val).toLocaleString(); } catch { return String(val); }
}

function statusClass(status: string): string {
  switch (status) {
    case "Sent":      return "text-green-700 font-medium";
    case "Failed":    return "text-red-700 font-medium";
    case "Cancelled": return "text-slate-500 font-medium";
    case "Pending":   return "text-blue-700 font-medium";
    default:          return "text-slate-600";
  }
}

export default function SyncLog() {
  const qc = useQueryClient();
  const toast = useToast();

  const [status, setStatus] = useState("");
  const [tableName, setTableName] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: rows = [], isLoading, isFetching } = useQuery({
    queryKey: ["cloud:listOutbox", status, tableName, page],
    queryFn: () =>
      call<any[]>("cloud:listOutbox", {
        status: status || undefined,
        tableName: tableName || undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
  });

  const retry = useMutation({
    mutationFn: (id: string) => call("cloud:retryOutbox", { id }),
    onSuccess: () => { toast.success("Queued for retry."); qc.invalidateQueries({ queryKey: ["cloud:listOutbox"] }); },
    onError: (err: any) => { toast.error(err?.message ?? "Retry failed."); },
  });

  const cancel = useMutation({
    mutationFn: (id: string) => call("cloud:cancelOutbox", { id }),
    onSuccess: () => { toast.success("Cancelled."); qc.invalidateQueries({ queryKey: ["cloud:listOutbox"] }); },
    onError: (err: any) => { toast.error(err?.message ?? "Cancel failed."); },
  });

  function onFilterChange<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setPage(1); };
  }

  function resetFilters() {
    setStatus(""); setTableName(""); setPage(1);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Sync log</h1>
      </div>

      <Card className="mb-4 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Select label="Status" value={status} onChange={(e) => onFilterChange(setStatus)(e.target.value)}>
            <option value="">All</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>

          <Select label="Table" value={tableName} onChange={(e) => onFilterChange(setTableName)(e.target.value)}>
            <option value="">All</option>
            {TABLE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>

          <div className="flex items-end">
            <Button variant="secondary" onClick={resetFilters} className="w-full">Reset filters</Button>
          </div>
        </div>
      </Card>

      <Card className="p-0">
        {isLoading ? (
          <div className="p-6 text-sm text-slate-500">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-4xl mb-3">&#9729;</div>
            <div className="text-lg font-medium text-slate-700 mb-1">No sync events</div>
            <div className="text-sm text-slate-500 max-w-xs">
              No outbox entries match the current filters.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-100 text-left">
              <tr>
                <th className="px-4 py-3 w-6" />
                <th className="px-4 py-3">Created At</th>
                <th className="px-4 py-3">Table</th>
                <th className="px-4 py-3">Operation</th>
                <th className="px-4 py-3">Row ID</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Attempts</th>
                <th className="px-4 py-3">Next Attempt</th>
                <th className="sticky right-0 bg-slate-100 px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => {
                const isOpen = expanded === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr className="border-t align-top hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          className="text-slate-600 hover:text-slate-900"
                          aria-label={isOpen ? "Collapse row" : "Expand row"}
                          onClick={() => setExpanded(isOpen ? null : r.id)}
                        >
                          {isOpen ? "▾" : "▸"}
                        </button>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatDate(r.createdAt)}</td>
                      <td className="px-4 py-3">{r.tableName}</td>
                      <td className="px-4 py-3">{r.operation}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">{r.rowId}</td>
                      <td className="px-4 py-3"><span className={statusClass(r.status)}>{r.status}</span></td>
                      <td className="px-4 py-3 text-center">{r.attempts}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatDate(r.nextAttemptAt)}</td>
                      <td className="sticky right-0 bg-white px-4 py-3">
                        <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                          {(r.status === "Failed" || r.status === "Pending") && (
                            <button
                              type="button"
                              className="whitespace-nowrap text-brand hover:underline disabled:opacity-50"
                              disabled={retry.isPending}
                              onClick={() => retry.mutate(r.id)}
                            >
                              Retry
                            </button>
                          )}
                          {r.status === "Pending" && (
                            <button
                              type="button"
                              className="whitespace-nowrap text-red-600 hover:underline disabled:opacity-50"
                              disabled={cancel.isPending}
                              onClick={() => cancel.mutate(r.id)}
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {isOpen && (
                      <tr className="border-t bg-slate-50">
                        <td colSpan={9} className="px-6 py-4">
                          <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                            <div className="sm:col-span-2">
                              <span className="font-semibold text-slate-600">Payload: </span>
                              <pre className="mt-1 overflow-x-auto rounded bg-white p-2 text-xs text-slate-800 shadow-inner whitespace-pre-wrap">
                                {(() => { try { return JSON.stringify(JSON.parse(r.payload), null, 2); } catch { return r.payload; } })()}
                              </pre>
                            </div>
                            <div>
                              <span className="font-semibold text-slate-600">Sent at: </span>
                              <span className="text-slate-800">{formatDate(r.sentAt)}</span>
                            </div>
                            <div>
                              <span className="font-semibold text-slate-600">Next attempt at: </span>
                              <span className="text-slate-800">{formatDate(r.nextAttemptAt)}</span>
                            </div>
                            {r.error && (
                              <div className="sm:col-span-2">
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
          </div>
        )}
      </Card>

      <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
        <div>
          Page {page}
          {isFetching && !isLoading && <span className="ml-2 text-slate-400">refreshing…</span>}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
          <Button variant="secondary" disabled={rows.length < PAGE_SIZE} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}
