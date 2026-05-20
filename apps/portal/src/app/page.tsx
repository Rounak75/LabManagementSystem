import Link from "next/link";
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

interface FeaturedTest {
  id: string;
  name: string;
  price: number;
  category: string | null;
}

const POPULAR_TEST_NAMES = [
  "CBC", "Complete Blood Count", "Lipid Profile", "HbA1c",
  "Thyroid Profile", "TSH", "Liver Function Test", "LFT",
  "Kidney Function Test", "KFT", "Blood Sugar", "Fasting Blood Sugar",
  "Urine Routine", "Widal", "Dengue", "Vitamin D", "Vitamin B12",
];

function pickPopular(rows: FeaturedTest[], n: number): FeaturedTest[] {
  const wanted = new Set(POPULAR_TEST_NAMES.map((s) => s.toLowerCase()));
  const matched: FeaturedTest[] = [];
  const others: FeaturedTest[] = [];
  for (const r of rows) {
    if (wanted.has(r.name.toLowerCase())) matched.push(r);
    else others.push(r);
  }
  return [...matched, ...others].slice(0, n);
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

  const status = cfg ? isOpenNow(cfg, closureRows) : { open: true, reason: null };

  const tests: FeaturedTest[] = (allTests ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    price: Number(t.price),
    category: t.category ?? null,
  }));
  const featured = pickPopular(tests, 8);

  return (
    <div className="space-y-12">
      {/* ─── Hero ──────────────────────────────────────────────────────── */}
      <section className="pt-2">
        <div className="flex items-center gap-2 mb-5">
          <span
            className={`relative inline-block h-2 w-2 rounded-full dot-pulse ${
              status.open ? "bg-ok text-ok" : "bg-notice text-notice"
            }`}
          />
          <span className={`text-[12.5px] font-medium ${status.open ? "text-ok" : "text-notice"}`}>
            {status.open ? "We're open right now" : "Currently closed"}
          </span>
          {status.reason && (
            <span className="text-[12px] text-muted">· {status.reason}</span>
          )}
        </div>

        <h1 className="font-heading text-[36px] sm:text-[48px] leading-[1.04] tracking-tighter text-text font-bold">
          Your reports, ready when&nbsp;you are.
        </h1>
        <p className="mt-5 text-[15.5px] text-soft max-w-prose leading-relaxed">
          Golmuri Janch Ghar has been the neighbourhood diagnostic lab for over
          a decade. Pull up any report on your phone, pay a pending bill by UPI,
          or ask us to come collect a sample at home.
        </p>

        <div className="mt-7 flex flex-wrap gap-2.5">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-lg bg-brand text-brand-fg px-4 py-2.5 text-[14px] font-semibold tap hover:opacity-90"
          >
            View my reports
            <Arrow />
          </Link>
          <Link
            href="/book"
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-elev text-text px-4 py-2.5 text-[14px] font-medium tap hover:border-muted"
          >
            Book home collection
          </Link>
          <a
            href="tel:6202924306"
            className="inline-flex items-center gap-2 rounded-lg text-soft px-4 py-2.5 text-[14px] font-medium tap hover:text-text"
          >
            <PhoneIcon /> Call the lab
          </a>
        </div>

        <p className="mt-5 text-[12.5px] text-muted">
          Sign in with your phone number and the 6-character code printed at the
          bottom of your receipt.
        </p>
      </section>

      {/* ─── Three things ───────────────────────────────────────────────── */}
      <section className="grid sm:grid-cols-3 gap-3">
        <Card
          href="/login"
          title="View &amp; download reports"
          body="See past test results, mark notes, and download a copy as PDF. The same render the lab prints in-house."
        />
        <Card
          href="/book"
          title="Have us collect at home"
          body="No need to visit the lab — a phlebotomist comes to your address. We confirm by phone first."
        />
        <Card
          href="/login?next=/invoices"
          title="Pay by UPI"
          body="Outstanding bills open a UPI app with the exact amount filled in. Cash and online both accepted."
        />
      </section>

      {/* ─── Popular tests ──────────────────────────────────────────────── */}
      {featured.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[19px] text-text font-heading font-semibold">
              Frequently requested tests
            </h2>
            <Link
              href="/tests"
              className="text-[13px] text-brand hover:underline inline-flex items-center gap-1"
            >
              See all
              <Arrow small />
            </Link>
          </div>
          <ul className="rounded-xl border border-line bg-elev overflow-hidden divide-y divide-line">
            {featured.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-4 px-4 py-3 text-[14px] hover:bg-surface tap"
              >
                <div className="min-w-0">
                  <p className="text-text truncate">{t.name}</p>
                </div>
                {t.category && (
                  <p className="text-[12px] text-muted shrink-0">{t.category}</p>
                )}
              </li>
            ))}
          </ul>
          <p className="text-[12.5px] text-muted">
            {testCount ?? tests.length} tests offered in total. Need something else?{" "}
            <a href="tel:6202924306" className="text-brand hover:underline">
              Call the lab
            </a>
            .
          </p>
        </section>
      )}

      {/* ─── Upcoming closures ─────────────────────────────────────────── */}
      {closureRows.length > 0 && (
        <section className="rounded-xl border border-notice/30 bg-notice-soft p-5">
          <div className="flex items-start gap-3">
            <span className="mt-1.5 inline-block h-1.5 w-1.5 rounded-full bg-notice shrink-0" />
            <div className="flex-1">
              <p className="text-[14px] text-text font-medium">
                Upcoming closures
              </p>
              <ul className="mt-2 space-y-1 text-[13px] text-soft">
                {closureRows.map((c, i) => (
                  <li key={i} className="flex gap-3 num">
                    <span className="font-mono text-text shrink-0 w-28">
                      {new Date(c.date).toLocaleDateString("en-IN", {
                        weekday: "short",
                        day: "2-digit",
                        month: "short",
                      })}
                    </span>
                    <span>{c.reason ?? "Closed"}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* ─── Find us ───────────────────────────────────────────────────── */}
      <section className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted pt-1">
        <span>{settings?.lab_address ?? "Main Road, Golmuri Chowk, Jamshedpur"}</span>
        {settings?.lab_address && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(settings.lab_address)}`}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1 text-brand hover:underline"
          >
            Open in Maps
            <Arrow small />
          </a>
        )}
        <Link href="/info" className="text-brand hover:underline inline-flex items-center gap-1">
          Hours &amp; full details
          <Arrow small />
        </Link>
      </section>
    </div>
  );
}

/* ─────────────────────────── components ──────────────────────────── */

function Card({
  href,
  title,
  body,
}: {
  href: string;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-xl border border-line bg-elev p-5 tap hover:border-muted hover:-translate-y-0.5"
    >
      <p
        className="font-heading text-[16px] text-text font-semibold leading-snug"
        dangerouslySetInnerHTML={{ __html: title }}
      />
      <p className="text-[13px] text-soft mt-2 leading-relaxed">{body}</p>
      <span className="inline-flex items-center gap-1 mt-3 text-[12.5px] text-brand">
        Open
        <Arrow small />
      </span>
    </Link>
  );
}

function Arrow({ small = false }: { small?: boolean }) {
  return (
    <svg
      width={small ? 12 : 14}
      height={small ? 12 : 14}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}
