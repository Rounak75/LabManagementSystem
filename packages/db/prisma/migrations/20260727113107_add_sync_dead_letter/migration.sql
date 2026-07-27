-- CreateTable
CREATE TABLE "SyncDeadLetter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "rowId" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "error" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME
);

-- CreateIndex
CREATE INDEX "SyncDeadLetter_resolvedAt_idx" ON "SyncDeadLetter"("resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SyncDeadLetter_source_rowId_key" ON "SyncDeadLetter"("source", "rowId");
