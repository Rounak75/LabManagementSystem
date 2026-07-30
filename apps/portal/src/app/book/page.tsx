import { getServiceClient } from "@portal/lib/supabase-server";
import { BookingForm } from "./BookingForm";
import type { LabConfig, ClosureRow, CollectionTimeRestriction } from "@portal/lib/lab-status";
import { Band, Container } from "@portal/components/ui";
import { HomeVisit, Phone } from "@portal/components/icons";

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

function normRestriction(v: unknown): CollectionTimeRestriction {
  if (v === "FastingMorningOnly" || v === "MorningOnly" || v === "EveningOnly") return v;
  return null;
}

export default async function BookPage() {
  const sb = getServiceClient();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [{ data: tests }, { data: closures }, { data: settings }] = await Promise.all([
    sb
      .from("tests")
      .select("id, name, price, category, collection_time_restriction")
      .eq("is_active", true)
      .order("name"),
    sb
      .from("lab_closures")
      .select("date, reason")
      .gte("date", todayStart.toISOString()),
    sb
      .from("lab_settings")
      .select(
        "morning_open_time, morning_close_time, evening_open_time, evening_close_time, weekly_holidays, is_open_today, manual_closure_reason"
      )
      .eq("id", "singleton")
      .maybeSingle(),
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

  const blackoutDates = closureRows.map((c) => c.date.slice(0, 10));

  const mappedTests = (tests ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    price: Number(t.price),
    category: t.category,
    collectionTimeRestriction: normRestriction(t.collection_time_restriction),
  }));

  return (
    <>
      <Band waves className="pb-24 sm:pb-28">
        <Container className="pt-8">
          <span className="rise inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-band ring-1 ring-inset ring-white/20">
            <HomeVisit size={14} />
            Home collection
          </span>
          <h1
            className="rise mt-5 font-heading text-[30px] font-extrabold leading-[1.07] tracking-tighter text-band sm:text-[40px]"
            style={{ "--i": 1 } as React.CSSProperties}
          >
            We’ll come to you
          </h1>
          <p
            className="rise mt-4 max-w-prose text-[14.5px] leading-relaxed text-band/70"
            style={{ "--i": 2 } as React.CSSProperties}
          >
            Tell us where the phlebotomist should come and what tests you need.
            Staff will call to confirm your slot before anyone is dispatched.
          </p>
          <a
            href="tel:6202924306"
            className="rise tap mt-6 inline-flex items-center gap-2 rounded-full px-5 py-3 text-[13.5px] font-semibold text-band ring-1 ring-inset ring-white/25 hover:bg-white/10"
            style={{ "--i": 3 } as React.CSSProperties}
          >
            <Phone size={15} />
            Rather book by phone?
          </a>
        </Container>
      </Band>

      <Container className="-mt-8">
        <BookingForm
          tests={mappedTests}
          blackoutDates={blackoutDates}
          cfg={cfg}
          closures={closureRows}
        />
      </Container>
    </>
  );
}
