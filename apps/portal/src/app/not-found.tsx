import Link from "next/link";
import { Card, Container, IconChip, btnPrimary, btnSecondary } from "@portal/components/ui";
import { Search } from "@portal/components/icons";

export default function NotFound() {
  return (
    <Container className="py-16">
      <Card className="mx-auto max-w-md p-8 text-center">
        <IconChip size="lg">
          <Search size={24} />
        </IconChip>
        <h1 className="mt-5 font-heading text-[20px] font-bold tracking-snug text-text">
          Page not found
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          The page you were looking for doesn’t exist, or it has moved.
        </p>
        <div className="mt-6 space-y-2.5">
          <Link href="/dashboard" className={`${btnPrimary} w-full`}>
            Go to my dashboard
          </Link>
          <Link href="/" className={`${btnSecondary} w-full`}>
            Back to home
          </Link>
        </div>
      </Card>
    </Container>
  );
}
