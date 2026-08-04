// Phase 3d Plan H — shared open/closed + slot-availability logic for /book and /info.
// One source of truth so both pages agree on what the lab is doing right now.

import { to12Hour } from "./format";

export type Slot = "Morning" | "Afternoon" | "Evening";

export interface LabConfig {
  morningOpenTime: string;     // "HH:mm"
  morningCloseTime: string;
  eveningOpenTime: string | null;
  eveningCloseTime: string | null;
  weeklyHolidays: string[];    // e.g. ["Sunday-Evening"] or ["Sunday"]
  isOpenToday: boolean;
  manualClosureReason: string | null;
}

// Whole-day closure row (mirrors LabClosure → lab_closures).
export interface ClosureRow {
  date: string; // ISO, normalised to UTC midnight on the desktop
  reason?: string | null;
}

export type CollectionTimeRestriction =
  | null
  | "FastingMorningOnly"
  | "MorningOnly"
  | "EveningOnly";

export interface TestRestriction {
  id: string;
  collectionTimeRestriction: CollectionTimeRestriction;
}

const ALL_SLOTS: readonly Slot[] = ["Morning", "Afternoon", "Evening"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * The wall-clock window each slot covers, in IST.
 *
 * `slotLabel` reads from here rather than carrying its own copy of the hours.
 * The label is what the patient books against, so a slot shown as ending at
 * 7:00 PM has to be the same 7:00 PM that decides whether it has already gone.
 */
const SLOT_WINDOWS: Record<Slot, { start: string; end: string }> = {
  Morning: { start: "08:00", end: "11:00" },
  Afternoon: { start: "12:00", end: "15:00" },
  Evening: { start: "16:00", end: "19:00" },
};

// The lab is in Jamshedpur (IST, UTC+5:30, no DST). Server time is UTC on Vercel,
// so reading getHours()/getDay() directly would compute "open now" against the
// wrong wall clock. Shift the instant by the IST offset and read UTC parts to get
// India wall-clock time regardless of where the server runs.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
function toIST(d: Date): Date {
  return new Date(d.getTime() + IST_OFFSET_MS);
}

function hhmmToMinutes(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * UTC-midnight instant of the lab's current calendar day.
 *
 * Booking dates arrive as YYYY-MM-DD and parse to UTC midnight, so "is this
 * date today?" has to be asked in the same frame. Comparing against the
 * server's own date would answer for UTC, and between 18:30 and 24:00 UTC the
 * lab is already on the next day — the window in which an evening booking is
 * most likely to be made.
 */
function istStartOfDay(now: Date): number {
  const ist = toIST(now);
  return Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
}

/** Minutes since midnight on the lab's wall clock. */
function istMinutesOfDay(now: Date): number {
  const ist = toIST(now);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

/** The requested day, as a UTC-midnight instant, however it was constructed. */
function startOfDayUTC(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * True when `slot` on `date` is a time that has already gone.
 *
 * Only same-day bookings can be late; earlier dates are refused outright by the
 * booking route's past-date guard, and later ones are always ahead of now.
 */
export function slotHasPassed(slot: Slot, date: Date, now: Date = new Date()): boolean {
  if (startOfDayUTC(date) !== istStartOfDay(now)) return false;
  return istMinutesOfDay(now) >= hhmmToMinutes(SLOT_WINDOWS[slot].end);
}

function dayLabel(d: Date): string {
  return DAYS[d.getDay()] ?? "";
}

function sameYMDUTC(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear()
    && a.getUTCMonth() === b.getUTCMonth()
    && a.getUTCDate() === b.getUTCDate();
}

function sameYMD(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function isClosedByWholeDayClosure(closures: ClosureRow[], date: Date): boolean {
  for (const c of closures) {
    const d = new Date(c.date);
    if (sameYMD(d, date)) return true;
  }
  return false;
}

export function isOpenNow(
  cfg: LabConfig,
  closures: ClosureRow[],
  now: Date = new Date()
): { open: boolean; reason: string | null } {
  const ist = toIST(now);

  if (!cfg.isOpenToday) {
    return { open: false, reason: cfg.manualClosureReason ?? "Lab is closed today" };
  }

  // Closure dates are stored at UTC midnight for the intended calendar day, and
  // `ist` now carries the IST calendar day in its UTC fields — so compare in UTC.
  if (closures.some((c) => sameYMDUTC(new Date(c.date), ist))) {
    return { open: false, reason: "Lab is closed today" };
  }

  const today = DAYS[ist.getUTCDay()] ?? "";
  if (cfg.weeklyHolidays.includes(today)) {
    return { open: false, reason: `Closed every ${today}` };
  }

  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const mOpen = hhmmToMinutes(cfg.morningOpenTime);
  const mClose = hhmmToMinutes(cfg.morningCloseTime);
  const hasEvening = !!(cfg.eveningOpenTime && cfg.eveningCloseTime);
  const eOpen = hasEvening ? hhmmToMinutes(cfg.eveningOpenTime!) : null;
  const eClose = hasEvening ? hhmmToMinutes(cfg.eveningCloseTime!) : null;

  if (mins >= mOpen && mins < mClose) {
    if (cfg.weeklyHolidays.includes(`${today}-Morning`)) {
      return { open: false, reason: `Morning closed on ${today}` };
    }
    return { open: true, reason: null };
  }

  if (hasEvening && mins >= eOpen! && mins < eClose!) {
    if (cfg.weeklyHolidays.includes(`${today}-Evening`)) {
      return { open: false, reason: `Evening closed on ${today}` };
    }
    return { open: true, reason: null };
  }

  if (mins < mOpen) {
    return { open: false, reason: `Lab opens at ${to12Hour(cfg.morningOpenTime)}` };
  }
  if (mins >= mClose && hasEvening && mins < eOpen!) {
    return { open: false, reason: "Closed between sessions" };
  }
  return { open: false, reason: "Closed for the day" };
}

export function slotsAvailableOn(
  cfg: LabConfig,
  closures: ClosureRow[],
  date: Date,
  now: Date = new Date()
): Slot[] {
  const isToday = startOfDayUTC(date) === istStartOfDay(now);

  if (!cfg.isOpenToday && isToday) return [];

  if (isClosedByWholeDayClosure(closures, date)) return [];

  const today = dayLabel(date);
  if (cfg.weeklyHolidays.includes(today)) return [];

  const open = ALL_SLOTS.filter((s) => !cfg.weeklyHolidays.includes(`${today}-${s}`));

  // A slot the clock has already passed cannot be collected. Without this the
  // form offered this morning's slot all afternoon, and a booking made at 7pm
  // for the 4pm–7pm window reached staff looking like any other request — for a
  // collection that could only ever be made in the past.
  if (!isToday) return open;
  return open.filter((s) => !slotHasPassed(s, date, now));
}

export function restrictionForSlots(tests: TestRestriction[]): Slot[] | null {
  const restrictions = tests
    .map((t) => t.collectionTimeRestriction)
    .filter((r): r is NonNullable<CollectionTimeRestriction> => !!r);
  if (restrictions.length === 0) return null;
  if (restrictions.includes("FastingMorningOnly") || restrictions.includes("MorningOnly")) {
    return ["Morning"];
  }
  if (restrictions.includes("EveningOnly")) return ["Evening"];
  return null;
}

export function restrictionLabel(r: NonNullable<CollectionTimeRestriction>): string {
  if (r === "FastingMorningOnly") return "fasting, morning only";
  if (r === "MorningOnly") return "morning only";
  return "evening only";
}

// Hours are stored 24-hour and shown 12-hour with AM/PM: patients read clocks
// that way, and "6:00 PM" cannot be misread as morning the way "18:00" can be
// skimmed past.
export function slotLabel(s: Slot): string {
  const w = SLOT_WINDOWS[s];
  return `${s} (${to12Hour(w.start)} – ${to12Hour(w.end)})`;
}
