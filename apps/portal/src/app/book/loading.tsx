// Booking form. A deeper band than the rest (`pb-24`) and the form card pulled
// further up into it.

import { Card, Container } from "@portal/components/ui";
import { Bar, SkCentredBand } from "@portal/components/skeleton";

export default function Loading() {
  return (
    <>
      <SkCentredBand lines={1} className="pb-24 sm:pb-28" />

      <Container className="-mt-8">
        <Card className="space-y-5 p-5 sm:p-6">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-2">
              <Bar className="h-3 w-24" i={i} />
              <Bar className="h-12 w-full rounded-2xl" i={i} />
            </div>
          ))}
          <Bar className="h-12 w-full rounded-2xl" i={4} />
        </Card>
      </Container>
    </>
  );
}
