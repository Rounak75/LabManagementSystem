// Phase 3d Plan D — patient dashboard. Shows recent visits with status + a
// link to the report or pay page. Reads via the service client + JWT-scoped
// queries (RLS still enforces patient_id scoping).

import { redirect } from "next/navigation";
import Link from "next/link";
import { requirePatient } from "@portal/lib/session";
import { getServiceClient } from "@portal/lib/supabase-server";
import { outstandingBalance } from "@portal/lib/report-release";
import {
  Band,
  BandCard,
  Card,
  Container,
  IconChip,
  Note,
  SectionHead,
  Tag,
  btnPrimary,
} from "@portal/components/ui";
import { LinkPending } from "@portal/components/LinkPending";
import {
  ArrowRight,
  Calendar,
  Clock,
  Help,
  HomeVisit,
  Phone,
  Report,
  User,
  Wallet,
} from "@portal/components/icons";

import { labDate } from "@portal/lib/format";

export const runtime = "nodejs";

interface VisitRow {
  id: string;
  visit_id: string;
  visit_date: string;
  status: string;
  invoice: { id: string; total: number; amount_paid: number; payment_status: string } | null;
}

// The server runs in UTC; the patient reading this is in Jamshedpur. Greet
// them by their clock, not the data centre's.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
function greeting(): string {
  const h = new Date(Date.now() + IST_OFFSET_MS).getUTCHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  let session;
  try { session = await requirePatient(); } catch { redirect("/login"); }
  const sb = getServiceClient();

  const { data: visits } = await sb
    .from("visits")
    .select("id, visit_id, visit_date, status, invoices(id, total, amount_paid, payment_status)")
    .eq("patient_id", session!.patientId)
    .is("deleted_at", null)
    .order("visit_date", { ascending: false })
    .limit(50);

  const { data: patient } = await sb
    .from("patients")
    .select("name")
    .eq("id", session!.patientId)
    .maybeSingle();

  const { data: heartbeat } = await sb
    .from("cloud_heartbeat")
    .select("last_pushed_at")
    .eq("id", "singleton")
    .maybeSingle();
  const lastSeen = heartbeat?.last_pushed_at ? new Date(heartbeat.last_pushed_at) : null;
  const stale = lastSeen && Date.now() - lastSeen.getTime() > 10 * 60_000;

  const rows: VisitRow[] = (visits ?? []).map((v) => ({
    id: v.id,
    visit_id: v.visit_id,
    visit_date: v.visit_date,
    status: v.status,
    invoice: Array.isArray(v.invoices) && v.invoices[0] ? v.invoices[0] : null,
  }));

  const latest = rows[0];
  const latestDue = latest?.invoice ? outstandingBalance(latest.invoice) : 0;
  const totalDue = rows.reduce(
    (sum, v) => sum + (v.invoice ? outstandingBalance(v.invoice) : 0),
    0
  );
  const firstName = patient?.name?.trim().split(/\s+/)[0] ?? null;

  return (
    <>
      {/* ─── Greeting band ────────────────────────────────────────────── */}
      <Band waves className="pb-14">
        <Container className="pt-8">
          <div className="rise flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="truncate font-heading text-[26px] font-extrabold leading-tight tracking-tighter text-band sm:text-[32px]">
                {greeting()}
                {firstName ? `, ${firstName}` : ""}
              </h1>
              <p className="mt-1.5 text-[13.5px] text-band/65">
                Everything the lab has on record for you.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <a
                href="tel:6202924306"
                aria-label="Call the lab"
                className="tap inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-band ring-1 ring-inset ring-white/20 hover:bg-white/25"
              >
                <Phone size={17} />
              </a>
              <Link
                href="/info"
                aria-label="Lab information"
                className="tap inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-band ring-1 ring-inset ring-white/20 hover:bg-white/25"
              >
                <Help size={17} />
              </Link>
            </div>
          </div>

          {/* Most recent visit — the card that sits inside the band. */}
          {latest ? (
            <BandCard className="rise mt-7">
              <div className="px-4 pb-3 pt-2.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-band/70">
                    Latest visit
                  </p>
                  <span className="font-mono num text-[11.5px] text-band/60">
                    {labDate(latest.visit_date, { year: true })}
                  </span>
                </div>
              </div>
              {/* Only a link once there is somewhere to go. A card that looks
                  tappable and lands you back on the page you're already on is
                  worse than one that plainly isn't ready yet. */}
              <LatestVisitBody
                href={latest.status === "Completed" ? `/visits/${latest.id}` : null}
                visitId={latest.visit_id}
                caption={
                  latest.status === "Completed"
                    ? latestDue > 0
                      ? `Report ready · ₹${latestDue.toFixed(0)} still due`
                      : "Report ready to read"
                    : "Being processed by the lab"
                }
              />
            </BandCard>
          ) : (
            /* The one empty state on this screen. It used to be printed twice
               — here, and again under a "Your visits" heading below — with the
               action stranded in the second copy, so the first told you there
               was nothing and offered no way out. The heading and its card are
               dropped entirely when there are no visits; there is nothing to
               head. */
            <BandCard className="rise mt-7">
              <div className="rounded-[20px] bg-elev px-5 py-6 text-center">
                <IconChip size="lg">
                  <HomeVisit size={24} />
                </IconChip>
                <p className="mt-3.5 text-[15px] font-semibold text-text">
                  No visits on record yet
                </p>
                <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted">
                  Once you’ve given a sample, your report and bill appear here.
                  Book a home collection and a phlebotomist comes to you.
                </p>
                <Link href="/book" className={`${btnPrimary} relative mt-5 overflow-hidden`}>
                  <HomeVisit size={16} />
                  Book a home collection
                  <LinkPending />
                </Link>
              </div>
            </BandCard>
          )}
        </Container>
      </Band>

      <Container className="space-y-8">
        {/* ─── Quick actions ─────────────────────────────────────────────
            One opaque card that crosses the band's bottom edge, not four
            translucent tiles sitting on it.

            The tiles were `.glass`, which is see-through by construction, so
            the band showed through their top half and the canvas through their
            bottom half and a seam ran across every one of them — with the
            band's pale wave decoration smearing behind the labels in exactly
            that zone. Nothing shows through a solid fill, so the whole class of
            problem goes away rather than being tuned around.

            The overlap itself is kept on purpose: it is the same move the
            landing page's search pill already makes, and it ties the band to
            the page instead of stacking two rectangles. */}
        <nav
          aria-label="Quick actions"
          className="rise -mt-9"
          style={{ "--i": 2 } as React.CSSProperties}
        >
          <ul className="grid grid-cols-4 divide-x divide-line overflow-hidden rounded-3xl border border-line bg-elev shadow-card">
            {[
              { href: "/invoices", label: "My bills", icon: <Wallet size={19} /> },
              { href: "/book", label: "Book visit", icon: <HomeVisit size={19} /> },
              // "Tests", not "Test list" — the header calls it Tests, and one
              // name per destination is how anyone learns their way around.
              { href: "/tests", label: "Tests", icon: <Calendar size={19} /> },
              { href: "/account", label: "Account", icon: <User size={19} /> },
            ].map((a) => (
              <QuickAction key={a.href} {...a} />
            ))}
          </ul>
        </nav>

        {stale && (
          <Note tone="notice" icon={<Clock size={17} />}>
            The lab’s desktop may be offline — information shown here was last
            synced{" "}
            {lastSeen
              ? `${Math.round((Date.now() - lastSeen.getTime()) / 60_000)} minutes ago`
              : "a while ago"}
            .
          </Note>
        )}

        {/* ─── Outstanding total ─────────────────────────────────────── */}
        {totalDue > 0 && (
          <Link
            href="/invoices"
            className="tap flex items-center gap-4 rounded-3xl border border-notice/25 bg-notice-soft p-5 hover:shadow-card"
          >
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-elev text-notice">
              <Wallet size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-soft">
                Outstanding across all bills
              </span>
              <span className="mt-0.5 block font-mono num text-[20px] font-semibold text-text">
                ₹{totalDue.toFixed(0)}
              </span>
            </span>
            <ArrowRight size={17} className="shrink-0 text-notice" />
          </Link>
        )}

        {/* ─── Visits ─────────────────────────────────────────────────────
            Omitted entirely when there are none — the band card above is the
            empty state, and it carries the action. */}
        {rows.length > 0 && (
          <section>
            <SectionHead title="Your visits" />
            <ul className="space-y-2.5">
              {rows.map((v, i) => {
                const due = v.invoice ? outstandingBalance(v.invoice) : 0;
                const done = v.status === "Completed";
                return (
                  <Card
                    as="li"
                    key={v.id}
                    className="rise p-4"
                    // Only the first handful stagger; past that the delay would
                    // be longer than anyone waits to read a list.
                    style={{ "--i": Math.min(i, 6) } as React.CSSProperties}
                  >
                    <div className="flex items-center gap-3.5">
                      <span
                        className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                          done ? "bg-ok-soft text-ok" : "bg-notice-soft text-notice"
                        }`}
                      >
                        <Report size={18} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono num text-[14.5px] font-medium text-text">
                          {v.visit_id}
                        </p>
                        <p className="mt-0.5 text-[12px] text-muted">
                          {labDate(v.visit_date, { year: true })}
                        </p>
                      </div>
                      <Tag tone={done ? "ok" : "notice"}>{v.status}</Tag>
                    </div>

                    {(done || due > 0) && (
                      <div className="mt-3.5 flex flex-wrap gap-2 border-t border-line pt-3.5">
                        {done && (
                          <Link
                            href={`/visits/${v.id}`}
                            className="tap inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-4 py-2 text-[12.5px] font-semibold text-brand hover:bg-brand hover:text-brand-fg"
                          >
                            View report
                            <ArrowRight size={13} />
                          </Link>
                        )}
                        {/* The amount owed, not the amount billed. This showed the full
                            total even after a part payment at the counter, so a patient
                            who had already handed over half was asked for all of it. */}
                        {v.invoice && due > 0 && (
                          <Link
                            href={`/invoices/${v.invoice.id}/pay`}
                            className="tap inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 font-mono num text-[12.5px] font-semibold text-brand-fg hover:bg-brand-hover"
                          >
                            Pay ₹{due.toFixed(0)}
                          </Link>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </ul>
          </section>
        )}
      </Container>
    </>
  );
}

function LatestVisitBody({
  href,
  visitId,
  caption,
}: {
  href: string | null;
  visitId: string;
  caption: string;
}) {
  const inner = (
    <>
      <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
        <Report size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono num text-[15px] font-medium text-text">
          {visitId}
        </span>
        <span className="mt-0.5 block truncate text-[12.5px] text-muted">
          {caption}
        </span>
      </span>
      {href && <ArrowRight size={17} className="shrink-0 text-brand" />}
    </>
  );

  const box = "flex items-center gap-4 rounded-[20px] bg-elev px-5 py-4";
  return href ? (
    <Link href={href} className={`tap relative overflow-hidden ${box}`}>
      {inner}
      <LinkPending />
    </Link>
  ) : (
    <div className={box}>{inner}</div>
  );
}

/**
 * One cell of the action tray.
 *
 * The cells carry no chrome of their own — the tray is the card, and hairline
 * dividers separate them. Hover fills the cell rather than lifting it, because
 * a cell that lifts out of a card it is flush inside reads as a rendering
 * fault. The whole tray staggers in as one block, so cells take no `--i`.
 */
function QuickAction({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="tap group relative flex min-h-[88px] flex-col items-center justify-center gap-2.5 overflow-hidden px-1 py-4 hover:bg-surface"
      >
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-brand transition-transform duration-300 ease-out-fluid group-hover:-translate-y-0.5 group-hover:scale-105">
          {icon}
        </span>
        <span className="text-center text-[12px] font-medium leading-tight text-soft">
          {label}
        </span>
        <LinkPending />
      </Link>
    </li>
  );
}
