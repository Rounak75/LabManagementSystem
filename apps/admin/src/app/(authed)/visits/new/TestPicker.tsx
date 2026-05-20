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
  return (
    <div>
      <span className="text-sm font-medium block mb-1">Tests</span>
      {tests.length === 0 ? (
        <p className="text-sm text-gray-500">No active tests in the catalog.</p>
      ) : (
        <div className="border rounded max-h-60 overflow-y-auto bg-white">
          {tests.map((t) => {
            const chk = selected.includes(t.id);
            return (
              <label key={t.id} className="flex items-center justify-between px-3 py-2 border-b last:border-b-0">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={chk}
                    onChange={() => setSelected(chk ? selected.filter((i) => i !== t.id) : [...selected, t.id])}
                  />
                  <span className="text-sm">{t.name}</span>
                </div>
                <span className="text-xs text-gray-500">{formatINR(Number(t.price))}</span>
              </label>
            );
          })}
        </div>
      )}
      <div className="text-right text-sm mt-2">
        <strong>Total:</strong> {formatINR(total)}
      </div>
    </div>
  );
}
