import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { call } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { saveDraft, loadDraft, clearDraft } from "@/lib/draft";
import { SensitivityGridEditor } from "@/components/SensitivityGridEditor";
import { TiterGridEditor } from "@/components/TiterGridEditor";

type Param = { id: string; name: string; unit: string; resultType: "Numeric" | "Qualitative" | "SensitivityGrid" | "TiterGrid";
  qualitativeOptions: string | null;
  refRangeMaleMin: string | null; refRangeMaleMax: string | null;
  refRangeFemaleMin: string | null; refRangeFemaleMax: string | null;
  refRangeChildMin: string | null; refRangeChildMax: string | null };
type VT = { id: string; isLocked: boolean;
  /** True when an Admin unlocked this result after it was previously verified. */
  wasPreviouslyVerified: boolean;
  test: { name: string; parameters: Param[] };
  visit: { id: string; patient: { name: string; age: number; sex: string; patientId: string } };
  results: Array<{
    parameterId: string;
    value: string;
    isAbnormal: boolean;
    abnormalOverride: boolean | null;
    notes: string | null;
    version: number;
    updatedAt?: string;
  }> };

type RowState = { value: string; notes: string; override: "auto" | "normal" | "abnormal" };

export default function ResultEntry() {
  const { visitTestId } = useParams<{ visitTestId: string }>();
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data: vt, isLoading } = useQuery({
    queryKey: ["visitTest", visitTestId], enabled: !!visitTestId,
    queryFn: () => call<VT>("visitTests:getOne", { id: visitTestId })
  });
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [version, setVersion] = useState<number | undefined>(undefined);
  const [staleModal, setStaleModal] = useState(false);
  const [draftBanner, setDraftBanner] = useState<{ savedAt: number } | null>(null);
  const inputRefs = useRef<Array<HTMLInputElement | HTMLSelectElement | null>>([]);

  function handleInputKeyDown(idx: number) {
    return (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const dir = e.shiftKey ? -1 : 1;
        const next = inputRefs.current[idx + dir];
        if (next) next.focus();
      }
    };
  }

  useEffect(() => {
    if (vt) {
      const seed: Record<string, RowState> = {};
      for (const p of vt.test.parameters) {
        const r = vt.results.find(r => r.parameterId === p.id);
        const override: RowState["override"] =
          r?.abnormalOverride === true  ? "abnormal" :
          r?.abnormalOverride === false ? "normal"   : "auto";
        seed[p.id] = { value: r?.value ?? "", notes: r?.notes ?? "", override };
      }
      setRows(seed);
      const maxV = vt.results.length > 0
        ? Math.max(...vt.results.map(r => r.version ?? 1))
        : undefined;
      setVersion(maxV);
    }
  }, [vt]);

  useEffect(() => {
    if (!vt || !visitTestId) return;
    const draft = loadDraft<{ rows: Record<string, RowState>; version?: number }>(visitTestId);
    if (!draft) return;
    const serverUpdated = vt.results.length > 0
      ? Math.max(...vt.results.map(r => new Date(r.updatedAt ?? 0).getTime()))
      : 0;
    if (draft.savedAt > serverUpdated) {
      setDraftBanner({ savedAt: draft.savedAt });
    }
  }, [vt, visitTestId]);

  useEffect(() => {
    if (!visitTestId) return;
    const t = setTimeout(() => saveDraft(visitTestId, { rows, version }), 500);
    return () => clearTimeout(t);
  }, [rows, version, visitTestId]);

  const save = useMutation({
    mutationFn: (after: "stay" | "close") =>
      call<{ ok: true; version: number }>("results:upsert", {
        visitTestId,
        expectedVersion: version,
        values: Object.entries(rows).map(([parameterId, r]) => ({
          parameterId,
          value: r.value,
          notes: r.notes || null,
          abnormalOverride: r.override === "auto" ? null : r.override === "abnormal"
        }))
      }).then(r => ({ result: r, after })),
    onSuccess: ({ result, after }) => {
      setVersion(result.version);
      clearDraft(visitTestId!);
      setDraftBanner(null);
      qc.invalidateQueries({ queryKey: ["visitTest", visitTestId] });
      qc.invalidateQueries({ queryKey: ["visit", vt!.visit.id] });
      if (after === "close") nav(`/visits/${vt!.visit.id}`);
    },
    onError: (err: any) => {
      if (err?.code === "STALE_VERSION") {
        setStaleModal(true);
      }
      // other errors: handled by global toast (Task 2)
    }
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (vt?.isLocked || save.isPending) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        save.mutate("stay");
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        save.mutate("close");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, vt?.isLocked]);

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

  const blankRow: RowState = { value: "", notes: "", override: "auto" };

  return (
    <div className="max-w-4xl">
      <h1 className="mb-1 text-2xl font-semibold">{vt.test.name}</h1>
      <div className="mb-4 text-sm text-slate-500">
        {vt.visit.patient.name} · {vt.visit.patient.patientId} · {vt.visit.patient.age}/{vt.visit.patient.sex}
      </div>
      {draftBanner && (
        <div className="mb-3 flex items-center justify-between rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
          <span>Unsaved draft from {new Date(draftBanner.savedAt).toLocaleString("en-IN")}</span>
          <span className="flex gap-2">
            <Button variant="ghost" onClick={() => {
              const d = loadDraft<{ rows: Record<string, RowState>; version?: number }>(visitTestId!)!;
              setRows(d.payload.rows);
              if (d.payload.version !== undefined) setVersion(d.payload.version);
              setDraftBanner(null);
            }}>Restore</Button>
            <Button variant="ghost" onClick={() => { clearDraft(visitTestId!); setDraftBanner(null); }}>Discard</Button>
          </span>
        </div>
      )}
      {vt.wasPreviouslyVerified && !vt.isLocked && (
        <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          This result was unlocked for editing — every change is being audited.
        </div>
      )}
      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left">
            <tr>
              <th className="px-4 py-3">Parameter</th>
              <th className="px-4 py-3">Result</th>
              <th className="px-4 py-3">Unit</th>
              <th className="px-4 py-3">Normal range</th>
              <th className="px-4 py-3">Flag</th>
              <th className="px-4 py-3">Note</th>
            </tr>
          </thead>
          <tbody>
            {vt.test.parameters.map((p, i) => {
              const row = rows[p.id] ?? blankRow;
              const isGrid = p.resultType === "SensitivityGrid" || p.resultType === "TiterGrid";
              if (isGrid) {
                return (
                  <tr key={p.id} className="border-t">
                    <td className="px-4 py-3 font-medium align-top">{p.name}</td>
                    <td className="px-4 py-3" colSpan={5}>
                      {p.resultType === "SensitivityGrid" ? (
                        <SensitivityGridEditor
                          drugs={(safeParse(p.qualitativeOptions, { drugs: [] as string[] })).drugs}
                          value={row.value}
                          disabled={vt.isLocked}
                          onChange={v => setRows(r => ({ ...r, [p.id]: { ...(r[p.id] ?? blankRow), value: v } }))}
                        />
                      ) : (
                        <TiterGridEditor
                          config={safeParse(p.qualitativeOptions, { antigens: [] as string[], dilutions: [] as string[] })}
                          value={row.value}
                          disabled={vt.isLocked}
                          onChange={v => setRows(r => ({ ...r, [p.id]: { ...(r[p.id] ?? blankRow), value: v } }))}
                        />
                      )}
                      <div className="mt-2 flex items-center gap-3">
                        <OverridePill
                          value={row.override}
                          disabled={vt.isLocked}
                          onChange={ov => setRows(r => ({ ...r, [p.id]: { ...(r[p.id] ?? blankRow), override: ov } }))}
                        />
                        <NotesPopover
                          value={row.notes}
                          disabled={vt.isLocked}
                          onChange={n => setRows(r => ({ ...r, [p.id]: { ...(r[p.id] ?? blankRow), notes: n } }))}
                        />
                      </div>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={p.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 w-40">
                    {p.resultType === "Qualitative" && p.qualitativeOptions ? (
                      <select className="w-full rounded border px-2 py-1" value={row.value}
                        disabled={vt.isLocked}
                        ref={el => { inputRefs.current[i] = el; }}
                        onKeyDown={handleInputKeyDown(i)}
                        onChange={e => setRows(r => ({ ...r, [p.id]: { ...(r[p.id] ?? blankRow), value: e.target.value } }))}>
                        <option value="">—</option>
                        {(JSON.parse(p.qualitativeOptions) as string[]).map(o => <option key={o}>{o}</option>)}
                      </select>
                    ) : (
                      <Input value={row.value}
                        ref={el => { inputRefs.current[i] = el; }}
                        onKeyDown={handleInputKeyDown(i)}
                        onChange={e => setRows(r => ({ ...r, [p.id]: { ...(r[p.id] ?? blankRow), value: e.target.value } }))}
                        disabled={vt.isLocked} />
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{p.unit}</td>
                  <td className="px-4 py-3 text-slate-500">{rangeFor(p)}</td>
                  <td className="px-4 py-3">
                    <OverridePill
                      value={row.override}
                      disabled={vt.isLocked}
                      onChange={ov => setRows(r => ({ ...r, [p.id]: { ...(r[p.id] ?? blankRow), override: ov } }))}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <NotesPopover
                      value={row.notes}
                      disabled={vt.isLocked}
                      onChange={n => setRows(r => ({ ...r, [p.id]: { ...(r[p.id] ?? blankRow), notes: n } }))}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => nav(-1)}>Cancel</Button>
        <Button variant="ghost" disabled={vt.isLocked || save.isPending}
          onClick={() => save.mutate("stay")}>Save & continue</Button>
        <Button disabled={vt.isLocked || save.isPending}
          onClick={() => save.mutate("close")}>Save & close</Button>
      </div>

      {staleModal && (
        <Modal open onClose={() => setStaleModal(false)} title="Results changed">
          <p className="text-sm">
            Someone else updated these results since you opened the page.
            Reload to see the latest? Your unsaved changes will be discarded.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setStaleModal(false)}>Keep editing</Button>
            <Button onClick={() => {
              setStaleModal(false);
              qc.invalidateQueries({ queryKey: ["visitTest", visitTestId] });
            }}>Reload</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function safeParse<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

function OverridePill({ value, onChange, disabled }: { value: "auto" | "normal" | "abnormal"; onChange: (v: "auto" | "normal" | "abnormal") => void; disabled?: boolean }) {
  const cls = (k: string) => {
    if (value !== k) return "text-slate-600";
    if (k === "abnormal") return "bg-rose-500 text-white";
    if (k === "normal")   return "bg-emerald-500 text-white";
    return "bg-slate-700 text-white";
  };
  return (
    <div className="inline-flex gap-1 rounded border bg-slate-50 p-0.5 text-xs">
      {(["auto", "normal", "abnormal"] as const).map(k => (
        <button key={k} type="button" disabled={disabled} onClick={() => onChange(k)}
          className={`rounded px-2 py-0.5 disabled:opacity-50 ${cls(k)}`}>
          {k.charAt(0).toUpperCase() + k.slice(1)}
        </button>
      ))}
    </div>
  );
}

function NotesPopover({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { if (open) setDraft(value); }, [open, value]);
  return (
    <>
      <button type="button" disabled={disabled} onClick={() => setOpen(true)}
        className={`text-xs underline disabled:opacity-50 ${value ? "text-slate-800" : "text-slate-400"}`}>
        {value ? "Edit note" : "+ Note"}
      </button>
      {open && (
        <Modal open onClose={() => setOpen(false)} title="Parameter note">
          <textarea value={draft} onChange={e => setDraft(e.target.value.slice(0, 500))}
            className="h-32 w-full rounded border p-2 text-sm" maxLength={500} />
          <div className="mt-2 text-xs text-slate-500">{draft.length} / 500</div>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => { onChange(draft); setOpen(false); }}>Done</Button>
          </div>
        </Modal>
      )}
    </>
  );
}
