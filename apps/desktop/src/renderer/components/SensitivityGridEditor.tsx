type Sens = "+" | "++" | "+++" | "R" | "—";
type GridValue = { sensitivities: Record<string, Sens> };

function safeJson<T>(s: string, fallback: T): T {
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

export function SensitivityGridEditor({
  drugs, value, onChange, disabled
}: { drugs: string[]; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const parsed: GridValue = value ? safeJson(value, { sensitivities: {} }) : { sensitivities: {} };
  const setDrug = (drug: string, sens: Sens) => {
    const next = { ...parsed.sensitivities, [drug]: sens };
    onChange(JSON.stringify({ sensitivities: next }));
  };
  return (
    <div className="rounded border bg-slate-50 p-3">
      <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
        {drugs.map(d => (
          <div key={d} className="contents">
            <div className="border-b py-1">{d}</div>
            <div className="flex gap-1 border-b py-1">
              {(["—","+","++","+++","R"] as const).map(opt => (
                <button
                  key={opt}
                  type="button"
                  disabled={disabled}
                  onClick={() => setDrug(d, opt)}
                  className={`rounded border px-1.5 py-0.5 disabled:opacity-50 ${
                    parsed.sensitivities[d] === opt ? "bg-slate-800 text-white" : "bg-white"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 text-xs text-slate-500">
        + Mildly &middot; ++ Moderately &middot; +++ Highly Sensitive &middot; R Resistant
      </div>
    </div>
  );
}
