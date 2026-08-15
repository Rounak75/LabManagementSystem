import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { call } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { PageHeader } from "@/components/ui/PageHeader";
import type { AuditListResult, UserRow } from "@shared/api";
import { labDateTime } from "@shared/lab-date";

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
    return labDateTime(d, { seconds: true });
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
    queryFn: () => call("users:list"),
  });

  const { data: actions = [] } = useQuery({
    queryKey: ["audit", "distinctActions"],
    queryFn: () => call("audit:distinctActions"),
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
      <PageHeader title="Audit log" subtitle="Security and compliance tracking for all laboratory operations." />

      <Card noPadding className="mb-6">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <div className="w-full md:w-48">
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
          </div>

          <div className="w-full md:w-48">
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
          </div>

          <div className="w-full md:w-48">
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
          </div>

          <label className="block w-full md:w-40 text-sm">
            <span className="mb-1 block font-medium text-slate-700">From</span>
            <input
              type="date"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={fromDate}
              onChange={(e) => onAnyFilterChange(setFromDate)(e.target.value)}
            />
          </label>

          <label className="block w-full md:w-40 text-sm">
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
              Reset
            </Button>
          </div>
        </div>
      </Card>

      <Card noPadding>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-700">Timestamp</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-700">User</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-700">Action</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-700">Entity</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-700">Entity ID</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-100 animate-pulse">
                    <td className="px-4 py-3"><div className="h-3 bg-slate-200 rounded w-32" /></td>
                    <td className="px-4 py-3"><div className="h-3 bg-slate-200 rounded w-24" /></td>
                    <td className="px-4 py-3"><div className="h-3 bg-slate-200 rounded w-20" /></td>
                    <td className="px-4 py-3"><div className="h-3 bg-slate-200 rounded w-16" /></td>
                    <td className="px-4 py-3"><div className="h-3 bg-slate-200 rounded w-28" /></td>
                    <td className="px-4 py-3"><div className="h-3 bg-slate-200 rounded w-12" /></td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-500">
                    No records found
                  </td>
                </tr>
              ) : rows.map((r) => {
                  const isOpen = expandedId === r.id;
                  const detail = r.details ? prettyJson(r.details) : null;
                  return (
                    <Fragment key={r.id}>
                      <tr className="border-b border-slate-100 align-top transition-colors hover:bg-slate-50">
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
        </div>
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
