import Link from "next/link";

type Tone = "brand" | "amber" | "sky" | "emerald" | "slate";

const TONES: Record<Tone, { ring: string; value: string; icon: string }> = {
  brand: { ring: "hover:border-brand/40", value: "text-brand-700", icon: "bg-brand-50 text-brand-700" },
  amber: { ring: "hover:border-amber-300", value: "text-amber-700", icon: "bg-amber-50 text-amber-700" },
  sky: { ring: "hover:border-sky-300", value: "text-sky-700", icon: "bg-sky-50 text-sky-700" },
  emerald: { ring: "hover:border-emerald-300", value: "text-emerald-700", icon: "bg-emerald-50 text-emerald-700" },
  slate: { ring: "hover:border-slate-300", value: "text-slate-800", icon: "bg-slate-100 text-slate-600" },
};

export function StatCard({
  href,
  label,
  value,
  hint,
  tone = "slate",
  icon,
  urgent = false,
}: {
  href: string;
  label: string;
  value: string | number;
  hint?: string;
  tone?: Tone;
  icon?: React.ReactNode;
  urgent?: boolean;
}) {
  const t = TONES[tone];
  return (
    <Link
      href={href}
      className={`card group flex flex-col gap-3 p-4 transition-all hover:shadow-md ${t.ring} ${
        urgent ? "ring-1 ring-amber-200" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        {icon && <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${t.icon}`}>{icon}</span>}
      </div>
      <div className="flex items-end justify-between">
        <span className={`text-3xl font-extrabold tracking-tight ${t.value}`}>{value}</span>
        <span className="text-xs text-slate-400 transition-colors group-hover:text-slate-600">{hint ?? "View"} →</span>
      </div>
    </Link>
  );
}
