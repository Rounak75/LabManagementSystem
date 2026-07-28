import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link, useNavigate } from "react-router-dom";
import { call } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/stores/auth.store";
import { UndoToast } from "@/components/UndoToast";
import { VisitNotificationsLine } from "@/components/VisitNotificationsLine";

type Visit = {
  id: string; visitId: string; status: string; visitDate: string; type: string;
  patient: { id: string; patientId: string; name: string; age: number; sex: string; phone: string; referredBy: { name: string } | null };
  staff: { name: string };
  visitTests: { id: string; status: string; isLocked: boolean; outsourcedSentTo: string | null; verifiedAt: string | null;
    test: { name: string; isOutsourced: boolean; parameters: any[] }; results: any[] }[];
  invoice: { id: string; total: string; amountPaid: string; paymentStatus: string } | null;
  reportReleaseOverride: boolean;
};

export default function VisitDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const nav = useNavigate();
  const { user } = useAuth();
  const [unlockTarget, setUnlockTarget] = useState<string | null>(null);
  const [outsourceTarget, setOutsourceTarget] = useState<{ id: string; testName: string } | null>(null);
  const [undoToast, setUndoToast] = useState<{ ids: string[]; msg: string } | null>(null);
  const { data: visit } = useQuery({ queryKey: ["visit", id], queryFn: () => call<Visit>("visits:get", { id }), enabled: !!id });

  const setStatus = useMutation({
    mutationFn: ({ visitTestId, status, outsourcedSentTo }: { visitTestId: string; status: string; outsourcedSentTo?: string }) =>
      call("visitTests:updateStatus", { visitTestId, status, outsourcedSentTo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["visit", id] })
  });
  const lock = useMutation({
    mutationFn: (visitTestId: string) =>
      call<{ notificationIds?: string[] }>("visitTests:lock", { visitTestId }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["visit", id] });
      if (result.notificationIds && result.notificationIds.length > 0) {
        setUndoToast({
          ids: result.notificationIds,
          msg: "Report locked. Sending SMS in 60s.",
        });
      }
    }
  });

  const releaseOverride = useMutation({
    mutationFn: ({ release }: { release: boolean }) =>
      call("visits:setReportReleaseOverride", { visitId: id, release }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["visit", id] }),
  });

  if (!visit) return <div className="text-slate-500">Loading…</div>;

  // What the patient still owes, and therefore whether the portal is holding
  // their report back. Printing here is never blocked — this only governs the
  // patient's own download.
  const balance = visit.invoice
    ? Math.max(0, Number(visit.invoice.total) - Number(visit.invoice.amountPaid))
    : 0;
  const allLocked = visit.visitTests.length > 0 && visit.visitTests.every((vt) => vt.isLocked);
  const portalWithholding = balance > 0 && allLocked && !visit.reportReleaseOverride;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Visit {visit.visitId}</h1>
          <div className="text-sm text-slate-500">
            <Link className="underline" to={`/patients/${visit.patient.id}`}>{visit.patient.name}</Link>
            {" · "}{visit.patient.age}/{visit.patient.sex} · {visit.type} · {new Date(visit.visitDate).toLocaleString("en-IN")}
          </div>
          {id && <VisitNotificationsLine visitId={id} />}
        </div>
        <div className="flex gap-2">
          {visit.invoice && <Button variant="secondary" onClick={() => nav(`/invoices/${visit.invoice!.id}`)}>Invoice ₹{Number(visit.invoice.total).toFixed(0)}</Button>}
          {visit.status === "Completed" && <Button onClick={() => nav(`/reports/${visit.id}`)}>Report</Button>}
        </div>
      </div>

      {balance > 0 && allLocked && (
        <Card className="mb-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <div className="font-medium text-slate-900">
                {visit.reportReleaseOverride
                  ? `Report released to the patient with ₹${balance.toFixed(0)} unpaid.`
                  : `The patient cannot download this report until ₹${balance.toFixed(0)} is paid.`}
              </div>
              <div className="mt-0.5 text-slate-500">
                Printing here is not affected — this only controls their own download.
              </div>
            </div>
            {user?.role === "Admin" && (
              <Button
                variant={visit.reportReleaseOverride ? "secondary" : "primary"}
                disabled={releaseOverride.isPending}
                onClick={() => releaseOverride.mutate({ release: !visit.reportReleaseOverride })}
              >
                {releaseOverride.isPending
                  ? "Saving…"
                  : visit.reportReleaseOverride
                    ? "Withhold report again"
                    : "Release report anyway"}
              </Button>
            )}
          </div>
        </Card>
      )}

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left">
            <tr><th className="px-4 py-3">Test</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Results</th><th /></tr>
          </thead>
          <tbody>
            {visit.visitTests.map(vt => (
              <tr key={vt.id} className="border-t">
                <td className="px-4 py-3">
                  <div className="font-medium">{vt.test.name}</div>
                  {vt.outsourcedSentTo && <div className="text-xs text-slate-500">Outsourced to {vt.outsourcedSentTo}</div>}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded px-2 py-1 text-xs ${vt.isLocked ? "bg-emerald-100 text-emerald-800" : "bg-slate-100"}`}>{vt.status}</span>
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {vt.results.length > 0 ? `${vt.results.length}/${vt.test.parameters.length} entered` : "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap justify-end gap-1">
                    {!vt.isLocked && <Button size="sm" variant="ghost" onClick={() => nav(`/results/${vt.id}`)}>Enter results</Button>}
                    {!vt.isLocked && vt.status === "ResultEntered" && user?.role === "Admin" && (
                      <Button size="sm" variant="primary" onClick={() => lock.mutate(vt.id)}>Verify & lock</Button>
                    )}
                    {vt.isLocked && user?.role === "Admin" && (
                      <Button size="sm" variant="ghost" onClick={() => setUnlockTarget(vt.id)}>Unlock to edit</Button>
                    )}
                    {!vt.isLocked && vt.test.isOutsourced && vt.status !== "Outsourced" && (
                      <Button size="sm" variant="ghost" onClick={() => setOutsourceTarget({ id: vt.id, testName: vt.test.name })}>Mark outsourced</Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {unlockTarget && (
        <UnlockModal
          visitTestId={unlockTarget}
          onClose={() => setUnlockTarget(null)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ["visit", id] });
            qc.invalidateQueries({ queryKey: ["visitTest", unlockTarget] });
            setUnlockTarget(null);
          }}
        />
      )}
      {outsourceTarget && (
        <OutsourceModal
          testName={outsourceTarget.testName}
          pending={setStatus.isPending}
          onClose={() => setOutsourceTarget(null)}
          onConfirm={(lab) => {
            setStatus.mutate(
              { visitTestId: outsourceTarget.id, status: "Outsourced", outsourcedSentTo: lab },
              { onSuccess: () => setOutsourceTarget(null) }
            );
          }}
        />
      )}
      {undoToast && (
        <UndoToast
          notificationIds={undoToast.ids}
          message={undoToast.msg}
          onClose={() => setUndoToast(null)}
        />
      )}
    </div>
  );
}

function OutsourceModal({
  testName,
  pending,
  onClose,
  onConfirm
}: {
  testName: string;
  pending: boolean;
  onClose: () => void;
  onConfirm: (lab: string) => void;
}) {
  const [lab, setLab] = useState("");
  const trimmed = lab.trim();
  return (
    <Modal open onClose={onClose} title="Mark as outsourced">
      <p className="mb-3 text-sm text-slate-700">
        Send <span className="font-medium">{testName}</span> to an external lab? It will appear in the
        Outsourced list until you mark the result received.
      </p>
      <Input
        label="External lab name"
        autoFocus
        placeholder="e.g. SRL Diagnostics"
        value={lab}
        onChange={e => setLab(e.target.value)}
      />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button disabled={!trimmed || pending} onClick={() => onConfirm(trimmed)}>
          {pending ? "Saving…" : "Mark outsourced"}
        </Button>
      </div>
    </Modal>
  );
}

function UnlockModal({
  visitTestId,
  onClose,
  onSuccess
}: {
  visitTestId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState("");
  const unlock = useMutation({
    mutationFn: () => call<{ isLocked: false }>("visitTests:unlock", { visitTestId, reason }),
    onSuccess
  });
  const trimmed = reason.trim().length;
  return (
    <Modal open onClose={onClose} title="Unlock to edit results">
      <p className="mb-2 text-sm">
        Unlocking will allow edits to be made. Every change after this will be audited.
        Please describe the reason (at least 10 characters).
      </p>
      <textarea
        value={reason}
        onChange={e => setReason(e.target.value)}
        className="h-24 w-full rounded border p-2 text-sm"
        placeholder="e.g. Sodium value was entered as 13.5 instead of 135"
      />
      <div className="mt-1 text-xs text-slate-500">{trimmed} / 10 min</div>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button
          disabled={trimmed < 10 || unlock.isPending}
          onClick={() => unlock.mutate()}
        >
          {unlock.isPending ? "Unlocking…" : "Unlock"}
        </Button>
      </div>
    </Modal>
  );
}
