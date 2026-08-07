-- Retire the portal access code.
--
-- The 6-character code printed on the report is gone: the patient id it sat
-- beside does the same job, is what staff read out over the phone, and does
-- not need reissuing. The code was the weaker of the two — valid 180 days,
-- opening a full session with no password step, and revocable only by waiting.
--
-- SQLite cannot drop a column in place, so Prisma rebuilds the table. The
-- INSERT below carries every surviving column, and both foreign keys and all
-- three indexes are recreated after the rename.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Visit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "visitId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "visitDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "staffId" TEXT NOT NULL,
    "reportReleaseOverride" BOOLEAN NOT NULL DEFAULT false,
    "reportReleaseOverrideByUserId" TEXT,
    "reportReleaseOverrideAt" DATETIME,
    "reportReleaseOverrideReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Visit_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Visit_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Visit" ("createdAt", "deletedAt", "id", "patientId", "reportReleaseOverride", "reportReleaseOverrideAt", "reportReleaseOverrideByUserId", "reportReleaseOverrideReason", "staffId", "status", "type", "updatedAt", "visitDate", "visitId") SELECT "createdAt", "deletedAt", "id", "patientId", "reportReleaseOverride", "reportReleaseOverrideAt", "reportReleaseOverrideByUserId", "reportReleaseOverrideReason", "staffId", "status", "type", "updatedAt", "visitDate", "visitId" FROM "Visit";
DROP TABLE "Visit";
ALTER TABLE "new_Visit" RENAME TO "Visit";
CREATE UNIQUE INDEX "Visit_visitId_key" ON "Visit"("visitId");
CREATE INDEX "Visit_patientId_idx" ON "Visit"("patientId");
CREATE INDEX "Visit_visitDate_idx" ON "Visit"("visitDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

