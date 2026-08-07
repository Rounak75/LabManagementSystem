// The dashboard's own shape: greeting band, latest-visit card pulled into it,
// the action tray bridging the band edge, then the visit list.

import { Band, BandCard, Container } from "@portal/components/ui";
import { Bar, Disc, SkRows, SkSectionHead, SkTray } from "@portal/components/skeleton";

export default function Loading() {
  return (
    <>
      <Band waves className="pb-14">
        <Container className="pt-8">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-2.5">
              <Bar className="h-7 w-56 sm:h-8 sm:w-72" onBand />
              <Bar className="h-3.5 w-48" i={1} onBand />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Disc className="h-10 w-10" onBand />
              <Disc className="h-10 w-10" i={1} onBand />
            </div>
          </div>

          <BandCard className="mt-7">
            <div className="flex items-center gap-4 rounded-[20px] bg-elev px-5 py-4">
              <Disc i={2} />
              <div className="min-w-0 flex-1 space-y-2">
                <Bar className="h-4 w-36" i={2} />
                <Bar className="h-3 w-44" i={3} />
              </div>
            </div>
          </BandCard>
        </Container>
      </Band>

      <Container className="space-y-8">
        <SkTray />

        <section>
          <SkSectionHead />
          <SkRows count={3} />
        </section>
      </Container>
    </>
  );
}
