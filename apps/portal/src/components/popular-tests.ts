// What people actually walk in and ask for.
//
// Matched by name against whatever the lab's catalogue happens to hold, so a
// renamed or withdrawn test simply drops out of the shortlist rather than
// showing a row that leads nowhere. Shared by the landing page and the booking
// form so the two never disagree about what "popular" means.

export const POPULAR_TEST_NAMES = [
  "CBC", "Complete Blood Count", "Lipid Profile", "HbA1c",
  "Thyroid Profile", "Thyroid Profile (T3 T4 TSH)", "TSH",
  "Liver Function Test", "LFT", "Kidney Function Test", "KFT",
  "Blood Sugar", "Fasting Blood Sugar", "Urine Routine",
  "Urine Routine & Microscopy", "Widal", "Widal Test", "Dengue",
  "Dengue NS1 Antigen", "Vitamin D", "Vitamin D (25-OH)", "Vitamin B12",
];

const WANTED = new Set(POPULAR_TEST_NAMES.map((s) => s.toLowerCase()));

/** Popular first, everything else after, capped at `n`. */
export function pickPopular<T extends { name: string }>(rows: T[], n: number): T[] {
  const matched: T[] = [];
  const others: T[] = [];
  for (const r of rows) {
    if (WANTED.has(r.name.toLowerCase())) matched.push(r);
    else others.push(r);
  }
  return [...matched, ...others].slice(0, n);
}

/** Only the genuinely popular ones — no filler. Used where a short, honest
 *  shortlist matters more than filling a fixed number of slots. */
export function onlyPopular<T extends { name: string }>(rows: T[], n: number): T[] {
  return rows.filter((r) => WANTED.has(r.name.toLowerCase())).slice(0, n);
}
