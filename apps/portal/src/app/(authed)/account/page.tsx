import Link from "next/link";
import { LogoutButton } from "./LogoutButton";
import { Band, BandBar, Card, Container } from "@portal/components/ui";
import { ArrowRight, Lock, Phone, ShieldAlert } from "@portal/components/icons";

export default function AccountPage() {
  return (
    <>
      <Band waves className="pb-14">
        <Container>
          <BandBar back={{ href: "/dashboard", label: "Back to dashboard" }} title="Account" />
          <p className="pb-3 text-center text-[13px] text-band/65">
            Sign-in settings and how to reach us.
          </p>
        </Container>
      </Band>

      <Container className="mt-8 space-y-4">
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            <Row
              href="/account/password"
              icon={<Lock size={18} />}
              title="Set or change password"
              body="Sign in with a password instead of your patient ID."
            />
            <Row
              href="/account/dispute"
              icon={<ShieldAlert size={18} />}
              title="This isn’t me"
              body="Report a phone number that no longer belongs to this patient."
              tone="alert"
            />
          </ul>
        </Card>

        <Card className="p-5">
          <p className="font-heading text-[14.5px] font-bold tracking-snug text-text">
            Need a hand?
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            Staff can look up your records and read out your patient ID after
            confirming your identity.
          </p>
          <a
            href="tel:6202924306"
            className="tap mt-4 inline-flex items-center gap-2 rounded-2xl bg-brand-soft px-5 py-3 font-mono num text-[14px] font-semibold text-brand hover:bg-brand hover:text-brand-fg"
          >
            <Phone size={15} />
            6202924306
          </a>
        </Card>

        <LogoutButton />
      </Container>
    </>
  );
}

function Row({
  href,
  icon,
  title,
  body,
  tone = "brand",
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  tone?: "brand" | "alert";
}) {
  return (
    <li>
      <Link href={href} className="tap flex items-center gap-4 px-5 py-4 hover:bg-surface">
        <span
          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            tone === "alert" ? "bg-alert-soft text-alert" : "bg-brand-soft text-brand"
          }`}
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-semibold text-text">{title}</span>
          <span className="mt-0.5 block text-[12.5px] leading-relaxed text-muted">
            {body}
          </span>
        </span>
        <ArrowRight size={16} className="shrink-0 text-muted" />
      </Link>
    </li>
  );
}
