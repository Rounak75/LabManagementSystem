import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-line mt-16">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-[13px]">
          <div>
            <p className="text-text font-heading font-semibold">Golmuri Janch Ghar</p>
            <p className="text-muted mt-1 leading-relaxed">
              Main Road, Golmuri Chowk
              <br />
              Jamshedpur · Jharkhand
            </p>
            <a
              href="tel:6202924306"
              className="font-mono text-text mt-2 inline-block hover:text-brand num"
            >
              +91 62029 24306
            </a>
          </div>
          <div>
            <p className="text-muted text-[12px] mb-2">For patients</p>
            <ul className="space-y-1.5">
              <li><FooterLink href="/login">Sign in to view reports</FooterLink></li>
              <li><FooterLink href="/info">Lab information</FooterLink></li>
              <li><FooterLink href="/tests">Test catalogue</FooterLink></li>
              <li><FooterLink href="/book">Book a home visit</FooterLink></li>
            </ul>
          </div>
          <div>
            <p className="text-muted text-[12px] mb-2">Hours</p>
            <ul className="space-y-1.5 text-soft font-mono num text-[12.5px]">
              <li className="flex justify-between gap-3">
                <span>Mon – Sat</span>
                <span className="text-text">8 AM–1 PM, 6–8 PM</span>
              </li>
              <li className="flex justify-between gap-3">
                <span>Sunday</span>
                <span className="text-text">Morning only</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-5 border-t border-line text-[12px] text-muted">
          Reports digitally signed by our consulting pathologist. We don't share
          your data with anyone outside the lab.
        </div>
      </div>
    </footer>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-soft hover:text-text tap">
      {children}
    </Link>
  );
}
