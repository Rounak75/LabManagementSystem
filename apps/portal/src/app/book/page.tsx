import { getServiceClient } from "@portal/lib/supabase-server";
import { BookingForm } from "./BookingForm";
import type { LabConfig, ClosureRow, CollectionTimeRestriction } from "@portal/lib/lab-status";

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
    <div className="pt-2 pb-10">
      <h1 className="text-[28px] sm:text-[34px] font-heading font-bold tracking-tighter text-text leading-[1.1]">
        Book a home sample collection
      </h1>
      <p className="text-[14px] text-soft mt-3 leading-relaxed max-w-prose">
        Tell us where you'd like the phlebotomist to come and what tests you need.
        Staff will call to confirm your slot before a phlebotomist is dispatched.
      </p>
      <BookingForm
        tests={mappedTests}
        blackoutDates={blackoutDates}
        cfg={cfg}
        closures={closureRows}
      />
    </div>
  );
}
