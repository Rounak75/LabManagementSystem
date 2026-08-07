// Account opens with a bare band — no card pulled into it — then a list of
// settings rows and a single prose card.

import { Card, Container } from "@portal/components/ui";
import { Bar, Disc, SkCard, SkInteriorBand } from "@portal/components/skeleton";

export default function Loading() {
  return (
    <>
      <SkInteriorBand card={false} />

      <Container className="mt-8 space-y-4">
        <Card className="overflow-hidden">
          <div className="divide-y divide-line">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <Disc i={i} />
                <div className="min-w-0 flex-1 space-y-2">
                  <Bar className="h-4 w-32" i={i} />
                  <Bar className="h-3 w-52 max-w-full" i={i + 1} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <SkCard lines={2} />
      </Container>
    </>
  );
}
