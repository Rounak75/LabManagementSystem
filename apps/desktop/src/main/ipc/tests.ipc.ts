import { register } from "@main/ipc";
import { prisma } from "@main/db";
import { requireAdmin, requireSession } from "@main/session";
import { audit } from "@main/services/audit.service";
import { domainError } from "@shared/domain-error";

register("tests:list", async () => {
  requireSession();
  return prisma().test.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: { parameters: { orderBy: { displayOrder: "asc" } } }
  });
});

register("tests:get", async ({ id }: { id: string }) => {
  requireSession();
  const t = await prisma().test.findUnique({ where: { id }, include: { parameters: { orderBy: { displayOrder: "asc" } } } });
  if (!t) throw domainError("NOT_FOUND");
  return t;
});

type CollectionTimeRestriction = "FastingMorningOnly" | "MorningOnly" | "EveningOnly" | null;

const VALID_RESTRICTIONS: ReadonlySet<string> = new Set([
  "FastingMorningOnly", "MorningOnly", "EveningOnly"
]);

function normalizeRestriction(v: unknown): CollectionTimeRestriction {
  if (v == null || v === "") return null;
  if (typeof v === "string" && VALID_RESTRICTIONS.has(v)) return v as CollectionTimeRestriction;
  throw domainError("INVALID_INPUT");
}

/**
 * Refuses a second active test with a name already in use.
 *
 * Nothing enforced this before — not this handler, and not the schema, where
 * `name` carries no unique constraint. The catalogue accumulated fourteen
 * duplicated names that way (209 active tests, 193 distinct), and the patient
 * booking form printed each one twice at two different prices, letting a patient
 * pick either. `catalogue-reconciliation.service.ts` retires duplicates, but
 * only a hardcoded list of legacy names that *differ* from their canonical
 * twin — a same-name pair is invisible to it.
 *
 * Comparison is on lower(trim(name)) via raw SQL because Prisma's
 * `mode: "insensitive"` is a no-op on SQLite: "Lipid Profile", "lipid profile"
 * and "Lipid Profile " would otherwise all be distinct names to the database
 * and identical names to a human reading the booking form.
 *
 * Scoped to active tests on purpose. A deactivated duplicate keeps its name so
 * an old invoice still prints what it was billed as, and that retired name must
 * not block the surviving test from being renamed onto it.
 */
async function assertNameFree(name: string, exceptId?: string): Promise<void> {
  const clash = await prisma().$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Test"
    WHERE lower(trim("name")) = lower(trim(${name}))
      AND "isActive" = 1
      AND "deletedAt" IS NULL
      AND ("id" != ${exceptId ?? ""})
    LIMIT 1
  `;
  if (clash.length > 0) throw domainError("DUPLICATE_TEST_NAME");
}

register("tests:create", async (input: { name: string; category: string; price: number; isOutsourced: boolean; collectionTimeRestriction?: string | null }) => {
  requireAdmin();
  if (!input.name?.trim() || input.price < 0) throw domainError("INVALID_INPUT");
  await assertNameFree(input.name);
  const t = await prisma().test.create({
    data: {
      name: input.name, category: input.category, price: input.price,
      isOutsourced: input.isOutsourced,
      collectionTimeRestriction: normalizeRestriction(input.collectionTimeRestriction)
    }
  });
  await audit("CREATE", "Test", t.id);
  return t;
});

register("tests:update", async (input: { id: string; name: string; category: string; price: number; isOutsourced: boolean; isActive: boolean; collectionTimeRestriction?: string | null }) => {
  requireAdmin();
  const { id, collectionTimeRestriction, ...rest } = input;
  // Renaming an existing test onto a name already in use is the same fault as
  // creating one there, so it is refused the same way. Only checked while the
  // test is staying active: deactivating a duplicate is precisely how the
  // catalogue gets cleaned up, and that must never be blocked by its own name.
  if (input.isActive) await assertNameFree(input.name, id);
  const t = await prisma().test.update({
    where: { id },
    data: { ...rest, collectionTimeRestriction: normalizeRestriction(collectionTimeRestriction) }
  });
  await audit("UPDATE", "Test", id);
  return t;
});

register("tests:remove", async ({ id }: { id: string }) => {
  requireAdmin();
  await prisma().test.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } });
  await audit("DELETE", "Test", id);
  return true;
});

register("params:create", async (input: any) => {
  requireAdmin();
  const { testId, ...rest } = input;
  const p = await prisma().testParameter.create({ data: { testId, ...rest } });
  await audit("CREATE", "TestParameter", p.id);
  return p;
});

register("params:update", async (input: any) => {
  requireAdmin();
  const { id, ...rest } = input;
  const p = await prisma().testParameter.update({ where: { id }, data: rest });
  await audit("UPDATE", "TestParameter", id);
  return p;
});

register("params:remove", async ({ id }: { id: string }) => {
  requireAdmin();
  await prisma().testParameter.delete({ where: { id } });
  await audit("DELETE", "TestParameter", id);
  return true;
});
