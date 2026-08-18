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
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "yesterday">("all");
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
    queryKey: ["patients", searchQ, dateFilter], enabled: !!searchQ && !patient,
    queryFn: () => call<Patient[]>("patients:search", { q: searchQ, dateFilter })
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
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-8 font-display text-4xl font-bold tracking-tight text-slate-900">New visit</h1>

      <Card className="mb-6" noPadding>
        <div className="p-6">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-400">1. Patient Details</h2>
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
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400">
                      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
                    </svg>
                    <Input 
                      placeholder="Search by name, phone, or ID…" 
                      value={searchQ} 
                      onChange={e => setSearchQ(e.target.value)} 
                      className="pl-10" 
                    />
                  </div>
                  <select 
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value as any)}
                    className="rounded-xl border border-slate-200/80 bg-slate-50 px-4 py-2.5 text-[14px] font-medium text-slate-700 transition-all duration-300 ease-out-fluid hover:border-slate-300 hover:bg-white focus:border-brand/40 focus:bg-white focus:ring-4 focus:ring-brand/10"
                  >
                    <option value="all">All Dates</option>
                    <option value="today">Today</option>
                    <option value="yesterday">Yesterday</option>
                  </select>
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
                    <div className="w-1/3">
                      <Input label="Age" type="number" value={newAge} onChange={e => setNewAge(e.target.value)} />
                    </div>
                    <div className="flex-1">
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-700">Sex</label>
                      <select value={newSex} onChange={e => setNewSex(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition-colors duration-200 focus:border-brand focus:ring-2 focus:ring-brand/20">
                        <option>Male</option><option>Female</option><option>Other</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        </div>
      </Card>

      <Card className="mb-6" noPadding>
        <div className="p-6">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-400">2. Visit type</h2>
          <div className="flex gap-3">
            <Button variant={type === "WalkIn" ? "primary" : "secondary"} onClick={() => setType("WalkIn")}>Walk-in</Button>
            <Button variant={type === "HomeCollection" ? "primary" : "secondary"} onClick={() => setType("HomeCollection")}>Home collection</Button>
          </div>
        </div>
      </Card>

      <Card className="mb-6" noPadding>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">3. Select Tests</h2>
            <div className="w-1/2 relative">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
              </svg>
              <Input 
                placeholder="Search tests..." 
                value={testSearchQ} 
                onChange={e => setTestSearchQ(e.target.value)} 
                className="pl-10"
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
            <details key={cat} open={isOpen} className="group mb-4 rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-[13px] font-bold uppercase tracking-widest text-slate-700 [&::-webkit-details-marker]:hidden bg-slate-50 hover:bg-slate-100 transition-colors">
                <span className="flex items-center gap-3">
                  <svg 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2.5" 
                    className="h-4 w-4 text-slate-400 transition-transform duration-300 ease-out-fluid group-open:rotate-90"
                  >
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                  <span>{cat}</span>
                  <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal text-slate-500 shadow-sm">{inCat.length}</span>
                  {pickedInCat > 0 && <span className="rounded-full bg-brand/10 text-brand px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal">{pickedInCat} selected</span>}
                </span>
              </summary>
              <div className="grid grid-cols-1 gap-3 border-t border-slate-100 p-4 md:grid-cols-2">
                {filteredInCat.map(t => {
                  const picked = pickedTestIds.includes(t.id);
                  const meta = outsourcedMeta[t.id];
                  const showMissingWarning = submitAttempted && picked && t.isOutsourced && !(meta?.sentTo ?? "").trim();
                  return (
                    <div key={t.id} className={`rounded-xl border p-3 transition-all duration-300 ease-out-fluid ${picked ? "border-brand/40 bg-brand/5 shadow-sm" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"}`}>
                      <label className="flex cursor-pointer items-center justify-between">
                        <span className="flex items-center gap-3">
                          <input type="checkbox" className="h-4 w-4 rounded text-brand focus:ring-brand/50" checked={picked} onChange={() => togglePicked(t)} />
                          <span>
                            <span className="font-medium text-slate-900">{t.name}</span>
                            {t.isOutsourced && (
                              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                                Outsourced
                              </span>
                            )}
                          </span>
                        </span>
                        <span className="font-mono text-sm font-medium text-slate-600">₹{Number(t.price).toFixed(0)}</span>
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
        <div className="mt-6 flex items-center justify-between border-t border-slate-200/60 pt-4">
          <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Total Selection</span>
          <div className="font-display text-2xl font-bold tracking-tight text-slate-900">₹{subtotal.toFixed(0)}</div>
        </div>
        </div>
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
