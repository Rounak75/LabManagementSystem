import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { call } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { TEST_CATEGORIES, type TestCategory, type ResultType } from "@lab/types";

type Param = {
  id: string; testId: string; name: string; unit: string; resultType: ResultType;
  refRangeMaleMin: string | null; refRangeMaleMax: string | null;
  refRangeFemaleMin: string | null; refRangeFemaleMax: string | null;
  refRangeChildMin: string | null;  refRangeChildMax: string | null;
  qualitativeOptions: string | null; normalQualitative: string | null; displayOrder: number;
};
type CollectionTimeRestriction = "FastingMorningOnly" | "MorningOnly" | "EveningOnly" | null;
type Test = { id: string; name: string; category: TestCategory; price: string; isOutsourced: boolean; isActive: boolean; collectionTimeRestriction: CollectionTimeRestriction; parameters: Param[] };

export default function TestCatalogue() {
  const qc = useQueryClient();
  const { data: tests = [] } = useQuery({ queryKey: ["tests"], queryFn: () => call<Test[]>("tests:list") });
  const [openTest, setOpenTest] = useState<Test | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Test catalogue</h1>
        <Button onClick={() => setCreating(true)}>Add test</Button>
      </div>
      <div className="space-y-3">
        {TEST_CATEGORIES.map(cat => {
          const inCat = tests.filter(t => t.category === cat);
          if (inCat.length === 0) return null;
          return (
            <details key={cat} open className="rounded-md border border-slate-200 bg-white">
              <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-semibold text-slate-700 [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2">
                  <span className="text-xs text-slate-600 transition-transform group-open:rotate-90">▶</span>
                  <span className="uppercase tracking-wide">{cat}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">{inCat.length}</span>
                </span>
              </summary>
              <div className="grid grid-cols-1 gap-3 border-t border-slate-100 p-3 md:grid-cols-2 lg:grid-cols-3">
                {inCat.map(t => (
                  <Card key={t.id}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-semibold">{t.name}</div>
                        <div className="text-xs text-slate-500">₹{Number(t.price).toFixed(0)} · {t.parameters.length} param{t.parameters.length === 1 ? "" : "s"}</div>
                      </div>
                      <Button variant="ghost" onClick={() => setOpenTest(t)}>Edit</Button>
                    </div>
                  </Card>
                ))}
              </div>
            </details>
          );
        })}
      </div>
      {creating && <TestForm onClose={() => { setCreating(false); qc.invalidateQueries({ queryKey: ["tests"] }); }} />}
      {openTest && <TestEditor test={openTest} onClose={() => { setOpenTest(null); qc.invalidateQueries({ queryKey: ["tests"] }); }} />}
    </div>
  );
}

