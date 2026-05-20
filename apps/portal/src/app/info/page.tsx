import { getServiceClient } from "@portal/lib/supabase-server";
import { isOpenNow, type LabConfig, type ClosureRow } from "@portal/lib/lab-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseWeeklyHolidays(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export default async function InfoPage() {
  const sb = getServiceClient();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [{ data: settings }, { data: closures }] = await Promise.all([
    sb
      .from("lab_settings")
      .select(
        "lab_name, lab_address, lab_phone, lab_email, morning_open_time, morning_close_time, evening_open_time, evening_close_time, weekly_holidays, is_open_today, manual_closure_reason"
      )
      .eq("id", "singleton")
      .maybeSingle(),
    sb
      .from("lab_closures")
      .select("date, reason")
      .gte("date", today.toISOString())
      .order("date", { ascending: true }),
  ]);

  if (!settings) {
    return (
      <div className="mt-6 text-center text-muted">
        Lab information unavailable right now. Please try again in a moment.
      </div>
    );
  }

  const cfg: LabConfig = {
    morningOpenTime: settings.morning_open_time ?? "08:00",
    morningCloseTime: settings.morning_close_time ?? "13:00",
    eveningOpenTime: settings.evening_open_time ?? null,
    eveningCloseTime: settings.evening_close_time ?? null,
    weeklyHolidays: parseWeeklyHolidays(settings.weekly_holidays),
    isOpenToday: settings.is_open_today ?? true,
    manualClosureReason: settings.manual_closure_reason ?? null,
  };

  const closureRows: ClosureRow[] = (closures ?? []).map((c) => ({
    date: String(c.date),
    reason: c.reason ?? null,
  }));

  const status = isOpenNow(cfg, closureRows);
  const mapsHref = settings.lab_address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(settings.lab_address)}`
    : null;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-[32px] sm:text-[40px] font-heading font-bold tracking-tighter text-text leading-[1.05]">
          {settings.lab_name}
        </h1>
        <p className="text-[14.5px] text-soft">
          Diagnostic laboratory · Jamshedpur
        </p>
      </header>

      <div
        className={`rounded-xl border p-4 flex items-center gap-3 ${
          status.open ? "border-ok/30 bg-ok-soft" : "border-notice/30 bg-notice-soft"
        }`}
      >
        <span
          className={`relative inline-block h-2.5 w-2.5 rounded-full dot-pulse ${
            status.open ? "bg-ok text-ok" : "bg-notice text-notice"
          }`}
        />
        <div className="flex-1">
          <p
            className={`text-[14.5px] font-medium ${
              status.open ? "text-ok" : "text-notice"
            }`}
          >
            {status.open ? "Open right now" : "Closed right now"}
          </p>
          {status.reason && (
            <p className="text-[12.5px] text-muted mt-0.5">{status.reason}</p>
          )}
        </div>
      </div>

      <section className="grid sm:grid-cols-2 gap-px bg-line border border-line rounded-xl overflow-hidden">
        <div className="bg-elev p-5">
          <p className="text-muted text-[12px] mb-2">Address</p>
          {settings.lab_address && (
            <p className="text-[14.5px] text-text leading-relaxed">
              {settings.lab_address}
            </p>
          )}
          {mapsHref && (
            <a
              href={mapsHref}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 mt-3 text-[13px] text-brand hover:underline"
            >
              Open in Google Maps
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </a>
          )}
        </div>
        <div className="bg-elev p-5">
          <p className="text-muted text-[12px] mb-2">Reach us</p>
          {settings.lab_phone && (
            <a
              href={`tel:${settings.lab_phone}`}
              className="font-mono text-[18px] text-text num hover:text-brand block"
            >
              +91 {settings.lab_phone.replace(/(\d{4})(\d{3})(\d{3})/, "$1 $2 $3")}
            </a>
          )}
          {settings.lab_email && (
            <a
              href={`mailto:${settings.lab_email}`}
              className="text-[13.5px] text-soft hover:text-brand mt-2 block"
            >
              {settings.lab_email}
            </a>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-line bg-elev overflow-hidden">
        <div className="px-5 py-3 border-b border-line">
          <p className="text-muted text-[12px]">Hours</p>
        </div>
        <dl className="divide-y divide-line text-[14px]">
          <Row label="Morning" value={`${cfg.morningOpenTime} – ${cfg.morningCloseTime}`} />
          {cfg.eveningOpenTime && cfg.eveningCloseTime && (
            <Row label="Evening" value={`${cfg.eveningOpenTime} – ${cfg.eveningCloseTime}`} />
          )}
          {cfg.weeklyHolidays.length > 0 && (
            <Row label="Closed" value={cfg.weeklyHolidays.join(", ")} />
          )}
        </dl>
      </section>

      {closureRows.length > 0 && (
        <section className="rounded-xl border border-notice/25 bg-notice-soft p-5">
          <p className="text-notice text-[12px] mb-3">Upcoming closures</p>
          <ul className="space-y-1.5 text-[13.5px]">
            {closureRows.slice(0, 8).map((c, i) => (
              <li key={i} className="flex gap-4 num">
                <span className="font-mono text-text w-28 shrink-0">
                  {new Date(c.date).toLocaleDateString("en-IN", {
                    weekday: "short",
                    day: "2-digit",
                    month: "short",
                  })}
                </span>
                {c.reason && <span className="text-soft">{c.reason}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[100px_1fr] px-5 py-3">
      <dt className="text-muted">{label}</dt>
      <dd className="font-mono text-text num">{value}</dd>
    </div>
  );
}
