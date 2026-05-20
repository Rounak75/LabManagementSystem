import Link from "next/link";
import { getServiceClient } from "@portal/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORY_ORDER = [
  "Hematology",
  "Clinical Biochemistry",
  "Serology",
  "Clinical Pathology",
  "Microbiology",
  "Endocrinology",
  "Immunology",
  "Other",
];

interface TestRow {
  id: string;
  name: string;
  category: string;
  collectionTimeRestriction: string | null;
}

function restrictionTag(r: string | null): string | null {
  if (r === "FastingMorningOnly") return "Fasting · morning only";
  if (r === "MorningOnly") return "Morning only";
  if (r === "EveningOnly") return "Evening only";
  return null;
}

export default async function TestsCataloguePage() {
  const sb = getServiceClient();
  const { data } = await sb
    .from("tests")
    .select("id, name, category, collection_time_restriction")
    .eq("is_active", true)
    .order("name");

  const tests: TestRow[] = (data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category ?? "Other",
    collectionTimeRestriction: t.collection_time_restriction ?? null,
  }));

  const byCategory = new Map<string, TestRow[]>();
  for (const t of tests) {
    const arr = byCategory.get(t.category) ?? [];
    arr.push(t);
    byCategory.set(t.category, arr);
  }

  const orderedCats = [
    ...CATEGORY_ORDER.filter((c) => byCategory.has(c)),
    ...[...byCategory.keys()].filter((c) => !CATEGORY_ORDER.includes(c)),
  ];

  return (
    <div className="space-y-9">
      <header className="space-y-3">
        <h1 className="text-[32px] sm:text-[40px] font-heading font-bold tracking-tighter text-text leading-[1.05]">
          Test catalogue
        </h1>
        <p className="text-[14.5px] text-soft max-w-prose leading-relaxed">
          The tests we run at our Golmuri Chowk branch. Call the lab for current
          charges or to arrange anything not listed — most outsourced tests can be
          set up the same day.
        </p>
      </header>

      {tests.length > 0 && (
        <nav
          aria-label="Jump to category"
          className="flex flex-wrap gap-x-3 gap-y-2 text-[12.5px] border-b border-line pb-4"
        >
          <span className="text-muted mr-1">Jump to</span>
          {orderedCats.map((c, i) => (
            <a key={c} href={`#${slug(c)}`} className="text-soft hover:text-brand">
              {c}
              {i < orderedCats.length - 1 && (
                <span className="text-line ml-3" aria-hidden>·</span>
              )}
            </a>
          ))}
        </nav>
      )}

      {tests.length === 0 ? (
        <p className="text-[14px] text-muted">
          Test catalogue is still loading. Please check back shortly.
        </p>
      ) : (
        orderedCats.map((cat) => (
          <section key={cat} id={slug(cat)} className="space-y-3 scroll-mt-20">
            <div className="flex items-baseline justify-between border-b border-line pb-2">
              <h2 className="text-[19px] font-heading font-semibold text-text">{cat}</h2>
              <span className="text-[12px] text-muted num font-mono">
                {byCategory.get(cat)!.length} tests
              </span>
            </div>
            <ul className="rounded-xl border border-line bg-elev divide-y divide-line">
              {byCategory.get(cat)!.map((t) => {
                const r = restrictionTag(t.collectionTimeRestriction);
                return (
                  <li key={t.id} className="flex items-center justify-between gap-4 px-4 py-3 text-[14px]">
                    <p className="text-text min-w-0 truncate">{t.name}</p>
                    {r && (
                      <span className="text-[11.5px] text-notice shrink-0">{r}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      <section className="rounded-xl border border-brand/30 bg-brand-soft p-5 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
        <div>
          <p className="text-[15.5px] text-text font-heading font-semibold">
            Don&apos;t see a test you need?
          </p>
          <p className="text-[13.5px] text-soft mt-1">
            Call the lab — most outsourced tests can be arranged the same day.
          </p>
        </div>
        <a
          href="tel:6202924306"
          className="inline-flex items-center gap-2 self-start sm:self-auto rounded-lg bg-brand text-brand-fg px-4 py-2.5 text-[14px] font-semibold font-mono num tap hover:opacity-90"
        >
          Call 6202924306
        </a>
      </section>

      <p className="text-center text-[13.5px] pt-2">
        <Link href="/book" className="text-brand hover:underline inline-flex items-center gap-1">
          Book a home sample collection
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 8h10M9 4l4 4-4 4" />
          </svg>
        </Link>
      </p>
    </div>
  );
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
