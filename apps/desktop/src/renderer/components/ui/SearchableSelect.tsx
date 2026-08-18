import { useState, useRef, useEffect } from "react";
import { ChevronDown, Search, Check } from "lucide-react";

interface Option {
  value: string;
  label: string;
}

interface Props {
  label?: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
  className?: string;
}

export function SearchableSelect({ label, options, value, onChange, error, className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const selectedOption = options.find((o) => o.value === value);
  const filtered = query === "" 
    ? options 
    : options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className={`relative block ${className}`} ref={containerRef}>
      {label && <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-700">{label}</span>}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex w-full items-center justify-between rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 transition-colors hover:border-slate-300 focus:border-brand focus:ring-2 focus:ring-brand/20 ${error ? "border-danger" : "border-slate-200"} ${!selectedOption ? "text-slate-500" : ""}`}
      >
        <span className="truncate">{selectedOption ? selectedOption.label : "Select..."}</span>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-card border border-slate-200 bg-white py-1 shadow-overlay animate-in fade-in zoom-in-95 duration-200 origin-top">
          <div className="sticky top-0 bg-white px-2 pb-2 pt-1 z-10">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                autoFocus
                className="w-full rounded-md border border-slate-200 py-1.5 pl-9 pr-3 text-sm focus:border-brand focus:ring-1 focus:ring-brand"
                placeholder="Search..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-500">No results found.</div>
          ) : (
            filtered.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`flex w-full items-center justify-between px-3 py-2 text-sm text-left hover:bg-slate-50 ${option.value === value ? "bg-brand/5 font-medium text-brand" : "text-slate-900"}`}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                  setQuery("");
                }}
              >
                {option.label}
                {option.value === value && <Check className="h-4 w-4 text-brand" />}
              </button>
            ))
          )}
        </div>
      )}
      {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
    </div>
  );
}
