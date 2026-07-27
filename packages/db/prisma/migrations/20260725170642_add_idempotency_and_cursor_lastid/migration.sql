-- AlterTable
ALTER TABLE "SyncCursor" ADD COLUMN "lastId" TEXT;

-- CreateTable
CREATE TABLE "ProcessedCloudPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
