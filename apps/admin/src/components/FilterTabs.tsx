import Link from "next/link";

export interface TabOption {
  label: string;
  value: string | null;
}

export function FilterTabs({
  basePath,
  param,
  current,
  options,
}: {
  basePath: string;
  param: string;
  current: string | null;
  options: TabOption[];
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = (o.value ?? null) === (current ?? null);
        const href = o.value ? `${basePath}?${param}=${o.value}` : basePath;
        return (
          <Link
            key={o.label}
            href={href}
            prefetch
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-slate-900 text-white shadow-sm"
                : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
            }`}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}
