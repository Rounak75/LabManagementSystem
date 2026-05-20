import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // "Self" doctor — fixed, never deletable
  await prisma.doctor.upsert({
    where: { id: "doctor-self" },
    update: {},
    create: { id: "doctor-self", name: "Self", clinic: null, isActive: true }
  });

  // Common starter tests (full list to be added by Admin via UI later)
  const starters = [
    { name: "Complete Blood Count (CBC)", category: "Blood", price: 300 },
    { name: "Lipid Profile",              category: "Blood", price: 600 },
    { name: "Liver Function Test (LFT)",  category: "Blood", price: 700 },
    { name: "Kidney Function Test (KFT)", category: "Blood", price: 700 },
    { name: "Blood Sugar Fasting",        category: "Blood", price: 80  },
    { name: "Blood Sugar PP",             category: "Blood", price: 80  },
    { name: "Blood Group",                category: "Blood", price: 100 },
    { name: "ESR",                        category: "Blood", price: 80  },
    { name: "Dengue Card",                category: "Blood", price: 600 },
    { name: "Malaria Card",               category: "Blood", price: 250 },
    { name: "Urine Routine",              category: "Urine", price: 120 },
    { name: "Urine Culture",              category: "Urine", price: 400 },
    { name: "Thyroid Profile (T3/T4/TSH)", category: "Blood", price: 500 } // outsourced
  ];
  for (const t of starters) {
    const existing = await prisma.test.findFirst({ where: { name: t.name } });
    if (!existing) {
      await prisma.test.create({
        data: { ...t, isOutsourced: t.name.startsWith("Thyroid"), isActive: true }
      });
    }
  }

  // Per-year ID counters initialized lazily; nothing to seed here.

  // LabSettings singleton — placeholder; first-run wizard overwrites these
  await prisma.labSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      labName: "Golmuri Janch Ghar",
      labAddress: "Main Road, Golmuri Chowk, Jamshedpur",
      labPhone: "6202924306",
      morningOpenTime: "08:00",
      morningCloseTime: "13:00",
      eveningOpenTime: "18:00",
      eveningCloseTime: "20:00",
      weeklyHolidays: JSON.stringify(["Sunday-Evening"]),
      childAgeBoundary: 12,
      notificationsEnabled: false,
      smsProvider: "Test",
      emailEnabled: false,
      emailSmtpHost: "smtp.gmail.com",
      emailSmtpPort: 587,
      emailFromName: "Golmuri Janch Ghar",
      razorpayMode: "Off",
      cloudSyncEnabled: false
    }
  });

  const existing = await prisma.reportTemplate.findFirst();
  if (!existing) {
    // Create default template AND link it on LabSettings atomically.
    // If either op fails, neither is committed — preventing the orphaned
    // state where the template exists but defaultTemplateId stays NULL
    // (which would make subsequent seed runs skip the link forever).
    const newId = (await import("node:crypto")).randomUUID();
    await prisma.$transaction([
      prisma.reportTemplate.create({
        data: {
          id: newId,
          name: "Default",
          isDefault: true,
          config: JSON.stringify({
            headerText: "",
            footerText: "",
            signatureLine: "",
            fontFamily: "Inter",
            fontSize: 11,
            accentColor: "#0f766e",
            sections: { logo: true, doctorInfo: true, parametersTable: true, abnormalLegend: true, disclaimer: true },
            columns: { testName: true, result: true, unit: true, referenceRange: true, flag: true, comments: false },
          }),
        },
      }),
      prisma.labSettings.update({
        where: { id: "singleton" },
        data: { defaultTemplateId: newId },
      }),
    ]);
  }

  // Defensive re-link: if for any reason LabSettings.defaultTemplateId is NULL
  // but a default ReportTemplate exists, fix the link. Idempotent safety net.
  const settings = await prisma.labSettings.findUnique({ where: { id: "singleton" } });
  if (settings && !settings.defaultTemplateId) {
    const defaultTpl =
      (await prisma.reportTemplate.findFirst({ where: { isDefault: true } })) ??
      (await prisma.reportTemplate.findFirst());
    if (defaultTpl) {
      await prisma.labSettings.update({
        where: { id: "singleton" },
        data: { defaultTemplateId: defaultTpl.id },
      });
    }
  }

  console.log("Seed complete.");
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
