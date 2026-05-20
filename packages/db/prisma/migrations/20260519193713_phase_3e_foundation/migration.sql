-- CreateTable
CREATE TABLE "IdReservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "prefix" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "reservedBy" TEXT,
    "reservedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumedAt" DATETIME,
    "consumedBy" TEXT,
    "source" TEXT NOT NULL DEFAULT 'desktop'
);

-- CreateTable
CREATE TABLE "PrintJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "visitId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pickedUpAt" DATETIME,
    "completedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'Queued',
    "errorMessage" TEXT,
    CONSTRAINT "PrintJob_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClientError" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "userAgent" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "loggedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "canEnterResults" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("canCollectSamples", "createdAt", "email", "id", "isActive", "name", "passwordHash", "phone", "recoveryCodeHash", "role", "updatedAt", "username") SELECT "canCollectSamples", "createdAt", "email", "id", "isActive", "name", "passwordHash", "phone", "recoveryCodeHash", "role", "updatedAt", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "IdReservation_prefix_consumedAt_idx" ON "IdReservation"("prefix", "consumedAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdReservation_prefix_number_key" ON "IdReservation"("prefix", "number");

-- CreateIndex
CREATE INDEX "PrintJob_status_requestedAt_idx" ON "PrintJob"("status", "requestedAt");

-- CreateIndex
CREATE INDEX "ClientError_loggedAt_idx" ON "ClientError"("loggedAt");
