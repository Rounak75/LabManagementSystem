import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { call } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { TEST_CATEGORIES, type TestCategory } from "@lab/types";

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

  // Inline Patient Creation State
  const [isNewPatientMode, setIsNewPatientMode] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newAge, setNewAge] = useState("");
  const [newSex, setNewSex] = useState("Male");

  const [testSearchQ, setTestSearchQ] = useState("");

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
    mutationFn: async () => {
      let activePatientId = patient?.id;
      
      if (!patient && isNewPatientMode) {
        if (!newName || !newPhone || !newAge) throw new Error("Please fill all patient details");
        const newP = await call<{id: string}>("patients:create", {
          name: newName,
          phone: newPhone,
          age: Number(newAge),
          sex: newSex,
          referredById: "doctor-self"
        });
        activePatientId = newP.id;
      }

      if (!activePatientId) throw new Error("No patient selected");

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
        patientId: activePatientId,
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
            {!isNewPatientMode ? (
              <>
                <div className="relative">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
                  </svg>
                  <Input 
                    placeholder="Search by name or phone…" 
                    value={searchQ} 
                    onChange={e => setSearchQ(e.target.value)} 
                    className="py-1.5 pl-9 pr-3 text-sm text-black border-black bg-slate-50 placeholder:text-slate-500 focus:bg-white focus:border-black focus:ring-1 focus:ring-black transition-all shadow-sm" 
                  />
                </div>
                {searchQ && (
                  <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-slate-200 shadow-sm">
                    {searchResults.map(p => (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => setPatient(p)}
                        className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50"
                      >
                        <span className="min-w-0 truncate">
                          <span className="font-medium">{p.name}</span>
                          <span className="text-slate-500"> · {p.phone}</span>
                        </span>
                        <span className="shrink-0 font-mono text-xs text-slate-500">{p.patientId}</span>
                      </button>
                    ))}
                    {searchResults.length === 0 && (
                      <div className="px-3 py-2 text-sm text-slate-500">
                        No patient found. <button type="button" className="text-brand underline font-medium" onClick={() => { setIsNewPatientMode(true); setNewPhone(searchQ.replace(/\D/g, '')); setNewName(searchQ.replace(/[0-9]/g, '').trim()); }}>Register inline now</button>
                      </div>
                    )}
                    {searchResults.length >= 50 && (
                      <div className="border-t border-slate-100 px-3 py-2 text-xs text-slate-400">
                        Showing the first 50 matches — type more to narrow the search.
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-lg border border-brand/20 bg-brand/5 p-4">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-medium text-brand-700">Register New Patient</h3>
                  <Button variant="ghost" onClick={() => setIsNewPatientMode(false)} className="text-xs h-7 px-2">Cancel</Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Full name" value={newName} onChange={e => setNewName(e.target.value)} className="col-span-2" placeholder="e.g. John Doe" />
                  <Input label="Phone" value={newPhone} onChange={e => setNewPhone(e.target.value.replace(/\D/g, ''))} placeholder="10-digit number" />
                  <div className="flex gap-2">
                    <Input label="Age" type="number" value={newAge} onChange={e => setNewAge(e.target.value)} className="w-16" />
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Sex</label>
                      <select value={newSex} onChange={e => setNewSex(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none">
                        <option>Male</option><option>Female</option><option>Other</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}
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
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-slate-700">3. Tests</h2>
            <div className="w-1/2 relative">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
              </svg>
              <Input 
                placeholder="Search tests..." 
                value={testSearchQ} 
                onChange={e => setTestSearchQ(e.target.value)} 
                className="py-1.5 pl-9 pr-3 text-sm text-black border-black bg-slate-50 placeholder:text-slate-500 focus:bg-white focus:border-black focus:ring-1 focus:ring-black transition-all shadow-sm"
              />
            </div>
        </div>
        
        {TEST_CATEGORIES.map(cat => {
          const inCat = tests.filter(t => t.category === cat);
          if (inCat.length === 0) return null;
          
          const filteredInCat = testSearchQ 
            ? inCat.filter(t => t.name.toLowerCase().includes(testSearchQ.toLowerCase()))
            : inCat;
            
          if (filteredInCat.length === 0) return null;

          const pickedInCat = inCat.filter(t => pickedTestIds.includes(t.id)).length;
          const isOpen = testSearchQ.length > 0 || pickedInCat > 0;

          return (
            <details key={cat} open={isOpen} className="group mb-3 rounded-md border border-slate-200">
              <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-bold uppercase tracking-wide text-black [&::-webkit-details-marker]:hidden bg-slate-50 hover:bg-slate-100 transition-colors">
                <span className="flex items-center gap-2">
                  <svg 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2.5" 
                    className="h-3.5 w-3.5 text-slate-400 transition-transform duration-200 group-open:rotate-90"
                  >
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                  <span>{cat}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-slate-600">{inCat.length}</span>
                  {pickedInCat > 0 && <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-brand">{pickedInCat} selected</span>}
                </span>
              </summary>
              <div className="grid grid-cols-1 gap-2 border-t border-slate-100 p-3 md:grid-cols-2">
                {filteredInCat.map(t => {
                  const picked = pickedTestIds.includes(t.id);
                  const meta = outsourcedMeta[t.id];
                  const showMissingWarning = submitAttempted && picked && t.isOutsourced && !(meta?.sentTo ?? "").trim();
                  return (
                    <div key={t.id} className={`rounded border p-2 text-sm ${picked ? "border-brand bg-brand/5" : ""}`}>
                      <label className="flex cursor-pointer items-center justify-between">
                        <span className="flex items-center gap-2">
                          <input type="checkbox" checked={picked} onChange={() => togglePicked(t)} />
                          <span>
                            <span className="font-medium">{t.name}</span>
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
            </details>
          );
        })}
        <div className="mt-3 text-right text-sm font-medium">Subtotal: ₹{subtotal.toFixed(0)}</div>
      </Card>

      <div className="flex items-center justify-between">
        {create.error && <div className="text-sm text-rose-600 font-medium">Error: {create.error.message}</div>}
        <div className="flex justify-end gap-2 flex-1">
          <Button variant="secondary" onClick={() => nav(-1)}>Cancel</Button>
          <Button disabled={(!patient && !isNewPatientMode) || pickedTestIds.length === 0 || create.isPending} onClick={handleCreate}>
            {create.isPending ? "Creating..." : "Create visit & collect samples"}
          </Button>
        </div>
      </div>
    </div>
  );
}
