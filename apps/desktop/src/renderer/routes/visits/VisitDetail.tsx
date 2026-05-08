import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link, useNavigate } from "react-router-dom";
import { call } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/stores/auth.store";

type Visit = {
  id: string; visitId: string; status: string; visitDate: string; type: string;
  patient: { id: string; patientId: string; name: string; age: number; sex: string; phone: string; referredBy: { name: string } | null };
  staff: { name: string };
  visitTests: { id: string; status: string; isLocked: boolean; outsourcedSentTo: string | null; verifiedAt: string | null;
    test: { name: string; isOutsourced: boolean; parameters: any[] }; results: any[] }[];
  invoice: { id: string; total: string; paymentStatus: string } | null;
};

export default function VisitDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const nav = useNavigate();
  const { user } = useAuth();
  const { data: visit } = useQuery({ queryKey: ["visit", id], queryFn: () => call<Visit>("visits:get", { id }), enabled: !!id });

  const setStatus = useMutation({
    mutationFn: ({ visitTestId, status }: { visitTestId: string; status: string }) =>
      call("visitTests:updateStatus", { visitTestId, status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["visit", id] })
  });
  const lock = useMutation({
    mutationFn: (visitTestId: string) => call("visitTests:lock", { visitTestId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["visit", id] })
  });

  if (!visit) return <div className="text-slate-500">Loading…</div>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Visit {visit.visitId}</h1>
          <div className="text-sm text-slate-500">
            <Link className="underline" to={`/patients/${visit.patient.id}`}>{visit.patient.name}</Link>
            {" · "}{visit.patient.age}/{visit.patient.sex} · {visit.type} · {new Date(visit.visitDate).toLocaleString("en-IN")}
          </div>
        </div>
        <div className="flex gap-2">
          {visit.invoice && <Button variant="secondary" onClick={() => nav(`/invoices/${visit.invoice!.id}`)}>Invoice ₹{Number(visit.invoice.total).toFixed(0)}</Button>}
          {visit.status === "Completed" && <Button onClick={() => nav(`/reports/${visit.id}`)}>Report</Button>}
        </div>
      </div>

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
                <td className="px-4 py-3 text-right">
                  {!vt.isLocked && <Button variant="ghost" onClick={() => nav(`/results/${vt.id}`)}>Enter results</Button>}
                  {!vt.isLocked && vt.status === "ResultEntered" && user?.role === "Admin" && (
                    <Button variant="primary" className="ml-2" onClick={() => lock.mutate(vt.id)}>Verify & lock</Button>
                  )}
                  {!vt.isLocked && vt.test.isOutsourced && vt.status !== "Outsourced" && (
                    <Button variant="ghost" className="ml-2" onClick={() => {
                      const lab = prompt("External lab name?"); if (lab) setStatus.mutate({ visitTestId: vt.id, status: "Outsourced" });
                    }}>Mark outsourced</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
