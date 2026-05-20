type TiterResult = "Positive" | "Negative" | "—";
type TiterValue = { results: Record<string, TiterResult> };

function safeJson<T>(s: string, fb: T): T {
  try { return JSON.parse(s) as T; } catch { return fb; }
}

export function TiterGridEditor({
  config, value, onChange, disabled
}: {
  config: { antigens: string[]; dilutions: string[] };
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const parsed: TiterValue = value ? safeJson(value, { results: {} }) : { results: {} };
  const set = (key: string, r: TiterResult) =>
    onChange(JSON.stringify({ results: { ...parsed.results, [key]: r } }));

  return (
    <div className="overflow-x-auto rounded border bg-slate-50 p-2">
      <table className="text-xs">
        <thead>
          <tr>
            <th className="px-2 py-1 text-left">Antigen</th>
            {config.dilutions.map(d => (
              <th key={d} className="px-2 py-1 text-left">{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {config.antigens.map(a => (
            <tr key={a}>
              <td className="px-2 py-1 font-medium">{a}</td>
              {config.dilutions.map(d => {
                const key = `${a}@${d}`;
                const cur = parsed.results[key] ?? "—";
                return (
                  <td key={d} className="px-1 py-1">
                    <select
                      value={cur}
                      disabled={disabled}
                      onChange={e => set(key, e.target.value as TiterResult)}
                      className="rounded border px-1 py-0.5 disabled:opacity-50"
                    >
                      <option>—</option>
                      <option>Positive</option>
                      <option>Negative</option>
                    </select>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
