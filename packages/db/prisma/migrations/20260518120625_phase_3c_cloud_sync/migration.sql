-- CreateTable
CREATE TABLE "Outbox" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tableName" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "rowId" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" DATETIME
);

-- CreateTable
CREATE TABLE "SyncCursor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "lastSyncedAt" DATETIME NOT NULL
);

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
    "emailFromName" TEXT NOT NULL DEFAULT 'Golmuri Janch Ghar',
    "razorpayMode" TEXT NOT NULL DEFAULT 'Off',
    "razorpayKeyId" TEXT,
    "razorpayKeySecret" TEXT,
    "razorpayWebhookSecret" TEXT,
    "smsTemplatePaymentLink" TEXT,
    "smsTemplateReportReadyWithLink" TEXT,
    "cloudSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "supabaseUrl" TEXT,
    "supabaseAnonKey" TEXT,
    "supabaseServiceKey" TEXT,
    "backfillCompletedAt" DATETIME
);
INSERT INTO "new_LabSettings" ("backupPath", "backupRetentionDays", "backupTime", "childAgeBoundary", "defaultTemplateId", "emailEnabled", "emailFromName", "emailSmtpHost", "emailSmtpPassword", "emailSmtpPort", "emailSmtpUser", "eveningCloseTime", "eveningOpenTime", "id", "isOpenToday", "labAddress", "labEmail", "labLogo", "labName", "labPhone", "lastBackupAt", "manualClosureReason", "morningCloseTime", "morningOpenTime", "notificationsEnabled", "pathologistName", "pathologistQuals", "razorpayKeyId", "razorpayKeySecret", "razorpayMode", "razorpayWebhookSecret", "smsApiKey", "smsProvider", "smsSenderId", "smsTemplateHomeVisitReminder", "smsTemplatePaymentDue", "smsTemplatePaymentLink", "smsTemplateReportReady", "smsTemplateReportReadyUnpaid", "smsTemplateReportReadyWithLink", "smsTemplateVisitBooked", "updatedAt", "weeklyHolidays") SELECT "backupPath", "backupRetentionDays", "backupTime", "childAgeBoundary", "defaultTemplateId", "emailEnabled", "emailFromName", "emailSmtpHost", "emailSmtpPassword", "emailSmtpPort", "emailSmtpUser", "eveningCloseTime", "eveningOpenTime", "id", "isOpenToday", "labAddress", "labEmail", "labLogo", "labName", "labPhone", "lastBackupAt", "manualClosureReason", "morningCloseTime", "morningOpenTime", "notificationsEnabled", "pathologistName", "pathologistQuals", "razorpayKeyId", "razorpayKeySecret", "razorpayMode", "razorpayWebhookSecret", "smsApiKey", "smsProvider", "smsSenderId", "smsTemplateHomeVisitReminder", "smsTemplatePaymentDue", "smsTemplatePaymentLink", "smsTemplateReportReady", "smsTemplateReportReadyUnpaid", "smsTemplateReportReadyWithLink", "smsTemplateVisitBooked", "updatedAt", "weeklyHolidays" FROM "LabSettings";
DROP TABLE "LabSettings";
ALTER TABLE "new_LabSettings" RENAME TO "LabSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Outbox_status_nextAttemptAt_idx" ON "Outbox"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "Outbox_createdAt_idx" ON "Outbox"("createdAt");

-- CreateIndex
CREATE INDEX "Outbox_tableName_rowId_idx" ON "Outbox"("tableName", "rowId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncCursor_source_key" ON "SyncCursor"("source");
