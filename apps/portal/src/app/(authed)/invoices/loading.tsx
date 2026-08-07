import { Container } from "@portal/components/ui";
import { SkInteriorBand, SkRows } from "@portal/components/skeleton";

export default function Loading() {
  return (
    <>
      <SkInteriorBand />
      <Container className="mt-8">
        <SkRows count={4} />
      </Container>
    </>
  );
}
