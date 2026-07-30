"use client";

import { useEffect } from "react";
import { Card, Container, IconChip, btnPrimary, btnSecondary } from "@portal/components/ui";
import { Phone, ShieldAlert } from "@portal/components/icons";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: error.message, stack: error.stack, url: location.href, userAgent: navigator.userAgent }),
      keepalive: true,
    }).catch(() => {});
  }, [error]);

  return (
    <Container className="py-16">
      <Card className="mx-auto max-w-md p-8 text-center">
        <IconChip tone="notice" size="lg">
          <ShieldAlert size={24} />
        </IconChip>
        <h1 className="mt-5 font-heading text-[20px] font-bold tracking-snug text-text">
          Something went wrong
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          We hit an unexpected problem loading this page. Trying again usually
          clears it.
        </p>
        <div className="mt-6 space-y-2.5">
          <button onClick={reset} className={`${btnPrimary} w-full`}>
            Try again
          </button>
          <a href="tel:6202924306" className={`${btnSecondary} w-full`}>
            <Phone size={16} />
            Call the lab
          </a>
        </div>
      </Card>
    </Container>
  );
}
