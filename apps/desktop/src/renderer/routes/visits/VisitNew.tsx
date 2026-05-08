import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { call } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { TestCategory } from "@lab/types";

type Patient = { id: string; patientId: string; name: string; phone: string; age: number; sex: string };
type Test = { id: string; name: string; category: TestCategory; price: string; isOutsourced: boolean };

type OutsourcedMeta = { sentTo: string; externalRef: string };

export default function VisitNew() {
  const [search] = useSearchParams();
  const initialPatientId = search.get("patientId");
  const nav = useNavigate();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [pickedTestIds, setPickedTestIds] = useState<string[]>([]);
  const [outsourcedMeta, setOutsourcedMeta] = useState<Record<string, OutsourcedMeta>>({});
  const [type, setType] = useState<"WalkIn" | "HomeCollection">("WalkIn");
  const [submitAttempted, setSubmitAttempted] = useState(false);

  useEffect(() => {
    if (initialPatientId && !patient) {
      call<Patient>("patients:get", { id: initialPatientId }).then(setPatient).catch(() => {});
    }
  }, [initialPatientId]);

  const { data: searchResults = [] } = useQuery({
    queryKey: ["patients", searchQ], enabled: !!searchQ && !patient,
    queryFn: () => call<Patient[]>("patients:search", { q: searchQ })
  });
  const { data: tests = [] } = useQuery({ queryKey: ["tests"], queryFn: () => call<Test[]>("tests:list") });

  const togglePicked = (t: Test) => {
    const picked = pickedTestIds.includes(t.id);
    if (picked) {
      setPickedTestIds(pickedTestIds.filter(id => id !== t.id));
      if (t.isOutsourced) {
        setOutsourcedMeta(prev => {
          const next = { ...prev };
          delete next[t.id];
          return next;
        });
      }
    } else {
      setPickedTestIds([...pickedTestIds, t.id]);
      if (t.isOutsourced) {
        setOutsourcedMeta(prev => ({ ...prev, [t.id]: { sentTo: "", externalRef: "" } }));
      }
    }
  };

  const updateMeta = (testId: string, field: keyof OutsourcedMeta, value: string) => {
    setOutsourcedMeta(prev => ({
      ...prev,
      [testId]: { ...(prev[testId] ?? { sentTo: "", externalRef: "" }), [field]: value }
    }));
  };

  const pickedOutsourcedTests = tests.filter(t => pickedTestIds.includes(t.id) && t.isOutsourced);
  const missingSentTo = pickedOutsourcedTests.some(
    t => !(outsourcedMeta[t.id]?.sentTo ?? "").trim()
  );

  const create = useMutation({
    mutationFn: () => {
      const testsPayload = pickedTestIds.map(testId => {
        const t = tests.find(x => x.id === testId);
        if (t?.isOutsourced) {
          const meta = outsourcedMeta[testId];
          const sentTo = meta?.sentTo.trim() || undefined;
          const ref = meta?.externalRef.trim() || undefined;
          return {
            testId,
            ...(sentTo ? { outsourcedSentTo: sentTo } : {}),
            ...(ref ? { outsourcedExternalRef: ref } : {})
          };
        }
        return { testId };
      });
      return call<{ id: string }>("visits:create", {
        patientId: patient!.id,
        type,
        testIds: pickedTestIds,
        tests: testsPayload
      });
    },
    onSuccess: v => nav(`/visits/${v.id}`)
  });

  const handleCreate = () => {
    setSubmitAttempted(true);
    if (missingSentTo) return;
    create.mutate();
  };

  const subtotal = tests.filter(t => pickedTestIds.includes(t.id)).reduce((s, t) => s + Number(t.price), 0);

  return (
    <div className="max-w-4xl">
      <h1 className="mb-4 text-2xl font-semibold">New visit</h1>

      <Card className="mb-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">1. Patient</h2>
        {patient ? (
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">{patient.name}</div>
              <div className="text-xs text-slate-500 font-mono">{patient.patientId} · {patient.age}/{patient.sex} · {patient.phone}</div>
            </div>
            <Button variant="ghost" onClick={() => setPatient(null)}>Change</Button>
          </div>
        ) : (
          <>
            <Input placeholder="Search by name or phone…" value={searchQ} onChange={e => setSearchQ(e.target.value)} />
            <div className="mt-2 max-h-48 overflow-auto divide-y rounded border">
              {searchResults.map(p => (
                <button type="button" key={p.id} onClick={() => setPatient(p)} className="block w-full p-2 text-left text-sm hover:bg-slate-50">
                  <span className="font-medium">{p.name}</span> · {p.phone} <span className="ml-2 text-xs text-slate-500 font-mono">{p.patientId}</span>
                </button>
              ))}
              {searchQ && searchResults.length === 0 && (
                <div className="p-2 text-sm text-slate-500">No patient found. <a className="text-brand underline" href="/patients/new">Register new</a></div>
              )}
            </div>
          </>
        )}
      </Card>

      <Card className="mb-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">2. Visit type</h2>
        <div className="flex gap-2">
          <Button variant={type === "WalkIn" ? "primary" : "secondary"} onClick={() => setType("WalkIn")}>Walk-in</Button>
          <Button variant={type === "HomeCollection" ? "primary" : "secondary"} onClick={() => setType("HomeCollection")}>Home collection</Button>
        </div>
      </Card>

      <Card className="mb-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">3. Tests</h2>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {tests.map(t => {
            const picked = pickedTestIds.includes(t.id);
            const meta = outsourcedMeta[t.id];
            const showMissingWarning = submitAttempted && picked && t.isOutsourced && !(meta?.sentTo ?? "").trim();
            return (
              <div key={t.id} className={`rounded border p-2 text-sm ${picked ? "border-brand bg-brand/5" : ""}`}>
                <label className="flex cursor-pointer items-center justify-between">
                  <span className="flex items-center gap-2">
                    <input type="checkbox" checked={picked} onChange={() => togglePicked(t)} />
                    <span>
                      <span className="font-medium">{t.name}</span>{" "}
                      <span className="text-xs text-slate-500">· {t.category}</span>
                      {t.isOutsourced && (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                          Outsourced
                        </span>
                      )}
                    </span>
                  </span>
                  <span>₹{Number(t.price).toFixed(0)}</span>
                </label>
                {picked && t.isOutsourced && (
                  <div className="mt-2 grid grid-cols-1 gap-2 pl-6 md:grid-cols-2">
                    <Input
                      label="Sent to"
                      placeholder="External lab name"
                      value={meta?.sentTo ?? ""}
                      onChange={e => updateMeta(t.id, "sentTo", e.target.value)}
                      error={showMissingWarning ? "Required for outsourced tests" : undefined}
                    />
                    <Input
                      label="External ref (optional)"
                      placeholder="e.g. LAB-REF-123"
                      value={meta?.externalRef ?? ""}
                      onChange={e => updateMeta(t.id, "externalRef", e.target.value)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-3 text-right text-sm font-medium">Subtotal: ₹{subtotal.toFixed(0)}</div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => nav(-1)}>Cancel</Button>
        <Button disabled={!patient || pickedTestIds.length === 0 || create.isPending} onClick={handleCreate}>Create visit & collect samples</Button>
      </div>
    </div>
  );
}
