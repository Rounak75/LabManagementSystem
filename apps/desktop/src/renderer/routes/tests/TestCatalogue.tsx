import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { call } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import type { TestCategory, ResultType } from "@lab/types";

type Param = {
  id: string; testId: string; name: string; unit: string; resultType: ResultType;
  refRangeMaleMin: string | null; refRangeMaleMax: string | null;
  refRangeFemaleMin: string | null; refRangeFemaleMax: string | null;
  refRangeChildMin: string | null;  refRangeChildMax: string | null;
  qualitativeOptions: string | null; normalQualitative: string | null; displayOrder: number;
};
type Test = { id: string; name: string; category: TestCategory; price: string; isOutsourced: boolean; isActive: boolean; parameters: Param[] };

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
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {tests.map(t => (
          <Card key={t.id}>
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold">{t.name}</div>
                <div className="text-xs text-slate-500">{t.category} · ₹{Number(t.price).toFixed(0)} · {t.parameters.length} param{t.parameters.length === 1 ? "" : "s"}</div>
              </div>
              <Button variant="ghost" onClick={() => setOpenTest(t)}>Edit</Button>
            </div>
          </Card>
        ))}
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
      name: test?.name ?? "", category: test?.category ?? "Blood",
      price: test?.price ?? "0", isOutsourced: test?.isOutsourced ?? false, isActive: test?.isActive ?? true
    }
  });
  const save = useMutation({
    mutationFn: (v: any) => editing
      ? call("tests:update", { id: test!.id, ...v, price: Number(v.price) })
      : call("tests:create", { ...v, price: Number(v.price) }),
    onSuccess: onClose
  });
  return (
    <Modal open onClose={onClose} title={editing ? "Edit test" : "Add test"}>
      <form onSubmit={handleSubmit(v => save.mutate(v))} className="grid grid-cols-2 gap-3">
        <Input label="Name" className="col-span-2" {...register("name", { required: true })} />
        <label className="text-sm">
          <span className="mb-1 block font-medium">Category</span>
          <select className="w-full rounded-md border px-3 py-2" {...register("category")}>
            {["Blood","Urine","Stool","Other"].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <Input label="Price (₹)" type="number" step="1" {...register("price")} />
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
        <label className="text-sm"><span className="mb-1 block font-medium">Type</span>
          <select className="w-full rounded-md border px-3 py-2" {...register("resultType")}>
            <option value="Numeric">Numeric</option>
            <option value="Qualitative">Qualitative</option>
          </select>
        </label>
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
