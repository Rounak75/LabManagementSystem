import Link from "next/link";

type Tone = "brand" | "amber" | "sky" | "emerald" | "slate";

const TONES: Record<Tone, { ring: string; value: string; icon: string }> = {
  brand: { ring: "[@media(hover:hover)_and_(pointer:fine)]:hover:border-brand/40 [@media(hover:hover)_and_(pointer:fine)]:hover:ring-brand/10", value: "text-brand-700", icon: "bg-brand-50 text-brand-600 [@media(hover:hover)_and_(pointer:fine)]:group-hover:bg-brand-100 [@media(hover:hover)_and_(pointer:fine)]:group-hover:text-brand-700" },
  amber: { ring: "[@media(hover:hover)_and_(pointer:fine)]:hover:border-amber-300 [@media(hover:hover)_and_(pointer:fine)]:hover:ring-amber-100", value: "text-amber-700", icon: "bg-amber-50 text-amber-600 [@media(hover:hover)_and_(pointer:fine)]:group-hover:bg-amber-100 [@media(hover:hover)_and_(pointer:fine)]:group-hover:text-amber-700" },
  sky: { ring: "[@media(hover:hover)_and_(pointer:fine)]:hover:border-sky-300 [@media(hover:hover)_and_(pointer:fine)]:hover:ring-sky-100", value: "text-sky-700", icon: "bg-sky-50 text-sky-600 [@media(hover:hover)_and_(pointer:fine)]:group-hover:bg-sky-100 [@media(hover:hover)_and_(pointer:fine)]:group-hover:text-sky-700" },
  emerald: { ring: "[@media(hover:hover)_and_(pointer:fine)]:hover:border-emerald-300 [@media(hover:hover)_and_(pointer:fine)]:hover:ring-emerald-100", value: "text-emerald-700", icon: "bg-emerald-50 text-emerald-600 [@media(hover:hover)_and_(pointer:fine)]:group-hover:bg-emerald-100 [@media(hover:hover)_and_(pointer:fine)]:group-hover:text-emerald-700" },
  slate: { ring: "[@media(hover:hover)_and_(pointer:fine)]:hover:border-slate-300 [@media(hover:hover)_and_(pointer:fine)]:hover:ring-slate-100", value: "text-slate-800", icon: "bg-slate-100 text-slate-600 [@media(hover:hover)_and_(pointer:fine)]:group-hover:bg-slate-200 [@media(hover:hover)_and_(pointer:fine)]:group-hover:text-slate-700" },
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
    // Every effect on this card was a hover effect, on a surface whose primary
    // user is holding a phone — so the dashboard's most choreographed component
    // gave a staff member no feedback whatsoever when tapped, and they tap twice.
    // `active:` is the state that actually fires for them.
    //
    // The lift and ring are additionally gated on a real pointer: a tap fires
    // `:hover` on most mobile browsers and then leaves it stuck, so the card
    // stays raised after the finger is gone. This is the same guard the patient
    // portal puts around `.lift`.
    <Link
      href={href}
      className={`card group relative flex flex-col gap-4 p-5 overflow-hidden transition-all duration-300 active:scale-[.99] active:bg-slate-50 [@media(hover:hover)_and_(pointer:fine)]:hover:shadow-lg [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-0.5 [@media(hover:hover)_and_(pointer:fine)]:hover:ring-4 ${t.ring} ${
        urgent ? "ring-2 ring-amber-300 border-amber-200 shadow-sm" : ""
      }`}
    >
      {/* Background decoration */}
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br from-slate-50 to-transparent opacity-50 transition-transform duration-500 ease-out [@media(hover:hover)_and_(pointer:fine)]:group-hover:scale-150" />
      
      <div className="relative flex items-center justify-between z-10">
        <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
        {icon && (
          <span className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors duration-300 ${t.icon}`}>
            {icon}
          </span>
        )}
      </div>
      
      <div className="relative flex items-end justify-between mt-2 z-10">
        <span className={`text-4xl font-black tracking-tight ${t.value}`}>{value}</span>
        <span className="flex items-center gap-1 text-xs font-semibold text-slate-600 transition-all duration-300 [@media(hover:hover)_and_(pointer:fine)]:group-hover:text-slate-700 [@media(hover:hover)_and_(pointer:fine)]:group-hover:translate-x-1">
          {hint ?? "View"} 
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </span>
      </div>
    </Link>
  );
}
