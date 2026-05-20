// Phase 3d Plan H — shared open/closed + slot-availability logic for /book and /info.
// One source of truth so both pages agree on what the lab is doing right now.

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

function hhmmToMinutes(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function dayLabel(d: Date): string {
  return DAYS[d.getDay()] ?? "";
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
  if (!cfg.isOpenToday) {
    return { open: false, reason: cfg.manualClosureReason ?? "Lab is closed today" };
  }

  if (isClosedByWholeDayClosure(closures, now)) {
    return { open: false, reason: "Lab is closed today" };
  }

  const today = dayLabel(now);
  if (cfg.weeklyHolidays.includes(today)) {
    return { open: false, reason: `Closed every ${today}` };
  }

  const mins = now.getHours() * 60 + now.getMinutes();
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
    return { open: false, reason: `Lab opens at ${cfg.morningOpenTime}` };
  }
  if (mins >= mClose && hasEvening && mins < eOpen!) {
    return { open: false, reason: "Closed between sessions" };
  }
  return { open: false, reason: "Closed for the day" };
}

export function slotsAvailableOn(
  cfg: LabConfig,
  closures: ClosureRow[],
  date: Date
): Slot[] {
  if (!cfg.isOpenToday && sameYMD(date, new Date())) return [];

  if (isClosedByWholeDayClosure(closures, date)) return [];

  const today = dayLabel(date);
  if (cfg.weeklyHolidays.includes(today)) return [];

  return ALL_SLOTS.filter((s) => !cfg.weeklyHolidays.includes(`${today}-${s}`));
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

export function slotLabel(s: Slot): string {
  if (s === "Morning") return "Morning (08:00–11:00)";
  if (s === "Afternoon") return "Afternoon (12:00–15:00)";
  return "Evening (16:00–19:00)";
}
