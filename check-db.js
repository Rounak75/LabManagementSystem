const { PrismaClient } = require('./packages/db/node_modules/@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const syncLogs = await prisma.syncLog.findMany();
  console.log("SyncLogs:", syncLogs);
  const cursors = await prisma.syncCursor.findMany();
  console.log("Cursors:", cursors);
  const patients = await prisma.patient.findMany({ select: { id: true, name: true }});
  console.log("Patients:", patients);
}
main().catch(console.error).finally(() => prisma.$disconnect());
