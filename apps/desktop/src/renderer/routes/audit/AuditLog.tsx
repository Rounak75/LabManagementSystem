import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { call } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import type { AuditListResult, UserRow } from "@shared/api";

const PAGE_SIZE = 50;

const ENTITY_TYPES = [
  "User",
  "Patient",
  "Visit",
  "VisitTest",
  "TestResult",
  "Invoice",
  "LabSettings",
  "ReportTemplate",
  "BackupLog",
];

function formatDateTime(d: string): string {
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d;
  }
}

function prettyJson(s: string): { text: string; isJson: boolean } {
  try {
    return { text: JSON.stringify(JSON.parse(s), null, 2), isJson: true };
  } catch {
    return { text: s, isJson: false };
  }
}

export default function AuditLog() {
  const [userId, setUserId] = useState<string>("");
  const [action, setAction] = useState<string>("");
  const [entityType, setEntityType] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => call<UserRow[]>("users:list"),
  });

  const { data: actions = [] } = useQuery({
    queryKey: ["audit", "distinctActions"],
    queryFn: () => call<string[]>("audit:distinctActions"),
  });

  const queryPayload = useMemo(() => {
    const payload: {
      userId?: string;
      action?: string;
      entityType?: string;
      from?: string;
      to?: string;
      page: number;
      pageSize: number;
    } = { page, pageSize: PAGE_SIZE };
    if (userId) payload.userId = userId;
    if (action) payload.action = action;
    if (entityType) payload.entityType = entityType;
    if (fromDate) payload.from = `${fromDate}T00:00:00.000Z`;
    if (toDate) payload.to = `${toDate}T23:59:59.999Z`;
    return payload;
  }, [userId, action, entityType, fromDate, toDate, page]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["audit", "list", queryPayload],
    queryFn: () => call<AuditListResult>("audit:list", queryPayload),
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const onAnyFilterChange = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };

  const resetFilters = () => {
    setUserId("");
    setAction("");
    setEntityType("");
    setFromDate("");
    setToDate("");
    setPage(1);
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Audit log</h1>
      </div>

      <Card className="mb-4 p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Select
            label="User"
            value={userId}
            onChange={(e) => onAnyFilterChange(setUserId)(e.target.value)}
          >
            <option value="">All users</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} @ {u.username}
              </option>
            ))}
          </Select>

          <Select
            label="Action"
            value={action}
            onChange={(e) => onAnyFilterChange(setAction)(e.target.value)}
          >
            <option value="">All actions</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>

          <Select
            label="Entity"
            value={entityType}
            onChange={(e) => onAnyFilterChange(setEntityType)(e.target.value)}
          >
            <option value="">All entities</option>
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">From</span>
            <input
              type="date"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={fromDate}
              onChange={(e) => onAnyFilterChange(setFromDate)(e.target.value)}
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">To</span>
            <input
              type="date"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={toDate}
              onChange={(e) => onAnyFilterChange(setToDate)(e.target.value)}
            />
          </label>

          <div className="flex items-end">
            <Button variant="secondary" onClick={resetFilters} className="w-full">
              Reset filters
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-0">
        {isLoading ? (
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">Target ID</th>
                <th className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t animate-pulse">
                  <td className="px-4 py-3"><div className="h-3 bg-slate-200 rounded w-32" /></td>
                  <td className="px-4 py-3"><div className="h-3 bg-slate-200 rounded w-24" /></td>
                  <td className="px-4 py-3"><div className="h-3 bg-slate-200 rounded w-20" /></td>
                  <td className="px-4 py-3"><div className="h-3 bg-slate-200 rounded w-16" /></td>
                  <td className="px-4 py-3"><div className="h-3 bg-slate-200 rounded w-28" /></td>
                  <td className="px-4 py-3"><div className="h-3 bg-slate-200 rounded w-12" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-4xl mb-3">📋</div>
            <div className="text-lg font-medium text-slate-700 mb-1">No audit log entries</div>
            <div className="text-sm text-slate-500 max-w-xs">No actions match these filters yet.</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">Target ID</th>
                <th className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isOpen = expandedId === r.id;
                const detail = r.details ? prettyJson(r.details) : null;
                return (
                  <Fragment key={r.id}>
                    <tr className="border-t align-top">
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                        {formatDateTime(r.timestamp)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{r.user?.name ?? "—"}</div>
                        <div className="text-xs text-slate-500">
                          @{r.user?.username ?? "?"}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{r.action}</td>
                      <td className="px-4 py-3">{r.targetEntity}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">
                        {r.targetId}
                      </td>
                      <td className="px-4 py-3">
                        {detail ? (
                          <button
                            className="text-brand hover:underline"
                            onClick={() => setExpandedId(isOpen ? null : r.id)}
                          >
                            {isOpen ? "▾ Hide" : "▸ Show"}
                          </button>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                    {isOpen && detail && (
                      <tr className="border-t bg-slate-50">
                        <td colSpan={6} className="px-4 py-3">
                          {detail.isJson ? (
                            <pre className="overflow-x-auto rounded-md bg-white p-3 text-xs text-slate-800 shadow-inner">
                              {detail.text}
                            </pre>
                          ) : (
                            <div className="whitespace-pre-wrap text-xs text-slate-700">
                              {detail.text}
                            </div>
                          )}
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

      <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
        <div>
          Page {page} of {totalPages} ({total} total)
          {isFetching && !isLoading && <span className="ml-2 text-slate-400">refreshing…</span>}
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
