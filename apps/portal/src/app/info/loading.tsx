import { Card, Container } from "@portal/components/ui";
import { Bar, SkCard, SkCentredBand, SkSectionHead } from "@portal/components/skeleton";

export default function Loading() {
  return (
    <>
      <SkCentredBand lines={1} />

      <Container className="-mt-6 space-y-8">
        <section className="grid gap-3 sm:grid-cols-2">
          <SkCard lines={3} />
          <SkCard lines={3} />
        </section>

        <section>
          <SkSectionHead />
          <Card className="overflow-hidden">
            <div className="divide-y divide-line">
              {Array.from({ length: 7 }, (_, i) => (
                <div key={i} className="flex items-center justify-between gap-4 px-5 py-3">
                  <Bar className="h-3.5 w-24" i={Math.min(i, 6)} />
                  <Bar className="h-3.5 w-32" i={Math.min(i, 6)} />
                </div>
              ))}
            </div>
          </Card>
        </section>
      </Container>
    </>
  );
}
