-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "details" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "recoveryCodeHash" TEXT;

-- CreateTable
CREATE TABLE "ReportTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "config" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BackupLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- LabSettings: add backupPath, backupRetentionDays, backupTime, lastBackupAt
CREATE TABLE "new_LabSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "labName" TEXT NOT NULL,
    "labAddress" TEXT NOT NULL,
    "labPhone" TEXT NOT NULL,
    "labEmail" TEXT,
    "labLogo" TEXT,
    "morningOpenTime" TEXT NOT NULL,
    "morningCloseTime" TEXT NOT NULL,
    "eveningOpenTime" TEXT,
    "eveningCloseTime" TEXT,
    "weeklyHolidays" TEXT NOT NULL DEFAULT '[]',
    "isOpenToday" BOOLEAN NOT NULL DEFAULT true,
    "manualClosureReason" TEXT,
    "childAgeBoundary" INTEGER NOT NULL DEFAULT 12,
    "pathologistName" TEXT,
    "pathologistQuals" TEXT,
    "defaultTemplateId" TEXT,
    "backupPath" TEXT,
    "backupRetentionDays" INTEGER NOT NULL DEFAULT 14,
    "backupTime" TEXT NOT NULL DEFAULT '02:00',
    "lastBackupAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_LabSettings" ("childAgeBoundary", "defaultTemplateId", "eveningCloseTime", "eveningOpenTime", "id", "isOpenToday", "labAddress", "labEmail", "labLogo", "labName", "labPhone", "manualClosureReason", "morningCloseTime", "morningOpenTime", "pathologistName", "pathologistQuals", "updatedAt", "weeklyHolidays") SELECT "childAgeBoundary", "defaultTemplateId", "eveningCloseTime", "eveningOpenTime", "id", "isOpenToday", "labAddress", "labEmail", "labLogo", "labName", "labPhone", "manualClosureReason", "morningCloseTime", "morningOpenTime", "pathologistName", "pathologistQuals", "updatedAt", "weeklyHolidays" FROM "LabSettings";
DROP TABLE "LabSettings";
ALTER TABLE "new_LabSettings" RENAME TO "LabSettings";

-- Test: rename isOutsourceable -> isOutsourced (preserve data)
CREATE TABLE "new_Test" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "price" DECIMAL NOT NULL,
    "isOutsourced" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "collectionTimeRestriction" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);
INSERT INTO "new_Test" ("category", "collectionTimeRestriction", "createdAt", "deletedAt", "id", "isActive", "isOutsourced", "name", "price", "updatedAt") SELECT "category", "collectionTimeRestriction", "createdAt", "deletedAt", "id", "isActive", "isOutsourceable", "name", "price", "updatedAt" FROM "Test";
DROP TABLE "Test";
ALTER TABLE "new_Test" RENAME TO "Test";

-- VisitTest: rename outsourcedLabName -> outsourcedSentTo (preserve data); add 4 new nullable cols
CREATE TABLE "new_VisitTest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "visitId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Collected',
    "outsourcedSentTo" TEXT,
    "outsourcedExternalRef" TEXT,
    "outsourcedStatus" TEXT,
    "outsourcedSentAt" DATETIME,
    "outsourcedReceivedAt" DATETIME,
    "sampleCollectedAt" DATETIME,
    "resultEnteredAt" DATETIME,
    "verifiedById" TEXT,
    "verifiedAt" DATETIME,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VisitTest_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VisitTest_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Test" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VisitTest_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_VisitTest" ("createdAt", "id", "isLocked", "outsourcedSentTo", "resultEnteredAt", "sampleCollectedAt", "status", "testId", "updatedAt", "verifiedAt", "verifiedById", "visitId") SELECT "createdAt", "id", "isLocked", "outsourcedLabName", "resultEnteredAt", "sampleCollectedAt", "status", "testId", "updatedAt", "verifiedAt", "verifiedById", "visitId" FROM "VisitTest";
DROP TABLE "VisitTest";
ALTER TABLE "new_VisitTest" RENAME TO "VisitTest";
CREATE INDEX "VisitTest_visitId_idx" ON "VisitTest"("visitId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
