const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: { db: { url: "file:C:/Users/Rouna/AppData/Roaming/@lab/desktop/lab.sqlite" } }
});
async function main() {
  const patients = await prisma.patient.findMany({ select: { id: true, name: true, patientId: true, createdAt: true }});
  console.log("Local patients:", patients);
  const visits = await prisma.visit.findMany({ select: { id: true, visitId: true, patientId: true, status: true, createdAt: true }});
  console.log("Local visits:", visits);
}
main().catch(console.error).finally(() => prisma.$disconnect());
