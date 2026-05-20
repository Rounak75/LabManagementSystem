import { register } from "@main/ipc";
import { prisma } from "@main/db";
import { requireSession } from "@main/session";
import { nextPatientId } from "@main/services/id-generator";
import { audit } from "@main/services/audit.service";
import type { PatientCreateInput } from "@shared/api";

register("patients:create", async (input: PatientCreateInput) => {
  const u = requireSession();
  if (!input.name?.trim() || !input.phone?.trim() || !input.age) throw new Error("INVALID_INPUT");
  // Phase 3d: phone is no longer unique (household sharing). Caller may opt to
  // bypass this soft duplicate check by passing `allowDuplicatePhone: true`.
  if (!input.allowDuplicatePhone) {
    const dup = await prisma().patient.findFirst({ where: { phone: input.phone.trim(), deletedAt: null } });
    if (dup) throw new Error("DUPLICATE_PHONE");
  }
  const patientId = await nextPatientId();
  const p = await prisma().patient.create({
    data: {
      patientId,
      name: input.name.trim(),
      age: input.age,
      sex: input.sex,
      phone: input.phone.trim(),
      address: input.address?.trim() || null,
      email: input.email?.trim() || null,
      referredById: input.referredById || "doctor-self",
      createdById: u.id
    }
  });
  await audit("CREATE", "Patient", p.id);
  return p;
});

register("patients:get", async ({ id }: { id: string }) => {
  requireSession();
  const p = await prisma().patient.findUnique({
    where: { id },
    include: { referredBy: true }
  });
  if (!p) throw new Error("NOT_FOUND");
  return p;
});

register("patients:search", async ({ q }: { q: string }) => {
  requireSession();
  const term = (q ?? "").trim();
  if (!term) return prisma().patient.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  return prisma().patient.findMany({
    where: {
      OR: [
        { name:      { contains: term } },
        { phone:     { contains: term } },
        { patientId: { contains: term } }
      ]
    },
    orderBy: { createdAt: "desc" },
    take: 50
  });
});

register("patients:history", async ({ id }: { id: string }) => {
  requireSession();
  return prisma().visit.findMany({
    where: { patientId: id, deletedAt: null },
    include: {
      visitTests: { include: { test: true } },
      invoice: true
    },
    orderBy: { visitDate: "desc" }
  });
});

register("patients:update", async (input: { id: string } & Partial<PatientCreateInput>) => {
  requireSession();
  const { id, ...rest } = input;
  const data: any = {};
  if (rest.name !== undefined)         data.name = rest.name?.trim();
  if (rest.age !== undefined)          data.age = rest.age;
  if (rest.sex !== undefined)          data.sex = rest.sex;
  if (rest.address !== undefined)      data.address = rest.address?.trim() || null;
  if (rest.email !== undefined)        data.email = rest.email?.trim() || null;
  if (rest.referredById !== undefined) data.referredById = rest.referredById || "doctor-self";
  const p = await prisma().patient.update({ where: { id }, data });
  await audit("UPDATE", "Patient", id);
  return p;
});
