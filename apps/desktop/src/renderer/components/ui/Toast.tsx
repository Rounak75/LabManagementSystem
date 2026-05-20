import { useToast } from "@/lib/toast.store";

const SEVERITY_CLASS: Record<string, string> = {
  info:    "bg-slate-800 text-white",
  success: "bg-emerald-600 text-white",
  warn:    "bg-amber-500 text-slate-900",
  error:   "bg-rose-600 text-white"
};

export function Toaster() {
  const items = useToast(s => s.items);
  const dismiss = useToast(s => s.dismiss);
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-80 flex-col gap-2">
      {items.map(t => (
        <div key={t.id} className={`pointer-events-auto rounded-md px-3 py-2 text-sm shadow ${SEVERITY_CLASS[t.severity]}`}>
          <div className="flex items-start gap-2">
            <div className="flex-1">{t.message}</div>
            <button onClick={() => dismiss(t.id)} className="opacity-75 hover:opacity-100" aria-label="Dismiss">×</button>
          </div>
        </div>
      ))}
    </div>
  );
}
