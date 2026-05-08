import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { call } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type Param = { id: string; name: string; unit: string; resultType: "Numeric" | "Qualitative";
  qualitativeOptions: string | null;
  refRangeMaleMin: string | null; refRangeMaleMax: string | null;
  refRangeFemaleMin: string | null; refRangeFemaleMax: string | null;
  refRangeChildMin: string | null; refRangeChildMax: string | null };
type VT = { id: string; isLocked: boolean;
  test: { name: string; parameters: Param[] };
  visit: { id: string; patient: { name: string; age: number; sex: string; patientId: string } };
  results: { parameterId: string; value: string; isAbnormal: boolean }[] };

export default function ResultEntry() {
  const { visitTestId } = useParams<{ visitTestId: string }>();
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data: vt, isLoading } = useQuery({
    queryKey: ["visitTest", visitTestId], enabled: !!visitTestId,
    queryFn: () => call<VT>("visitTests:getOne", { id: visitTestId })
  });
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (vt) {
      const seed: Record<string, string> = {};
      for (const p of vt.test.parameters) {
        const r = vt.results.find(r => r.parameterId === p.id);
        seed[p.id] = r?.value ?? "";
      }
      setValues(seed);
    }
  }, [vt]);

  const save = useMutation({
    mutationFn: () => call("results:upsert", {
      visitTestId,
      values: Object.entries(values).map(([parameterId, value]) => ({ parameterId, value }))
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["visit", vt!.visit.id] }); nav(`/visits/${vt!.visit.id}`); }
  });

  if (isLoading || !vt) return <div className="text-slate-500">Loading…</div>;

  function rangeFor(p: Param): string {
    if (p.resultType === "Qualitative") return p.qualitativeOptions ?? "";
    const sex = vt!.visit.patient.sex;
    const isChild = vt!.visit.patient.age < 12;
    let min = ""; let max = "";
    if (isChild && p.refRangeChildMin && p.refRangeChildMax) { min = p.refRangeChildMin; max = p.refRangeChildMax; }
    else if (sex === "Female") { min = p.refRangeFemaleMin ?? ""; max = p.refRangeFemaleMax ?? ""; }
    else                        { min = p.refRangeMaleMin   ?? ""; max = p.refRangeMaleMax   ?? ""; }
    return min && max ? `${min} – ${max}` : "";
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-2xl font-semibold">{vt.test.name}</h1>
      <div className="mb-4 text-sm text-slate-500">
        {vt.visit.patient.name} · {vt.visit.patient.patientId} · {vt.visit.patient.age}/{vt.visit.patient.sex}
      </div>
      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left">
            <tr><th className="px-4 py-3">Parameter</th><th className="px-4 py-3">Result</th><th className="px-4 py-3">Unit</th><th className="px-4 py-3">Normal range</th></tr>
          </thead>
          <tbody>
            {vt.test.parameters.map(p => (
              <tr key={p.id} className="border-t">
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3 w-40">
                  {p.resultType === "Qualitative" && p.qualitativeOptions ? (
                    <select className="w-full rounded border px-2 py-1" value={values[p.id] ?? ""}
                      onChange={e => setValues({ ...values, [p.id]: e.target.value })}>
                      <option value="">—</option>
                      {(JSON.parse(p.qualitativeOptions) as string[]).map(o => <option key={o}>{o}</option>)}
                    </select>
                  ) : (
                    <Input value={values[p.id] ?? ""} onChange={e => setValues({ ...values, [p.id]: e.target.value })} disabled={vt.isLocked} />
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500">{p.unit}</td>
                <td className="px-4 py-3 text-slate-500">{rangeFor(p)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => nav(-1)}>Cancel</Button>
        <Button disabled={vt.isLocked || save.isPending} onClick={() => save.mutate()}>Save</Button>
      </div>
    </div>
  );
}
