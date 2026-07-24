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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-bold uppercase tracking-widest text-slate-400">Tests {count > 0 && <span className="text-slate-400">· {count} selected</span>}</span>
        {count > 0 && (
          <button type="button" onClick={() => setSelected([])} className="text-xs font-semibold text-brand hover:text-brand-dark transition-colors">
            Clear all
          </button>
        )}
      </div>

      <div className="relative">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
        </svg>
        <input 
          type="text" 
          placeholder="Search tests..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-200/80 bg-slate-50 py-2.5 pl-10 pr-4 text-[14px] text-slate-900 shadow-inner-bezel transition-all duration-300 ease-out-fluid hover:border-slate-300 hover:bg-white focus:border-brand/40 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand/10"
        />
      </div>

      {filteredTests.length === 0 ? (
        <p className="rounded-xl border border-slate-100 bg-slate-50 p-6 text-center text-sm font-medium text-slate-500 shadow-inner-bezel-dark">
          {search ? "No tests match your search." : "No active tests in the catalog."}
        </p>
      ) : (
        <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200/80 bg-white shadow-sm">
          {filteredTests.map((t) => {
            const chk = selected.includes(t.id);
            return (
              <label
                key={t.id}
                className={`flex cursor-pointer items-center justify-between border-b border-slate-100 px-4 py-3.5 last:border-b-0 transition-all duration-300 ease-out-fluid ${
                  chk ? "bg-brand/5 border-l-2 border-l-brand" : "border-l-2 border-l-transparent hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={chk}
                    onChange={() => setSelected(chk ? selected.filter((i) => i !== t.id) : [...selected, t.id])}
                    className="h-4 w-4 rounded text-brand focus:ring-brand/50"
                  />
                  <span className={`text-[14px] font-medium ${chk ? "text-brand-dark" : "text-slate-800"}`}>{t.name}</span>
                </div>
                <span className="font-mono text-sm font-medium text-slate-600">{formatINR(Number(t.price))}</span>
              </label>
            );
          })}
        </div>
      )}
      
      <div className="mt-4 flex items-center justify-between border-t border-slate-200/60 pt-4">
        <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Total</span>
        <strong className="font-display text-2xl font-bold tracking-tight text-slate-900">{formatINR(total)}</strong>
      </div>
    </div>
  );
}