function TestForm({ test, onClose }: { test?: Test; onClose: () => void }) {
  const editing = !!test;
  const { register, handleSubmit } = useForm({
    defaultValues: {
      name: test?.name ?? "", category: test?.category ?? "Clinical Biochemistry",
      price: test?.price ?? "0", isOutsourced: test?.isOutsourced ?? false, isActive: test?.isActive ?? true,
      collectionTimeRestriction: test?.collectionTimeRestriction ?? ""
    }
  });
  const save = useMutation({
    mutationFn: (v: any) => {
      const payload = {
        ...v,
        price: Number(v.price),
        collectionTimeRestriction: v.collectionTimeRestriction || null
      };
      return editing
        ? call("tests:update", { id: test!.id, ...payload })
        : call("tests:create", payload);
    },
    onSuccess: onClose
  });
  return (
    <Modal open onClose={onClose} title={editing ? "Edit test" : "Add test"}>
      <form onSubmit={handleSubmit(v => save.mutate(v))} className="grid grid-cols-2 gap-3">
        <Input label="Name" className="col-span-2" {...register("name", { required: true })} />
        <Select label="Category" {...register("category")}>
          {TEST_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Input label="Price (₹)" type="number" step="1" {...register("price")} />
        <div className="col-span-2">
          <Select label="Collection time restriction" {...register("collectionTimeRestriction")}>
            <option value="">No restriction</option>
            <option value="FastingMorningOnly">Fasting — Morning only (8–11am, last meal 8pm previous day)</option>
            <option value="MorningOnly">Morning only (8–11am)</option>
            <option value="EveningOnly">Evening only (6–8pm)</option>
          </Select>
          <span className="mt-1 block text-xs text-slate-500">Shown on the public booking form; restricts which slots a patient can pick when this test is selected.</span>
        </div>
        <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" {...register("isOutsourced")} /> Outsourced (sent to external lab)</label>
        {editing && <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" {...register("isActive")} /> Active</label>}
        <div className="col-span-2 flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit">{editing ? "Save" : "Add"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function TestEditor({ test, onClose }: { test: Test; onClose: () => void }) {
  const qc = useQueryClient();
  const [showAddParam, setShowAddParam] = useState(false);
  const [editingBasics, setEditingBasics] = useState(false);
  const removeParam = useMutation({ mutationFn: (id: string) => call("params:remove", { id }), onSuccess: () => qc.invalidateQueries({ queryKey: ["tests"] }) });
  return (
    <Modal open onClose={onClose} title={`Edit: ${test.name}`}>
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded border bg-slate-50 px-3 py-2 text-sm">
          <div className="text-slate-600">
            {test.category} · ₹{Number(test.price).toFixed(0)} · {test.isOutsourced ? "Outsourced" : "In-house"} · {test.isActive ? "Active" : "Inactive"}
          </div>
          <Button variant="ghost" onClick={() => setEditingBasics(true)}>Edit basics</Button>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-medium">Parameters</h3>
            <Button variant="ghost" onClick={() => setShowAddParam(true)}>+ Add parameter</Button>
          </div>
          <div className="divide-y rounded border">
            {test.parameters.length === 0 && <div className="p-3 text-sm text-slate-500">No parameters yet.</div>}
            {test.parameters.map(p => (
              <div key={p.id} className="flex items-center justify-between p-2 text-sm">
                <div>
                  <span className="font-medium">{p.name}</span>
                  <span className="ml-2 text-slate-500">{p.unit} · {p.resultType}</span>
                </div>
                <Button variant="ghost" onClick={() => removeParam.mutate(p.id)}>Remove</Button>
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end"><Button variant="secondary" onClick={onClose}>Close</Button></div>
      </div>
      {showAddParam && <ParamForm testId={test.id} onClose={() => { setShowAddParam(false); qc.invalidateQueries({ queryKey: ["tests"] }); }} />}
      {editingBasics && <TestForm test={test} onClose={() => { setEditingBasics(false); qc.invalidateQueries({ queryKey: ["tests"] }); }} />}
    </Modal>
  );
}

function ParamForm({ testId, onClose }: { testId: string; onClose: () => void }) {
  const { register, handleSubmit, watch } = useForm({
    defaultValues: {
      name: "", unit: "", resultType: "Numeric" as ResultType, displayOrder: 0,
      refRangeMaleMin: "", refRangeMaleMax: "", refRangeFemaleMin: "", refRangeFemaleMax: "",
      refRangeChildMin: "", refRangeChildMax: "", qualitativeOptions: "", normalQualitative: ""
    }
  });
  const isQual = watch("resultType") === "Qualitative";
  const save = useMutation({
    mutationFn: (v: any) => call("params:create", {
      testId,
      name: v.name, unit: v.unit, resultType: v.resultType, displayOrder: Number(v.displayOrder),
      refRangeMaleMin:    v.refRangeMaleMin    === "" ? null : Number(v.refRangeMaleMin),
      refRangeMaleMax:    v.refRangeMaleMax    === "" ? null : Number(v.refRangeMaleMax),
      refRangeFemaleMin:  v.refRangeFemaleMin  === "" ? null : Number(v.refRangeFemaleMin),
      refRangeFemaleMax:  v.refRangeFemaleMax  === "" ? null : Number(v.refRangeFemaleMax),
      refRangeChildMin:   v.refRangeChildMin   === "" ? null : Number(v.refRangeChildMin),
      refRangeChildMax:   v.refRangeChildMax   === "" ? null : Number(v.refRangeChildMax),
      qualitativeOptions: v.qualitativeOptions || null,
      normalQualitative:  v.normalQualitative  || null
    }),
    onSuccess: onClose
  });
  return (
    <Modal open onClose={onClose} title="Add parameter">
      <form onSubmit={handleSubmit(v => save.mutate(v))} className="grid grid-cols-2 gap-3">
        <Input label="Parameter name" className="col-span-2" {...register("name", { required: true })} />
        <Input label="Unit (e.g. mg/dL, leave blank for qualitative)" {...register("unit")} />
        <Select label="Type" {...register("resultType")}>
          <option value="Numeric">Numeric</option>
          <option value="Qualitative">Qualitative</option>
        </Select>
        <Input label="Display order" type="number" {...register("displayOrder")} />
        {!isQual && <>
          <Input label="Male range min" {...register("refRangeMaleMin")} />
          <Input label="Male range max" {...register("refRangeMaleMax")} />
          <Input label="Female range min" {...register("refRangeFemaleMin")} />
          <Input label="Female range max" {...register("refRangeFemaleMax")} />
          <Input label="Child range min" {...register("refRangeChildMin")} />
          <Input label="Child range max" {...register("refRangeChildMax")} />
        </>}
        {isQual && <>
          <Input label='Options (JSON e.g. ["Positive","Negative"])' className="col-span-2" {...register("qualitativeOptions")} />
          <Input label="Normal value (used to flag abnormal)" className="col-span-2" {...register("normalQualitative")} />
        </>}
        <div className="col-span-2 flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit">Add</Button>
        </div>
      </form>
    </Modal>
  );
}
