// Phase 3d Plan H — single-day closures that hide booking slots on the portal.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { call } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

interface Closure { id: string; date: string; reason: string | null; }

export function LabClosuresTab() {
  const qc = useQueryClient();
  const { data: closures = [] } = useQuery({
    queryKey: ["closures"],
    queryFn: () => call<Closure[]>("closures:list"),
  });

  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");

  const add = useMutation({
    mutationFn: () => call("closures:upsert", { date, reason }),
    onSuccess: () => {
      setDate(""); setReason("");
      qc.invalidateQueries({ queryKey: ["closures"] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => call("closures:remove", { id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["closures"] }),
  });

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Lab closures</h1>
      <p className="mb-4 text-sm text-slate-600">
        Add a date when the lab will be fully closed (festival, holiday, etc.).
        Patients won't be able to pick that date when booking a home visit.
        Sunday-evening closures are already handled by lab hours and don't need to be listed here.
      </p>

      <Card>
        <div className="grid grid-cols-3 gap-3">
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} className="col-span-2" />
        </div>
        <div className="mt-3 flex justify-end">
          <Button type="button" disabled={!date || add.isPending} onClick={() => add.mutate()}>
            {add.isPending ? "Adding…" : "Add closure"}
          </Button>
        </div>
      </Card>

      <div className="mt-4">
        <Card>
          <h2 className="mb-2 text-lg font-medium">Upcoming closures</h2>
          {closures.length === 0 ? (
            <p className="text-sm text-slate-500">None scheduled.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {closures.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <span className="font-medium">{new Date(c.date).toLocaleDateString()}</span>
                    {c.reason ? <span className="ml-2 text-slate-600">— {c.reason}</span> : null}
                  </div>
                  <Button type="button" variant="ghost" onClick={() => remove.mutate(c.id)}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
