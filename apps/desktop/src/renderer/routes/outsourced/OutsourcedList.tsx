import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { call } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import type { OutsourcedRow } from "@shared/api";

function formatDate(d: string | Date | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString();
  } catch {
    return String(d);
  }
}

function ageInDays(d: string | Date | null): string {
  if (!d) return "—";
  const sent = new Date(d).getTime();
  if (Number.isNaN(sent)) return "—";
  const days = Math.floor((Date.now() - sent) / 86400000);
  if (days <= 0) return "today";
  return `${days} day${days === 1 ? "" : "s"}`;
}

export default function OutsourcedList() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [confirming, setConfirming] = useState<OutsourcedRow | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["outsourced"],
    queryFn: () => call<OutsourcedRow[]>("outsourced:list"),
  });

  const markReceived = useMutation({
    mutationFn: (visitTestId: string) =>
      call<{ ok: true }>("outsourced:markReceived", { visitTestId }),
    onSuccess: (_res, visitTestId) => {
      qc.invalidateQueries({ queryKey: ["outsourced"] });
      setConfirming(null);
      nav(`/results/${visitTestId}`);
    },
  });

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">Outsourced tests</h1>
        <p className="text-sm text-slate-500">Tests sent to external labs awaiting results.</p>
      </div>

      <Card className="p-0">
        {isLoading ? (
          <div className="p-6 text-slate-500">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-4xl mb-3">📦</div>
            <div className="text-lg font-medium text-slate-700 mb-1">Nothing awaiting external results</div>
            <div className="text-sm text-slate-500 max-w-xs">Outsourced tests sent to external labs will appear here.</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left">
              <tr>
                <th className="px-4 py-3">Visit ID</th>
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">Test</th>
                <th className="px-4 py-3">Sent to</th>
                <th className="px-4 py-3">Sent date</th>
                <th className="px-4 py-3">Age</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link to={`/visits/${r.visit.id}`} className="text-brand hover:underline">
                      {r.visit.visitId}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.visit.patient.name}</div>
                    <div className="text-xs text-slate-500 font-mono">{r.visit.patient.patientId}</div>
                  </td>
                  <td className="px-4 py-3">{r.test.name}</td>
                  <td className="px-4 py-3">
                    {r.outsourcedSentTo && r.outsourcedSentTo.trim() ? r.outsourcedSentTo : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(r.outsourcedSentAt)}</td>
                  <td className="px-4 py-3 text-slate-600">{ageInDays(r.outsourcedSentAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <Button onClick={() => setConfirming(r)}>Mark received</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {confirming && (
        <Modal open onClose={() => setConfirming(null)} title="Mark as received?">
          <p className="text-sm text-slate-700">
            Mark this test as received from the external lab? You'll then enter the result on the
            next screen.
          </p>
          {confirming.outsourcedSentTo && (
            <p className="mt-2 text-xs text-slate-500">
              <span className="font-medium">{confirming.test.name}</span> · sent to{" "}
              {confirming.outsourcedSentTo}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              disabled={markReceived.isPending}
              onClick={() => markReceived.mutate(confirming.id)}
            >
              {markReceived.isPending ? "Marking…" : "Mark received"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
