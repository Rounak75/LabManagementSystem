-- AlterTable
ALTER TABLE "Visit" ADD COLUMN "accessCodeHash" TEXT;
ALTER TABLE "Visit" ADD COLUMN "accessCodePlaintext" TEXT;

-- CreateTable
CREATE TABLE "PatientAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT NOT NULL,
    "passwordHash" TEXT,
    "lastLoginAt" DATETIME,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PatientAccount_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookingId" TEXT NOT NULL,
    "patientPhone" TEXT NOT NULL,
    "patientName" TEXT NOT NULL,
    "patientEmail" TEXT,
    "address" TEXT NOT NULL,
    "pincode" TEXT,
    "testIds" TEXT NOT NULL,
    "preferredDate" DATETIME NOT NULL,
    "preferredSlot" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "declineReason" TEXT,
    "approvedByUserId" TEXT,
    "approvedAt" DATETIME,
    "assignedToUserId" TEXT,
    "resultingVisitId" TEXT,
    "resultingPatientId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "sourceIp" TEXT,
    "captchaPassed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PaymentClaim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceId" TEXT NOT NULL,
    "claimedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceIp" TEXT,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'phone_recycled',
    "status" TEXT NOT NULL DEFAULT 'Open',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "resolvedByUserId" TEXT,
    "resolutionNote" TEXT,
    CONSTRAINT "Dispute_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CloudHeartbeat" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "lastPushedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PrinterCalibration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "printerName" TEXT NOT NULL,
    "xOffsetMm" REAL NOT NULL DEFAULT 0,
    "yOffsetMm" REAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LabClosure" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
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
    "backfillCompletedAt" DATETIME,
    "labUpiVpa" TEXT,
    "labUpiPayeeName" TEXT,
    "preferredPaymentGateway" TEXT NOT NULL DEFAULT 'UPI',
    "portalUrl" TEXT
);
INSERT INTO "new_LabSettings" ("backfillCompletedAt", "backupPath", "backupRetentionDays", "backupTime", "childAgeBoundary", "cloudSyncEnabled", "defaultTemplateId", "emailEnabled", "emailFromName", "emailSmtpHost", "emailSmtpPassword", "emailSmtpPort", "emailSmtpUser", "eveningCloseTime", "eveningOpenTime", "id", "isOpenToday", "labAddress", "labEmail", "labLogo", "labName", "labPhone", "labUpiPayeeName", "labUpiVpa", "lastBackupAt", "manualClosureReason", "morningCloseTime", "morningOpenTime", "notificationsEnabled", "pathologistName", "pathologistQuals", "razorpayKeyId", "razorpayKeySecret", "razorpayMode", "razorpayWebhookSecret", "smsApiKey", "smsProvider", "smsSenderId", "smsTemplateHomeVisitReminder", "smsTemplatePaymentDue", "smsTemplatePaymentLink", "smsTemplateReportReady", "smsTemplateReportReadyUnpaid", "smsTemplateReportReadyWithLink", "smsTemplateVisitBooked", "supabaseAnonKey", "supabaseServiceKey", "supabaseUrl", "updatedAt", "weeklyHolidays") SELECT "backfillCompletedAt", "backupPath", "backupRetentionDays", "backupTime", "childAgeBoundary", "cloudSyncEnabled", "defaultTemplateId", "emailEnabled", "emailFromName", "emailSmtpHost", "emailSmtpPassword", "emailSmtpPort", "emailSmtpUser", "eveningCloseTime", "eveningOpenTime", "id", "isOpenToday", "labAddress", "labEmail", "labLogo", "labName", "labPhone", "labUpiPayeeName", "labUpiVpa", "lastBackupAt", "manualClosureReason", "morningCloseTime", "morningOpenTime", "notificationsEnabled", "pathologistName", "pathologistQuals", "razorpayKeyId", "razorpayKeySecret", "razorpayMode", "razorpayWebhookSecret", "smsApiKey", "smsProvider", "smsSenderId", "smsTemplateHomeVisitReminder", "smsTemplatePaymentDue", "smsTemplatePaymentLink", "smsTemplateReportReady", "smsTemplateReportReadyUnpaid", "smsTemplateReportReadyWithLink", "smsTemplateVisitBooked", "supabaseAnonKey", "supabaseServiceKey", "supabaseUrl", "updatedAt", "weeklyHolidays" FROM "LabSettings";
DROP TABLE "LabSettings";
ALTER TABLE "new_LabSettings" RENAME TO "LabSettings";
CREATE TABLE "new_Patient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "sex" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "referredById" TEXT,
    "portalAccountId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Patient_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "Doctor" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Patient_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Patient" ("address", "age", "createdAt", "createdById", "deletedAt", "email", "id", "name", "patientId", "phone", "portalAccountId", "referredById", "sex", "updatedAt") SELECT "address", "age", "createdAt", "createdById", "deletedAt", "email", "id", "name", "patientId", "phone", "portalAccountId", "referredById", "sex", "updatedAt" FROM "Patient";
DROP TABLE "Patient";
ALTER TABLE "new_Patient" RENAME TO "Patient";
CREATE UNIQUE INDEX "Patient_patientId_key" ON "Patient"("patientId");
CREATE INDEX "Patient_phone_idx" ON "Patient"("phone");
CREATE INDEX "Patient_name_idx" ON "Patient"("name");
CREATE INDEX "Patient_deletedAt_idx" ON "Patient"("deletedAt");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "recoveryCodeHash" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "canCollectSamples" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("createdAt", "email", "id", "isActive", "name", "passwordHash", "phone", "recoveryCodeHash", "role", "updatedAt", "username") SELECT "createdAt", "email", "id", "isActive", "name", "passwordHash", "phone", "recoveryCodeHash", "role", "updatedAt", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "PatientAccount_patientId_key" ON "PatientAccount"("patientId");

-- CreateIndex
CREATE INDEX "PatientAccount_patientId_idx" ON "PatientAccount"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_bookingId_key" ON "Booking"("bookingId");

-- CreateIndex
CREATE INDEX "Booking_status_preferredDate_idx" ON "Booking"("status", "preferredDate");

-- CreateIndex
CREATE INDEX "Booking_patientPhone_idx" ON "Booking"("patientPhone");

-- CreateIndex
CREATE INDEX "Booking_createdAt_idx" ON "Booking"("createdAt");

-- CreateIndex
CREATE INDEX "PaymentClaim_invoiceId_expiresAt_idx" ON "PaymentClaim"("invoiceId", "expiresAt");

-- CreateIndex
CREATE INDEX "Dispute_status_createdAt_idx" ON "Dispute"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Dispute_patientId_idx" ON "Dispute"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "PrinterCalibration_printerName_key" ON "PrinterCalibration"("printerName");

-- CreateIndex
CREATE UNIQUE INDEX "LabClosure_date_key" ON "LabClosure"("date");

-- CreateIndex
CREATE INDEX "LabClosure_date_idx" ON "LabClosure"("date");
