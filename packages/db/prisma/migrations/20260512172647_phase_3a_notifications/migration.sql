-- AlterTable
ALTER TABLE "Patient" ADD COLUMN "email" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "email" TEXT;
ALTER TABLE "User" ADD COLUMN "phone" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "updatedAt" DATETIME NOT NULL,
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "smsProvider" TEXT NOT NULL DEFAULT 'Test',
    "smsApiKey" TEXT,
    "smsSenderId" TEXT,
    "smsTemplateReportReady" TEXT,
    "smsTemplateReportReadyUnpaid" TEXT,
    "smsTemplateVisitBooked" TEXT,
    "smsTemplatePaymentDue" TEXT,
    "smsTemplateHomeVisitReminder" TEXT,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "emailSmtpHost" TEXT DEFAULT 'smtp.gmail.com',
    "emailSmtpPort" INTEGER NOT NULL DEFAULT 587,
    "emailSmtpUser" TEXT,
    "emailSmtpPassword" TEXT,
    "emailFromName" TEXT NOT NULL DEFAULT 'Golmuri Janch Ghar'
);
INSERT INTO "new_LabSettings" ("backupPath", "backupRetentionDays", "backupTime", "childAgeBoundary", "defaultTemplateId", "eveningCloseTime", "eveningOpenTime", "id", "isOpenToday", "labAddress", "labEmail", "labLogo", "labName", "labPhone", "lastBackupAt", "manualClosureReason", "morningCloseTime", "morningOpenTime", "pathologistName", "pathologistQuals", "updatedAt", "weeklyHolidays") SELECT "backupPath", "backupRetentionDays", "backupTime", "childAgeBoundary", "defaultTemplateId", "eveningCloseTime", "eveningOpenTime", "id", "isOpenToday", "labAddress", "labEmail", "labLogo", "labName", "labPhone", "lastBackupAt", "manualClosureReason", "morningCloseTime", "morningOpenTime", "pathologistName", "pathologistQuals", "updatedAt", "weeklyHolidays" FROM "LabSettings";
DROP TABLE "LabSettings";
ALTER TABLE "new_LabSettings" RENAME TO "LabSettings";
CREATE TABLE "new_Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "visitId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "scheduledFor" DATETIME,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" DATETIME,
    "cancelledAt" DATETIME,
    "payload" TEXT,
    "subject" TEXT,
    "messageId" TEXT,
    "sentAt" DATETIME,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Notification_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Notification_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Notification" ("channel", "createdAt", "error", "id", "patientId", "purpose", "recipient", "sentAt", "status", "updatedAt", "visitId") SELECT "channel", "createdAt", "error", "id", "patientId", "purpose", "recipient", "sentAt", "status", "updatedAt", "visitId" FROM "Notification";
DROP TABLE "Notification";
ALTER TABLE "new_Notification" RENAME TO "Notification";
CREATE INDEX "Notification_status_scheduledFor_idx" ON "Notification"("status", "scheduledFor");
CREATE INDEX "Notification_status_nextAttemptAt_idx" ON "Notification"("status", "nextAttemptAt");
CREATE INDEX "Notification_visitId_purpose_idx" ON "Notification"("visitId", "purpose");
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
