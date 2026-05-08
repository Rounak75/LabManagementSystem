import { useQuery } from "@tanstack/react-query";
import { useParams, Link, useNavigate } from "react-router-dom";
import { call } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type Patient = { id: string; patientId: string; name: string; age: number; sex: string; phone: string; address: string | null;
  referredBy: { name: string; clinic: string | null } | null; createdAt: string };
type Visit = { id: string; visitId: string; visitDate: string; status: string;
  visitTests: { test: { name: string }; status: string }[];
  invoice: { total: string; paymentStatus: string } | null };

export default function PatientDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { data: patient } = useQuery({ queryKey: ["patient", id], queryFn: () => call<Patient>("patients:get", { id }), enabled: !!id });
  const { data: visits = [] } = useQuery({ queryKey: ["patient-history", id], queryFn: () => call<Visit[]>("patients:history", { id }), enabled: !!id });

  if (!patient) return <div className="text-slate-500">Loading…</div>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{patient.name}</h1>
          <div className="text-sm text-slate-500 font-mono">{patient.patientId} · {patient.age}/{patient.sex} · {patient.phone}</div>
        </div>
        <Button onClick={() => nav(`/visits/new?patientId=${patient.id}`)}>+ New visit</Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Patient</h2>
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-slate-500">Address</dt><dd>{patient.address ?? "—"}</dd>
            <dt className="text-slate-500">Referred by</dt><dd>{patient.referredBy?.name ?? "Self"}{patient.referredBy?.clinic ? ` — ${patient.referredBy.clinic}` : ""}</dd>
            <dt className="text-slate-500">Registered</dt><dd>{new Date(patient.createdAt).toLocaleDateString("en-IN")}</dd>
          </dl>
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Visit history</h2>
          {visits.length === 0 ? <div className="text-sm text-slate-500">No visits yet.</div> : (
            <div className="divide-y">
              {visits.map(v => (
                <Link key={v.id} to={`/visits/${v.id}`} className="block py-3 hover:bg-slate-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-mono text-xs text-slate-500">{v.visitId}</div>
                      <div className="font-medium">{new Date(v.visitDate).toLocaleString("en-IN")}</div>
                      <div className="text-xs text-slate-500">{v.visitTests.map(vt => vt.test.name).join(", ")}</div>
                    </div>
                    <div className="text-right text-xs">
                      <div className="font-medium">{v.status}</div>
                      {v.invoice && <div className="text-slate-500">₹{Number(v.invoice.total).toFixed(0)} · {v.invoice.paymentStatus}</div>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
