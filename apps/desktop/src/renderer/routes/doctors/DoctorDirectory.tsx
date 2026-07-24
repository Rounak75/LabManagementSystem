import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { call } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";

type Doctor = { id: string; name: string; clinic: string | null; isActive: boolean };

export default function DoctorDirectory() {
  const qc = useQueryClient();
  const { data: doctors = [], isLoading } = useQuery({ queryKey: ["doctors"], queryFn: () => call<Doctor[]>("doctors:list") });
  const [editing, setEditing] = useState<Doctor | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div>
      <PageHeader title="Referring doctors" actions={<Button onClick={() => setAdding(true)}>Add doctor</Button>} />
      <Card noPadding>
        {isLoading ? <div className="p-6 text-slate-500">Loading…</div> : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-700">Name</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-700">Clinic</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-700">Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {doctors.map(d => (
                <tr key={d.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{d.name}</td>
                  <td className="px-4 py-3 text-slate-500">{d.clinic ?? "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge variant={d.isActive ? "success" : "neutral"}>{d.isActive ? "Active" : "Inactive"}</StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {d.id !== "doctor-self" && <Button size="sm" variant="ghost" onClick={() => setEditing(d)}>Edit</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {adding && <DoctorForm onClose={() => { setAdding(false); qc.invalidateQueries({ queryKey: ["doctors"] }); }} />}
      {editing && <DoctorForm doctor={editing} onClose={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["doctors"] }); }} />}
    </div>
  );
}

function DoctorForm({ doctor, onClose }: { doctor?: Doctor; onClose: () => void }) {
  const editing = !!doctor;
  const { register, handleSubmit } = useForm<{ name: string; clinic: string; isActive?: boolean }>({
    defaultValues: { name: doctor?.name ?? "", clinic: doctor?.clinic ?? "", isActive: doctor?.isActive ?? true }
  });
  const save = useMutation({
    mutationFn: (v: any) => editing
      ? call("doctors:update", { id: doctor!.id, ...v })
      : call("doctors:create", v),
    onSuccess: onClose
  });
  return (
    <Modal open onClose={onClose} title={editing ? "Edit doctor" : "Add doctor"}>
      <form onSubmit={handleSubmit(v => save.mutate(v))} className="space-y-4">
        <Input label="Name" {...register("name", { required: true })} />
        <Input label="Clinic / hospital (optional)" {...register("clinic")} />
        {editing && <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register("isActive")} /> Active</label>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit">{editing ? "Save" : "Add"}</Button>
        </div>
      </form>
    </Modal>
  );
}
