"use client";
import { useState } from "react";
import {
  Band,
  BandBar,
  Card,
  Container,
  IconChip,
  Note,
  btnPrimary,
} from "@portal/components/ui";
import { Check, ShieldAlert } from "@portal/components/icons";

export default function DisputePage() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await fetch("/api/disputes", { method: "POST" });
      setSubmitted(true);
    } finally { setSubmitting(false); }
  }

  return (
    <>
      <Band waves className="pb-14">
        <Container>
          <BandBar back={{ href: "/account", label: "Back to account" }} title="This isn’t me" />
        </Container>
      </Band>

      <Container>
        <div className="mx-auto -mt-8 max-w-md">
          {submitted ? (
            <Card className="p-6">
              <IconChip tone="ok">
                <Check size={20} />
              </IconChip>
              <h2 className="mt-4 font-heading text-[16px] font-bold tracking-snug text-text">
                We’ve received your report
              </h2>
              <p className="mt-2 text-[13.5px] leading-relaxed text-soft">
                Our staff will call you within 24 hours to verify your identity.
                After verification, this phone number will be disconnected from
                the patient account.
              </p>
            </Card>
          ) : (
            <Card className="p-6">
              <IconChip tone="alert">
                <ShieldAlert size={20} />
              </IconChip>
              <h1 className="mt-4 font-heading text-[18px] font-bold tracking-snug text-text">
                Not your records?
              </h1>
              <p className="mt-2 text-[13.5px] leading-relaxed text-soft">
                If you are not the patient associated with this phone number —
                for example, you recently received this number and someone else
                used it before — please let us know. Our staff will call to
                verify and then disconnect this phone from the patient account.
              </p>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className={`${btnPrimary} mt-6 w-full bg-alert hover:bg-alert/90`}
              >
                {submitting ? "Submitting…" : "Report this to the lab"}
              </button>
            </Card>
          )}

          {!submitted && (
            <div className="mt-4">
              <Note tone="notice">
                Reporting this doesn’t delete anything straight away — a member
                of staff checks first, so nobody loses records by mistake.
              </Note>
            </div>
          )}
        </div>
      </Container>
    </>
  );
}
