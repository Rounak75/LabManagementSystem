import Link from "next/link";
import { Container } from "./ui";
import { MapPin, Phone, Clock } from "./icons";

export function Footer() {
  return (
    <footer className="mt-4 border-t border-line bg-elev">
      <Container className="py-10">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          <div>
            <div className="mb-3 flex items-center gap-2 text-brand">
              <MapPin size={16} />
              <p className="font-heading text-[14px] font-bold text-text">
                Golmuri Janch Ghar
              </p>
            </div>
            <p className="text-[13px] leading-relaxed text-muted">
              Main Road, Golmuri Chowk
              <br />
              Near Brown Bunch Bakery
              <br />
              Jamshedpur, Jharkhand 831003
            </p>
            <a
              href="tel:6202924306"
              className="tap mt-3 inline-flex items-center gap-2 rounded-full bg-surface px-3.5 py-2 font-mono num text-[13px] font-medium text-text hover:text-brand"
            >
              <Phone size={14} />
              +91 62029 24306
            </a>
          </div>

          <div>
            <p className="mb-3 font-heading text-[13px] font-bold uppercase tracking-[0.08em] text-muted">
              Quick links
            </p>
            <ul className="space-y-2.5 text-[13.5px]">
              <li><FooterLink href="/login">Sign in to view reports</FooterLink></li>
              <li><FooterLink href="/info">Lab information</FooterLink></li>
              <li><FooterLink href="/tests">Test catalogue</FooterLink></li>
              <li><FooterLink href="/book">Book a home visit</FooterLink></li>
            </ul>
          </div>

          <div>
            <div className="mb-3 flex items-center gap-2">
              <Clock size={15} className="text-muted" />
              <p className="font-heading text-[13px] font-bold uppercase tracking-[0.08em] text-muted">
                Hours
              </p>
            </div>
            <ul className="space-y-2.5 text-[13.5px] text-soft">
              <li className="flex items-baseline justify-between gap-3">
                <span>Mon – Sat</span>
                <span className="font-mono num text-[12.5px] text-text">
                  8 AM–1 PM, 6–8 PM
                </span>
              </li>
              <li className="flex items-baseline justify-between gap-3">
                <span>Sunday</span>
                <span className="text-[12.5px] text-text">Morning only</span>
              </li>
            </ul>
          </div>
        </div>

        <p className="mt-9 border-t border-line pt-6 text-[12px] leading-relaxed text-muted">
          Reports digitally signed by our consulting pathologist. We don’t share
          your data with anyone outside the lab.
        </p>
      </Container>
    </footer>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="tap text-soft hover:text-brand">
      {children}
    </Link>
  );
}
