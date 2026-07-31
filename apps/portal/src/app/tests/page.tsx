import Link from "next/link";
import { getServiceClient } from "@portal/lib/supabase-server";
import { Band, Card, Container, btnOnBand } from "@portal/components/ui";
import { TestCatalogue, type CatalogueTest } from "./TestCatalogue";
import { ArrowRight, HomeVisit, Phone } from "@portal/components/icons";

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

export default async function TestsCataloguePage() {
  const sb = getServiceClient();
  const { data } = await sb
    .from("tests")
    .select("id, name, category, collection_time_restriction")
    .eq("is_active", true)
    .order("name");

  const tests: CatalogueTest[] = (data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category ?? "Other",
    restriction: t.collection_time_restriction ?? null,
  }));

  const present = new Set(tests.map((t) => t.category));
  const categories = [
    ...CATEGORY_ORDER.filter((c) => present.has(c)),
    ...[...present].filter((c) => !CATEGORY_ORDER.includes(c)).sort(),
  ];

  return (
    <>
      <Band waves className="pb-14">
        {/* Centred: the band is a nameplate, so its lines sit on one axis. */}
        <Container className="pt-8 text-center">
          <p className="rise text-[12px] font-semibold uppercase tracking-[0.18em] text-band/60">
            Catalogue
          </p>
          <h1
            className="rise mt-3 font-heading text-[30px] font-extrabold leading-[1.06] tracking-tighter text-band sm:text-[38px] lg:text-[44px]"
            style={{ "--i": 1 } as React.CSSProperties}
          >
            Every test we run
          </h1>
          <p
            className="rise mx-auto mt-4 max-w-prose text-[14px] leading-relaxed text-band/70 sm:text-[14.5px]"
            style={{ "--i": 2 } as React.CSSProperties}
          >
            The tests offered at our Golmuri Chowk branch. Call the lab for
            current charges or to arrange anything not listed — most outsourced
            tests can be set up the same day.
          </p>
          <div
            className="rise mt-6 flex flex-wrap justify-center gap-2.5"
            style={{ "--i": 3 } as React.CSSProperties}
          >
            <Link href="/book" className={`${btnOnBand} px-5 py-3`}>
              Book a collection
              <ArrowRight size={15} />
            </Link>
            <a
              href="tel:6202924306"
              className="tap inline-flex items-center gap-2 rounded-full px-5 py-3 text-[13.5px] font-semibold text-band ring-1 ring-inset ring-white/25 hover:bg-white/10"
            >
              <Phone size={15} />
              Call the lab
            </a>
          </div>
        </Container>
      </Band>

      <Container className="space-y-8">
        <div className="-mt-6">
          <TestCatalogue tests={tests} categories={categories} />
        </div>

        {/* ─── Ask for anything else ─────────────────────────────────── */}
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              <p className="font-heading text-[16px] font-bold tracking-snug text-text">
                Don’t see a test you need?
              </p>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
                Call the lab — most outsourced tests can be arranged the same day.
              </p>
            </div>
            <a
              href="tel:6202924306"
              className="tap inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-2xl bg-brand px-5 py-3.5 font-mono num text-[14px] font-semibold text-brand-fg shadow-card hover:bg-brand-hover sm:self-auto"
            >
              <Phone size={15} />
              6202924306
            </a>
          </div>
        </Card>

        <Link
          href="/book"
          className="tap lift flex items-center gap-3 rounded-2xl bg-brand-soft px-5 py-4 text-[14px] font-semibold text-brand hover:opacity-90"
        >
          <HomeVisit size={18} />
          <span className="flex-1">Book a home sample collection</span>
          <ArrowRight size={16} />
        </Link>
      </Container>
    </>
  );
}
