// Landing page. `force-dynamic` plus three Supabase queries, so this is a real
// wait — and it is the first thing anyone sees.

import { Container } from "@portal/components/ui";
import { Bar, Disc, SkCentredBand, SkSectionHead } from "@portal/components/skeleton";

export default function Loading() {
  return (
    <>
      <SkCentredBand lines={2} />

      <Container className="space-y-10">
        {/* Search pill — overlaps the band, same as the page it stands in for. */}
        <div className="-mt-6 flex items-center gap-3 rounded-full border border-line bg-elev px-5 py-4 shadow-card">
          <Disc className="h-5 w-5" />
          <Bar className="h-3.5 flex-1" i={1} />
        </div>

        {/* Five quick-action tiles. */}
        <ul className="grid grid-cols-5 gap-0.5 sm:gap-1">
          {Array.from({ length: 5 }, (_, i) => (
            <li
              key={i}
              className="glass flex min-h-[86px] flex-col items-center justify-center gap-2 rounded-2xl px-1 py-3.5"
            >
              <Disc className="h-6 w-6" i={i} />
              <Bar className="h-2.5 w-10" i={i} />
            </li>
          ))}
        </ul>

        <section>
          <SkSectionHead />
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <li
                key={i}
                className="glass flex h-full items-center gap-3 rounded-2xl p-3 sm:flex-col sm:gap-2 sm:p-4"
              >
                <Disc className="h-11 w-11 sm:h-12 sm:w-12" i={i % 4} />
                <span className="min-w-0 flex-1 space-y-1.5 sm:flex-none">
                  <Bar className="h-3 w-24" i={i % 4} />
                  <Bar className="h-2.5 w-12" i={(i % 4) + 1} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      </Container>
    </>
  );
}
