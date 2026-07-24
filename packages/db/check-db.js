const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "file:C:/Users/Rouna/AppData/Roaming/@lab/desktop/lab.sqlite"
    }
  }
});
async function main() {
  const syncLogs = await prisma.syncLog.findMany();
  console.log("SyncLogs:", syncLogs);
  const cursors = await prisma.syncCursor.findMany();
  console.log("Cursors:", cursors);
  const patients = await prisma.patient.findMany({ select: { id: true, name: true, createdAt: true, patientId: true }});
  console.log("Patients:", patients);
  const users = await prisma.user.findMany({ select: { id: true, name: true }});
  console.log("Users:", users);
}
main().catch(console.error).finally(() => prisma.$disconnect());
