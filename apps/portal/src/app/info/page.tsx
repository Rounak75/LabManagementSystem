import { getServiceClient } from "@portal/lib/supabase-server";
import { isOpenNow, type LabConfig, type ClosureRow } from "@portal/lib/lab-status";
import { hourRange, labDate } from "@portal/lib/format";
import { labMapsHref } from "@portal/lib/lab-location";
import {
  Band,
  BandCard,
  Card,
  Container,
  IconChip,
  Note,
  SectionHead,
  StatusDot,
} from "@portal/components/ui";
import {
  ArrowRight,
  Calendar,
  Clock,
  MapPin,
  Phone,
} from "@portal/components/icons";

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
      <Container className="pt-10">
        <Note tone="notice">
          Lab information is unavailable right now. Please try again in a moment.
        </Note>
      </Container>
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
  const mapsHref = labMapsHref();

  return (
    <>
      <Band waves className="pb-14">
        {/* Centred: this band is a nameplate, not a pitch — three short lines
            with nothing to their right, which reads as unbalanced ranged left. */}
        <Container className="pt-8 text-center">
          <p className="rise text-[12px] font-semibold uppercase tracking-[0.18em] text-band/60">
            Lab information
          </p>
          <h1
            className="rise mt-3 font-heading text-[32px] font-extrabold leading-[1.06] tracking-tighter text-band sm:text-[40px]"
            style={{ "--i": 1 } as React.CSSProperties}
          >
            {settings.lab_name}
          </h1>
          <p
            className="rise mt-3 text-[14.5px] text-band/70"
            style={{ "--i": 2 } as React.CSSProperties}
          >
            Diagnostic laboratory · Jamshedpur
          </p>

          {/* Live status — the card that sits inside the band. Held to a
              readable width so it stays under the centred nameplate, but its
              own contents stay ranged left where a row belongs. */}
          <BandCard className="rise mx-auto mt-7 max-w-xl text-left">
            <div className="flex items-center gap-4 rounded-[20px] bg-elev px-5 py-4">
              <StatusDot tone={status.open ? "ok" : "notice"} />
              <div className="min-w-0 flex-1">
                <p
                  className={`text-[14.5px] font-bold ${
                    status.open ? "text-ok" : "text-notice"
                  }`}
                >
                  {status.open ? "Open right now" : "Closed right now"}
                </p>
                {status.reason && (
                  <p className="mt-0.5 truncate text-[12.5px] text-muted">
                    {status.reason}
                  </p>
                )}
              </div>
              {settings.lab_phone && (
                <a
                  href={`tel:${settings.lab_phone}`}
                  aria-label="Call the lab"
                  className="tap inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-brand-fg hover:bg-brand-hover"
                >
                  <Phone size={17} />
                </a>
              )}
            </div>
          </BandCard>
        </Container>
      </Band>

      <Container className="-mt-6 space-y-8">
        {/* ─── Address & contact ─────────────────────────────────────── */}
        <section className="grid gap-3 sm:grid-cols-2">
          <Card className="p-5">
            <IconChip>
              <MapPin size={20} />
            </IconChip>
            <p className="mt-4 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted">
              Address
            </p>
            {settings.lab_address && (
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-text">
                {settings.lab_address}
              </p>
            )}
            <a
                href={mapsHref}
                target="_blank"
                rel="noopener"
                className="tap mt-4 inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-4 py-2 text-[13px] font-semibold text-brand"
              >
                Open in Google Maps
                <ArrowRight size={13} />
              </a>
          </Card>

          <Card className="p-5">
            <IconChip>
              <Phone size={20} />
            </IconChip>
            <p className="mt-4 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted">
              Reach us
            </p>
            {settings.lab_phone && (
              <a
                href={`tel:${settings.lab_phone}`}
                className="tap mt-1.5 block font-mono num text-[19px] font-medium text-text hover:text-brand"
              >
                +91 {settings.lab_phone.replace(/(\d{4})(\d{3})(\d{3})/, "$1 $2 $3")}
              </a>
            )}
            {settings.lab_email && (
              <a
                href={`mailto:${settings.lab_email}`}
                className="tap mt-2 block break-all text-[13.5px] text-soft hover:text-brand"
              >
                {settings.lab_email}
              </a>
            )}
          </Card>
        </section>

        {/* ─── Hours ─────────────────────────────────────────────────── */}
        <section>
          <SectionHead title="Opening hours" />
          <Card className="overflow-hidden">
            <dl className="divide-y divide-line">
              <Row
                icon={<Clock size={17} />}
                label="Morning"
                value={hourRange(cfg.morningOpenTime, cfg.morningCloseTime)}
              />
              {cfg.eveningOpenTime && cfg.eveningCloseTime && (
                <Row
                  icon={<Clock size={17} />}
                  label="Evening"
                  value={hourRange(cfg.eveningOpenTime, cfg.eveningCloseTime)}
                />
              )}
              {cfg.weeklyHolidays.length > 0 && (
                <Row
                  icon={<Calendar size={17} />}
                  label="Closed"
                  value={cfg.weeklyHolidays.join(", ")}
                  mono={false}
                />
              )}
            </dl>
          </Card>
        </section>

        {/* ─── Upcoming closures ─────────────────────────────────────── */}
        {closureRows.length > 0 && (
          <section>
            <SectionHead title="Upcoming closures" />
            <Card className="overflow-hidden">
              <ul className="divide-y divide-line">
                {closureRows.slice(0, 8).map((c, i) => (
                  <li key={i} className="flex items-center gap-4 px-5 py-3.5">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-notice-soft text-notice">
                      <Calendar size={16} />
                    </span>
                    <span className="w-28 shrink-0 font-mono num text-[13px] font-medium text-text">
                      {labDate(c.date, { weekday: true })}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13.5px] text-soft">
                      {c.reason ?? "Closed"}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        )}
      </Container>
    </>
  );
}

function Row({
  icon,
  label,
  value,
  mono = true,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
        {icon}
      </span>
      <dt className="flex-1 text-[14px] text-soft">{label}</dt>
      <dd
        className={`text-[14px] font-medium text-text ${mono ? "font-mono num" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
