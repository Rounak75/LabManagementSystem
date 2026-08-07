// The full catalogue — the heaviest query in the portal, and the one most
// likely to be tapped from the landing page.

import { Card, Container } from "@portal/components/ui";
import { Bar, SkCentredBand } from "@portal/components/skeleton";

export default function Loading() {
  return (
    <>
      <SkCentredBand lines={1} />

      <Container className="space-y-8">
        {/* Search field, then the category rail. */}
        <div className="-mt-6 rounded-full border border-line bg-elev px-5 py-4 shadow-card">
          <Bar className="h-3.5 w-56 max-w-full" />
        </div>

        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 6 }, (_, i) => (
            <Bar key={i} className="h-8 w-24 shrink-0 rounded-full" i={i} />
          ))}
        </div>

        <Card className="overflow-hidden">
          <div className="divide-y divide-line">
            {Array.from({ length: 9 }, (_, i) => (
              <div key={i} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <Bar className="h-3.5 w-48 max-w-[60%]" i={Math.min(i, 6)} />
                <Bar className="h-3 w-16 shrink-0" i={Math.min(i, 6)} />
              </div>
            ))}
          </div>
        </Card>
      </Container>
    </>
  );
}
