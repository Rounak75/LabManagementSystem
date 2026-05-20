import type { PrismaClient } from "@prisma/client";

const GOLMURI_TEMPLATE_CONFIG = {
  layout: "golmuri-standard",
  headerText: "",
  footerText: "",
  signatureLine: "Dr. P. C. Dubey, M.D. (Patho)",
  fontFamily: "Times",
  fontSize: 10,
  accentColor: "#1e293b",
  sections: {
    logo: true,
    doctorInfo: true,
    parametersTable: true,
    abnormalLegend: true,
    disclaimer: false
  },
  columns: {
    testName: true,
    result: true,
    unit: true,
    referenceRange: true,
    flag: true,
    comments: false
  }
};

export async function seedGolmuriTemplate(prisma: PrismaClient): Promise<void> {
  const existing = await prisma.reportTemplate.findFirst({ where: { name: "Golmuri Standard" } });
  if (existing) return;
  await prisma.reportTemplate.create({
    data: {
      name: "Golmuri Standard",
      isDefault: false,
      config: JSON.stringify(GOLMURI_TEMPLATE_CONFIG)
    }
  });
}
