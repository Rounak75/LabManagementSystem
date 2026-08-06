// Phase 3e Plan A — pull admin-portal-created visits + their VisitTests into
// local SQLite. visit_tests are a separate cloud table, fetched for the whole
// page at once (not per visit) and materialised as local VisitTest rows. Skips
// desktop-source rows to avoid echoes.

import { prisma } from "@main/db";
import { logger } from "./logger";
import { runPull, type PullStats } from "./pull-runner";
import type { CloudClient } from "./sync-engine";

const SOURCE = "visits";

interface RawVisitRow extends Record<string, unknown> {
  id: string;
  visit_id: string;
  patient_id: string;
  type: string;
  visit_date: string;
  status: string;
  staff_id: string;
  access_code_hash: string | null;
  source: string;
  verified_by_user_id: string | null;
  verified_at: string | null;
  report_release_override?: boolean | null;
  report_release_override_by_user_id?: string | null;
  report_release_override_at?: string | null;
  report_release_override_reason?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

interface RawVisitTestRow {
  id: string;
  visit_id: string;
  test_id: string;
  status: string | null;
  result_entered_at?: string | null;
}

interface RawInvoiceRow {
  id: string;
  visit_id: string;
  subtotal: number | string | null;
  discount_amount: number | string | null;
  total: number | string | null;
}

export async function pullVisits(client: CloudClient): Promise<PullStats> {
  // Children for every visit in the page, keyed by visit id. Populated by
  // `prepare` so a page costs one extra query rather than one per visit.
  let childrenByVisit = new Map<string, RawVisitTestRow[]>();
  let invoiceByVisit = new Map<string, RawInvoiceRow>();

  return runPull<RawVisitRow>(client, {
    source: SOURCE,
    table: "visits",
    cursorColumn: "updated_at",

    prepare: async (rows) => {
      childrenByVisit = new Map();
      invoiceByVisit = new Map();
      const visitIds = rows.map((r) => r.id);
      if (visitIds.length === 0) return;

      try {
        const all = (await client.fetchVisitTestsForVisits(
          visitIds,
        )) as unknown as RawVisitTestRow[];
        for (const vt of all) {
          const list = childrenByVisit.get(vt.visit_id) ?? [];
          list.push(vt);
          childrenByVisit.set(vt.visit_id, list);
        }
      } catch (e) {
        // Non-fatal: the visits themselves still apply, and their children are
        // re-fetched on the next tick.
        logger.error("cloud", "[pull-visits] fetch visit_tests batch failed", e);
      }

      try {
        const invoices = (await client.fetchInvoicesForVisits(
          visitIds,
        )) as unknown as RawInvoiceRow[];
        for (const inv of invoices) invoiceByVisit.set(inv.visit_id, inv);
      } catch (e) {
        logger.error("cloud", "[pull-visits] fetch invoices batch failed", e);
      }
    },

    shouldApply: (r) => r.source === "admin" && !r.deleted_at,

    applyRow: async (r) => {
      const data = {
        id: r.id,
        visitId: r.visit_id,
        patientId: r.patient_id,
        type: r.type,
        visitDate: new Date(r.visit_date),
        status: r.status,
        staffId: r.staff_id,
        accessCodeHash: r.access_code_hash ?? null,
        // Kept in step so the desktop shows the same answer as the portal about
        // whether this patient can download an unpaid report, whichever screen
        // the Admin used to decide it.
        reportReleaseOverride: r.report_release_override === true,
        reportReleaseOverrideByUserId: r.report_release_override_by_user_id ?? null,
        reportReleaseOverrideAt: r.report_release_override_at
          ? new Date(r.report_release_override_at)
          : null,
        reportReleaseOverrideReason: r.report_release_override_reason ?? null,
        createdAt: new Date(r.created_at),
      };

      await prisma().visit.upsert({ where: { id: r.id }, create: data, update: data });

      for (const vt of childrenByVisit.get(r.id) ?? []) {
        // resultEnteredAt is carried across because the owner's dashboard counts
        // its "tests entered but not locked" backlog from it. Without it, work
        // typed on a phone arrived on the lab PC with nothing marking it as
        // entered, and that backlog read zero however much was waiting.
        const child = {
          status: vt.status ?? "Collected",
          resultEnteredAt: vt.result_entered_at ? new Date(vt.result_entered_at) : null,
        };
        await prisma().visitTest.upsert({
          where: { id: vt.id },
          create: { id: vt.id, visitId: r.id, testId: vt.test_id, ...child },
          update: child,
        });
      }

      await applyInvoice(r.id, invoiceByVisit.get(r.id));
    },
  });
}

/**
 * Materialises the cloud invoice for a staff-portal visit as a local one.
 *
 * Without this the lab PC received the visit but no bill, so a patient registered
 * from a phone never appeared in the desktop's invoice or money views and the
 * payments stream had nothing to attach to.
 *
 * `amountPaid` is deliberately seeded at zero. Money is owned by the payments
 * stream, which *adds* each pulled payment to this figure — copying the cloud's
 * `amount_paid` as well would count the counter payment twice, once here and once
 * when its `payments` row arrives.
 */
async function applyInvoice(visitId: string, inv: RawInvoiceRow | undefined): Promise<void> {
  if (!inv) return;

  const money = {
    subtotal: Number(inv.subtotal ?? 0),
    discountAmount: Number(inv.discount_amount ?? 0),
    total: Number(inv.total ?? 0),
  };

  const existing = await prisma().invoice.findUnique({ where: { visitId } });

  if (!existing) {
    await prisma().invoice.create({
      data: { id: inv.id, visitId, ...money, paymentStatus: "Pending", amountPaid: 0 },
    });
    return;
  }

  if (existing.id !== inv.id) {
    // Two invoices for one visit — the payments stream looks rows up by cloud
    // invoice id, so payments against the cloud copy would never find this one.
    // Leave it alone and say so rather than silently rewriting a bill.
    logger.warn(
      "cloud",
      `[pull-visits] visit ${visitId} has local invoice ${existing.id} but cloud invoice ${inv.id} — leaving local untouched`,
    );
    return;
  }

  // Re-price if the bill changed, but never touch amountPaid/paymentStatus: those
  // belong to the payments stream and rewriting them here would undo payments.
  await prisma().invoice.update({ where: { visitId }, data: money });
}
