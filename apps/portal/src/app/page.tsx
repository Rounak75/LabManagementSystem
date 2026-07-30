import Link from "next/link";
import { getServiceClient } from "@portal/lib/supabase-server";
import { isOpenNow, type LabConfig, type ClosureRow } from "@portal/lib/lab-status";
import {
  Band,
  BandCard,
  Card,
  Container,
  Fact,
  IconChip,
  Note,
  SectionHead,
  StatusDot,
  btnOnBand,
} from "@portal/components/ui";
import { CategoryIcon } from "@portal/components/category-icon";
import { pickPopular } from "@portal/components/popular-tests";
import {
  ArrowRight,
  Calendar,
  Clock,
  HomeVisit,
  MapPin,
  Phone,
  Report,
  Search,
  Vial,
  Wallet,
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

interface FeaturedTest {
  id: string;
  name: string;
  price: number;
  category: string | null;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export default async function Landing() {
  const sb = getServiceClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [{ data: settings }, { data: closures }, { data: allTests, count: testCount }] =
    await Promise.all([
      sb
        .from("lab_settings")
        .select(
          "lab_name, lab_address, lab_phone, morning_open_time, morning_close_time, evening_open_time, evening_close_time, weekly_holidays, is_open_today, manual_closure_reason"
        )
        .eq("id", "singleton")
        .maybeSingle(),
      sb
        .from("lab_closures")
        .select("date, reason")
        .gte("date", today.toISOString())
        .order("date", { ascending: true })
        .limit(3),
      sb
        .from("tests")
        .select("id, name, price, category", { count: "exact" })
        .eq("is_active", true)
        .order("name"),
    ]);

  const cfg: LabConfig | null = settings
    ? {
        morningOpenTime: settings.morning_open_time ?? "08:00",
        morningCloseTime: settings.morning_close_time ?? "13:00",
        eveningOpenTime: settings.evening_open_time ?? null,
        eveningCloseTime: settings.evening_close_time ?? null,
        weeklyHolidays: parseWeeklyHolidays(settings.weekly_holidays),
        isOpenToday: settings.is_open_today ?? true,
        manualClosureReason: settings.manual_closure_reason ?? null,
      }
    : null;

  const closureRows: ClosureRow[] = (closures ?? []).map((c) => ({
    date: String(c.date),
    reason: c.reason ?? null,
  }));

  // When settings haven't loaded we don't actually know the hours — never claim
  // we're open. Show nothing rather than a misleading "open right now".
  const status = cfg ? isOpenNow(cfg, closureRows) : null;

  const tests: FeaturedTest[] = (allTests ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    price: Number(t.price),
    category: t.category ?? null,
  }));
  const featured = pickPopular(tests, 8);

  // Categories are derived from the catalogue we already fetched, so the grid
  // never drifts from what /tests actually lists.
  const categoryCounts = new Map<string, number>();
  for (const t of tests) {
    const c = t.category ?? "Other";
    categoryCounts.set(c, (categoryCounts.get(c) ?? 0) + 1);
  }
  const categories = [...categoryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const nextClosure = closureRows[0];

  return (
    <>
      {/* ─── Hero band ────────────────────────────────────────────────── */}
      <Band waves className="pb-14">
        <Container className="pt-8">
          {status && (
            <div className="rise flex items-center gap-2.5">
              <StatusDot tone={status.open ? "ok" : "notice"} />
              <span className="text-[12.5px] font-semibold text-band">
                {status.open ? "We’re open right now" : "Currently closed"}
              </span>
              {status.reason && (
                <span className="text-[12px] text-band/60">· {status.reason}</span>
              )}
            </div>
          )}

          <h1
            className="rise mt-5 font-heading text-[32px] font-extrabold leading-[1.06] tracking-tighter text-band sm:text-[44px] lg:text-[52px]"
            style={{ "--i": 1 } as React.CSSProperties}
          >
            Your reports,
            <br />
            ready when you are.
          </h1>

          <p
            className="rise mt-4 max-w-prose text-[15px] leading-relaxed text-band/70"
            style={{ "--i": 2 } as React.CSSProperties}
          >
            Golmuri Janch Ghar has run diagnostics in Jamshedpur for over a
            decade. Read your reports, settle bills by UPI, and request home
            sample collection — all from your phone.
          </p>

          <div
            className="rise mt-7 flex flex-wrap items-center gap-2.5"
            style={{ "--i": 3 } as React.CSSProperties}
          >
            <Link href="/login" className={`${btnOnBand} px-5 py-3`}>
              View my reports
              <ArrowRight size={15} />
            </Link>
            <Link
              href="/book"
              className="tap inline-flex items-center gap-2 rounded-full px-5 py-3 text-[13.5px] font-semibold text-band ring-1 ring-inset ring-white/25 hover:bg-white/10"
            >
              Book home collection
            </Link>
            <a
              href="tel:6202924306"
              className="tap inline-flex items-center gap-2 rounded-full px-4 py-3 text-[13.5px] font-medium text-band/70 hover:text-band"
            >
              <Phone size={15} />
              Call the lab
            </a>
          </div>

          {/* Today at a glance — the card that sits inside the band. */}
          {cfg && (
            <BandCard className="rise mt-8">
              <div className="rounded-[20px] bg-elev px-5 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <IconChip size="sm">
                      <Clock size={17} />
                    </IconChip>
                    <div>
                      <p className="text-[11.5px] font-medium uppercase tracking-[0.08em] text-muted">
                        Today
                      </p>
                      <p className="mt-0.5 font-mono num text-[14px] font-medium text-text">
                        {cfg.morningOpenTime}–{cfg.morningCloseTime}
                        {cfg.eveningOpenTime && cfg.eveningCloseTime && (
                          <> · {cfg.eveningOpenTime}–{cfg.eveningCloseTime}</>
                        )}
                      </p>
                    </div>
                  </div>
                  <Link
                    href="/info"
                    className="tap inline-flex items-center gap-1 rounded-full bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-brand"
                  >
                    Details
                    <ArrowRight size={13} />
                  </Link>
                </div>
              </div>
            </BandCard>
          )}
        </Container>
      </Band>

      <Container className="space-y-10">
        {/* ─── Catalogue search ──────────────────────────────────────── */}
        <Link
          href="/tests"
          className="tap lift -mt-6 flex items-center gap-3 rounded-full border border-line bg-elev px-5 py-4 shadow-card hover:border-brand/40"
        >
          <Search size={19} className="shrink-0 text-muted" />
          <span className="min-w-0 flex-1 truncate text-[14.5px] text-muted">
            Search {testCount ?? tests.length} tests — try “thyroid” or “CBC”
          </span>
          <ArrowRight size={16} className="shrink-0 text-brand" />
        </Link>

        {/* ─── Next closure ──────────────────────────────────────────── */}
        {nextClosure && (
          <div className="band flex items-center justify-between gap-4 rounded-2xl px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <Calendar size={17} className="shrink-0 text-band/70" />
              <p className="truncate text-[13.5px] font-medium text-band">
                {nextClosure.reason ?? "Lab closed"}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-white/15 px-3 py-1.5 font-mono num text-[12px] font-medium text-band">
              {new Date(nextClosure.date).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
              })}
            </span>
          </div>
        )}

        {/* ─── Quick actions ─────────────────────────────────────────── */}
        <nav aria-label="Quick actions">
          <ul className="grid grid-cols-5 gap-0.5 sm:gap-1">
            {[
              { href: "/login", label: "Reports", icon: <Report size={21} /> },
              { href: "/book", label: "Home visit", icon: <HomeVisit size={21} /> },
              { href: "/tests", label: "Tests", icon: <Vial size={21} /> },
              { href: "/login?next=/invoices", label: "Pay bill", icon: <Wallet size={21} /> },
              { href: "/info", label: "Lab info", icon: <MapPin size={21} /> },
            ].map((a, i) => (
              <QuickAction key={a.href} {...a} index={i} />
            ))}
          </ul>
        </nav>

        {/* ─── Categories ────────────────────────────────────────────── */}
        {categories.length > 0 && (
          <section>
            <SectionHead title="What we test for" href="/tests" />
            <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {categories.map(([name, count], i) => (
                <li
                  key={name}
                  className="rise"
                  style={{ "--i": i + 2 } as React.CSSProperties}
                >
                  <Link
                    href={`/tests#${slug(name)}`}
                    className="tap group glass sheen relative flex h-full items-center gap-3 overflow-hidden rounded-2xl p-3 sm:flex-col sm:gap-2 sm:p-4 sm:text-center"
                  >
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand transition-all duration-300 ease-out-fluid group-hover:scale-105 group-hover:bg-brand group-hover:text-brand-fg sm:h-12 sm:w-12">
                      <CategoryIcon category={name} size={21} />
                    </span>
                    <span className="min-w-0 flex-1 sm:flex-none">
                      <span className="block truncate text-[12px] font-medium leading-tight text-text sm:text-[11.5px]">
                        {name}
                      </span>
                      <span className="mt-0.5 block font-mono num text-[10.5px] text-muted">
                        {count} tests
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ─── What you can do here ──────────────────────────────────── */}
        <section>
          <SectionHead title="What you can do here" />
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                href: "/login",
                icon: <Report size={20} />,
                title: "Read & download reports",
                body: "Past results, with a PDF that matches what the lab prints in-house.",
              },
              {
                href: "/book",
                icon: <HomeVisit size={20} />,
                title: "Have us collect at home",
                body: "A phlebotomist comes to your address. We confirm by phone first.",
              },
              {
                href: "/login?next=/invoices",
                icon: <Wallet size={20} />,
                title: "Pay by UPI",
                body: "Bills open your UPI app with the exact amount already filled in.",
              },
            ].map((c, i) => (
              <ActionCard key={c.href} {...c} index={i} />
            ))}
          </div>
        </section>

        {/* ─── Popular tests ─────────────────────────────────────────── */}
        {featured.length > 0 && (
          <section>
            <SectionHead title="Frequently requested" href="/tests" />
            <Card className="overflow-hidden">
              <ul className="divide-y divide-line">
                {featured.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-4 px-5 py-3.5"
                  >
                    <p className="min-w-0 truncate text-[14px] text-text">{t.name}</p>
                    {t.category && (
                      <p className="shrink-0 text-[11.5px] text-muted">{t.category}</p>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
            <p className="mt-3 px-1 text-[12.5px] text-muted">
              {testCount ?? tests.length} tests offered in total. Need something
              else?{" "}
              <a href="tel:6202924306" className="font-medium text-brand hover:underline">
                Call the lab
              </a>
              .
            </p>
          </section>
        )}

        {/* ─── Sign-in hint ──────────────────────────────────────────── */}
        <Note>
          Sign in with your phone number and the 6-character code printed at the
          bottom of your receipt. No code to hand?{" "}
          <a href="tel:6202924306" className="font-medium text-brand hover:underline">
            Call the lab
          </a>{" "}
          and staff can read it out after confirming who you are.
        </Note>

        {/* ─── Find us ───────────────────────────────────────────────── */}
        <Card className="p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <Fact
              label="Find us"
              value={
                <span className="text-[14px] font-medium leading-relaxed">
                  {settings?.lab_address ?? "Main Road, Golmuri Chowk, Jamshedpur"}
                </span>
              }
            />
            {settings?.lab_address && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(settings.lab_address)}`}
                target="_blank"
                rel="noopener"
                className="tap inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-4 py-2 text-[13px] font-semibold text-brand"
              >
                <MapPin size={14} />
                Open in Maps
              </a>
            )}
          </div>
        </Card>
      </Container>
    </>
  );
}

/* ─────────────────────────── components ──────────────────────────── */

function QuickAction({
  href,
  label,
  icon,
  index,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  index: number;
}) {
  return (
    <li className="rise" style={{ "--i": index + 4 } as React.CSSProperties}>
      <Link
        href={href}
        className="tap group glass sheen relative flex min-h-[86px] flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl px-1 py-3.5"
      >
        <span className="text-brand transition-transform duration-300 ease-out-fluid group-hover:-translate-y-0.5 group-hover:scale-110">
          {icon}
        </span>
        <span className="text-center text-[10.5px] font-medium leading-tight text-soft sm:text-[11px]">
          {label}
        </span>
      </Link>
    </li>
  );
}

function ActionCard({
  href,
  icon,
  title,
  body,
  index,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  index: number;
}) {
  return (
    <Link
      href={href}
      style={{ "--i": index + 1 } as React.CSSProperties}
      className="tap rise group glass sheen relative block overflow-hidden rounded-3xl p-5"
    >
      <IconChip>{icon}</IconChip>
      <p className="mt-4 font-heading text-[15px] font-bold leading-snug tracking-snug text-text">
        {title}
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{body}</p>
      <span className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand">
        Open
        <ArrowRight
          size={13}
          className="transition-transform duration-200 ease-out-fluid group-hover:translate-x-0.5"
        />
      </span>
    </Link>
  );
}
