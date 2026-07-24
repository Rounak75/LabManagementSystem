"use client";
import { useState } from "react";
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
  const [search, setSearch] = useState("");
  const total = tests.filter((t) => selected.includes(t.id)).reduce((a, t) => a + Number(t.price), 0);
  const count = selected.length;
  
  const filteredTests = tests.filter(t => 
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="field-label">Tests {count > 0 && <span className="text-slate-400">· {count} selected</span>}</span>
        {count > 0 && (
          <button type="button" onClick={() => setSelected([])} className="text-xs font-medium text-brand hover:text-brand-600 transition-colors">
            Clear all
          </button>
        )}
      </div>

      <div className="relative">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
        </svg>
        <input 
          type="text" 
          placeholder="Search tests..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-slate-300 py-1.5 pl-9 pr-3 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>

      {filteredTests.length === 0 ? (
        <p className="rounded-lg border border-slate-100 bg-slate-50 p-4 text-center text-sm text-slate-500">
          {search ? "No tests match your search." : "No active tests in the catalog."}
        </p>
      ) : (
        <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white">
          {filteredTests.map((t) => {
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
