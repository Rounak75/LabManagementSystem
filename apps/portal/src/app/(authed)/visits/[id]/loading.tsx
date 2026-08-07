// A report: the visit header in the band, then one card per test panel. Panels
// are tables, so their skeleton is a header strip plus parameter rows rather
// than the plate-and-lines row used for lists.

import { Card, Container } from "@portal/components/ui";
import { Bar, Disc, SkInteriorBand } from "@portal/components/skeleton";

export default function Loading() {
  return (
    <>
      <SkInteriorBand />

      <Container className="mt-8 space-y-4">
        {Array.from({ length: 2 }, (_, panel) => (
          <Card key={panel} className="overflow-hidden">
            <div className="flex items-center gap-3 border-b border-line px-5 py-4">
              <Disc className="h-9 w-9" i={panel} />
              <Bar className="h-4 w-44 flex-1" i={panel} />
              <Bar className="h-3 w-16" i={panel + 1} />
            </div>
            <div className="divide-y divide-line">
              {Array.from({ length: 4 }, (_, row) => (
                <div key={row} className="flex items-center gap-4 px-5 py-3">
                  <Bar className="h-3.5 flex-1" i={row} />
                  <Bar className="h-3.5 w-16" i={row} />
                  <Bar className="h-3.5 w-20" i={row + 1} />
                </div>
              ))}
            </div>
          </Card>
        ))}
      </Container>
    </>
  );
}
