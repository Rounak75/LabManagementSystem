"use client";
import { formatINR } from "@/lib/format";

interface Test {
  id: string;
  name: string;
  price: number;
}

export function TestPicker({
  tests,
  selected,
  setSelected,
}: {
  tests: Test[];
  selected: string[];
  setSelected: (s: string[]) => void;
}) {
  const total = tests.filter((t) => selected.includes(t.id)).reduce((a, t) => a + Number(t.price), 0);
  const count = selected.length;
  return (
    <div>
      <span className="field-label">Tests {count > 0 && <span className="text-slate-400">· {count} selected</span>}</span>
      {tests.length === 0 ? (
        <p className="text-sm text-slate-500">No active tests in the catalog.</p>
      ) : (
        <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white">
          {tests.map((t) => {
            const chk = selected.includes(t.id);
            return (
              <label
                key={t.id}
                className={`flex cursor-pointer items-center justify-between border-b border-slate-100 px-3.5 py-3 last:border-b-0 transition-colors ${
                  chk ? "bg-brand-50" : "hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={chk}
                    onChange={() => setSelected(chk ? selected.filter((i) => i !== t.id) : [...selected, t.id])}
                    className="h-4 w-4 accent-brand"
                  />
                  <span className="text-sm font-medium text-slate-800">{t.name}</span>
                </div>
                <span className="text-xs text-slate-500">{formatINR(Number(t.price))}</span>
              </label>
            );
          })}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
        <span className="text-slate-500">Total</span>
        <strong className="text-base text-slate-900">{formatINR(total)}</strong>
      </div>
    </div>
  );
}
