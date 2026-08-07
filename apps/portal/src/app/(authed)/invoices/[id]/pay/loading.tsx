// The pay page. The amount due is the one thing on it, so the band card here
// is taller than the shared interior shape — a QR block follows below.

import { Band, BandCard, Card, Container } from "@portal/components/ui";
import { Bar, SkBandBar } from "@portal/components/skeleton";

export default function Loading() {
  return (
    <>
      <Band waves className="pb-14">
        <Container>
          <SkBandBar />
          <BandCard className="mt-4">
            <div className="flex flex-col items-center gap-3 rounded-[20px] bg-elev px-5 py-7">
              <Bar className="h-3 w-24" i={1} />
              <Bar className="h-8 w-36" i={2} />
              <Bar className="h-3 w-32" i={3} />
            </div>
          </BandCard>
        </Container>
      </Band>

      <Container className="mt-8 space-y-4">
        <Card className="flex flex-col items-center gap-4 p-6">
          <span aria-hidden className="skeleton block h-44 w-44 rounded-2xl" />
          <Bar className="h-3 w-48" i={1} />
        </Card>
        <Bar className="h-12 w-full rounded-2xl" i={2} />
      </Container>
    </>
  );
}
