import { prisma } from "@main/db";

/**
 * Allocates the human-facing LAB-YYYY-NNNNN / VIS-YYYY-NNNNN identifiers.
 *
 * There are two allocators in this system and they share no state. This one
 * reads its high-water mark from local SQLite; the admin portal reads its own
 * from cloud `id_reservations` via the reserve-visit-id Edge Function. Nothing
 * pulls cloud reservations down — sync-registry has no handler for them — so
 * this side used to be blind to anything the portal allocated:
 *
 *   push id_reservations/…: duplicate key value violates unique constraint
 *   "id_reservations_prefix_number_key" [23505]
 *
 * That error is the cloud constraint refusing to record the same number twice,
 * and it is not the real damage. By the time it fires this side has already
 * stamped the number onto a visit, so two visits carry the same
 * VIS-2026-NNNNN — and a unique constraint cannot un-print a report that has
 * already gone out with the wrong one on it.
 *
 * So the question asked here is no longer "what have I reserved?" but "what
 * number is provably taken?", and a number is taken if it appears on any Visit
 * or Patient row, whoever created it. Rows created in the portal arrive through
 * the existing pull handlers, so this needs no extra network call and still
 * works with the internet down — the desktop being offline-first is the point of
 * the architecture, and an allocator that had to phone the cloud would undo it.
 */

/**
 * The sequence number inside a formatted id, or 0 when there isn't one.
 *
 * Zero rather than null: every caller feeds this into a Math.max across several
 * sources, and "no evidence" is the identity for that. A malformed id must not
 * throw — that would stop the lab registering patients over one bad row.
 */
export function numberFromId(id: string | null | undefined, prefix: string): number {
  if (!id || !id.startsWith(prefix)) return 0;
  const tail = id.slice(prefix.length);
  if (!/^\d+$/.test(tail)) return 0;
  const n = Number(tail);
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
}

/**
 * The highest number already used for this prefix, across every local source.
 *
 * Ids are zero-padded to five digits, so ordering them as strings matches
 * ordering them numerically and Prisma can do it in the query rather than
 * loading the table.
 */
async function highestUsed(kind: "LAB" | "VIS", prefix: string, year: number): Promise<number> {
  const reservation = await prisma().idReservation.findFirst({
    where: { prefix },
    orderBy: { number: "desc" },
    select: { number: true },
  });

  const counterId = `${kind === "LAB" ? "patient" : "visit"}:${year}`;
  const counter = await prisma().idCounter.findUnique({ where: { id: counterId } });

  // The source the old code was missing: an id the portal allocated, since
  // synced down and sitting on a real row. Patients and visits are independent
  // series, so each prefix consults only its own table — crossing them would
  // burn ids in the other series for no reason.
  let stamped = 0;
  if (kind === "VIS") {
    const visit = await prisma().visit.findFirst({
      where: { visitId: { startsWith: prefix } },
      orderBy: { visitId: "desc" },
      select: { visitId: true },
    });
    stamped = numberFromId(visit?.visitId, prefix);
  } else {
    const patient = await prisma().patient.findFirst({
      where: { patientId: { startsWith: prefix } },
      orderBy: { patientId: "desc" },
      select: { patientId: true },
    });
    stamped = numberFromId(patient?.patientId, prefix);
  }

  return Math.max(reservation?.number ?? 0, counter?.lastValue ?? 0, stamped);
}

async function nextWithPrefix(kind: "LAB" | "VIS", at: Date): Promise<string> {
  const year = at.getUTCFullYear();
  const prefix = `${kind}-${year}-`;

  for (let attempt = 0; attempt < 20; attempt++) {
    // Recomputed every attempt. The old code fell back to the counter only when
    // the reservation table was empty, so a counter ahead of the reservations
    // was ignored the moment a single reservation existed.
    const next = (await highestUsed(kind, prefix, year)) + 1;

    try {
      await prisma().idReservation.create({
        data: {
          prefix,
          number: next,
          source: "desktop",
          consumedAt: new Date(),
        },
      });
      const counterId = `${kind === "LAB" ? "patient" : "visit"}:${year}`;
      await prisma().idCounter.upsert({
        where: { id: counterId },
        create: { id: counterId, lastValue: next },
        update: { lastValue: next },
      });
      return `${prefix}${String(next).padStart(5, "0")}`;
    } catch (e: any) {
      // Another local writer took this number between the read and the insert.
      // Loop and recompute rather than assuming next + 1 is free.
      if (e?.code === "P2002") continue;
      throw e;
    }
  }
  throw new Error("id-generator: too many races on " + prefix);
}

export const nextPatientId = (at: Date = new Date()) => nextWithPrefix("LAB", at);
export const nextVisitId = (at: Date = new Date()) => nextWithPrefix("VIS", at);
