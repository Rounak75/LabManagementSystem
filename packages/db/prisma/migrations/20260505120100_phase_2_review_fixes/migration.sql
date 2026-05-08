-- Phase 2 review fixes:
--   1. ReportTemplate.id / BackupLog.id default cuid() -> uuid() (app-side default,
--      no SQL change needed; column type stays TEXT).
--   2. BackupLog.sizeBytes INTEGER -> BIGINT to avoid 32-bit overflow on backups
--      larger than ~2.1 GB. Verified BackupLog has 0 rows at this point, so
--      a simple DROP/CREATE is safe and avoids a RedefineTables dance.
--   3. Add index on BackupLog.createdAt for retention/pruning queries.

-- DropTable (BackupLog is empty; recreate with BIGINT sizeBytes)
DROP TABLE "BackupLog";

-- CreateTable
CREATE TABLE "BackupLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "BackupLog_createdAt_idx" ON "BackupLog"("createdAt");
