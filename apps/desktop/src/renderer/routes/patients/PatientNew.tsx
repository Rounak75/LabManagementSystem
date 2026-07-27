import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { call } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { Card } from "@/components/ui/Card";
import { useNavigate } from "react-router-dom";

type Doctor = { id: string; name: string; clinic: string | null; isActive: boolean };

export default function PatientNew() {
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ id: string; patientId: string; name: string } | null>(null);
  const { data: doctors = [] } = useQuery({ queryKey: ["doctors"], queryFn: () => call<Doctor[]>("doctors:list") });
  const { register, handleSubmit, watch, control, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { name: "", age: 0, sex: "Male", phone: "", email: "", address: "", referredById: "doctor-self" }
  });
  const phone = watch("phone");

  useQuery({
    queryKey: ["dup-check", phone],
    enabled: phone?.length >= 7,
    queryFn: async () => {
      const list = await call<any[]>("patients:search", { q: phone });
      const exact = list.find(p => p.phone === phone);
      setDuplicate(exact ? { id: exact.id, patientId: exact.patientId, name: exact.name } : null);
      return list;
    }
  });

  const create = useMutation({
    mutationFn: (v: any) => call<any>("patients:create", { ...v, age: Number(v.age) }),
    onSuccess: (p) => nav(`/patients/${p.id}`),
    onError: (e: any) => setError(e.message)
  });

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Register patient</h1>
      <Card className="max-w-2xl">
        <form onSubmit={handleSubmit(v => create.mutate(v))} className="grid grid-cols-2 gap-4">
          {/* Section: Personal Details */}
          <div className="col-span-2 mb-2 border-b border-slate-100 pb-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Personal Details</h2>
          </div>
          <Input label="Full name" className="col-span-2" {...register("name", { required: "required", minLength: 2 })} error={errors.name?.message as string} placeholder="e.g. John Doe" />
          <Input label="Age (years)" type="number" {...register("age", { required: true, min: 0, max: 130 })} placeholder="e.g. 35" />
          <Select label="Sex" {...register("sex")}>
            <option>Male</option><option>Female</option><option>Other</option>
          </Select>

          {/* Section: Contact & Reference */}
          <div className="col-span-2 mt-4 mb-2 border-b border-slate-100 pb-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Contact & Reference</h2>
          </div>
          <Input label="Phone (10 digits)" {...register("phone", { required: true, pattern: /^[0-9+\-\s]{7,}$/ })} error={errors.phone?.message as string} placeholder="9876543210" />
          <Input
            label="Email (optional — for digital reports)"
            type="email"
            placeholder="patient@example.com"
            {...register("email", {
              validate: v => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) || "Enter a valid email"
            })}
            error={errors.email?.message as string}
          />
          <Input label="Address (optional)" className="col-span-2" {...register("address")} placeholder="Door no., street, locality" />
          <Controller
            name="referredById"
            control={control}
            render={({ field }) => (
              <SearchableSelect
                label="Referred by"
                className="col-span-2"
                options={doctors.map(d => ({
                  value: d.id,
                  label: `${d.name}${d.clinic ? ` — ${d.clinic}` : ""}`
                }))}
                value={field.value}
                onChange={field.onChange}
                error={errors.referredById?.message as string}
              />
            )}
          />
          {duplicate && (
            <div className="col-span-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <div className="font-medium">Patient with this phone already registered.</div>
              <div>{duplicate.patientId} — {duplicate.name}</div>
              <Button variant="secondary" type="button" className="mt-2" onClick={() => nav(`/patients/${duplicate.id}`)}>Open existing record</Button>
            </div>
          )}
          {error && <div className="col-span-2 text-sm text-danger">{error}</div>}
          <div className="col-span-2 flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => nav(-1)}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting || !!duplicate}>Register</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
