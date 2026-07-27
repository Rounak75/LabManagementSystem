-- CreateTable
CREATE TABLE "SyncTickLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pushed" INTEGER NOT NULL,
    "pulled" INTEGER NOT NULL,
    "failed" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "errors" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "SyncTickLog_createdAt_idx" ON "SyncTickLog"("createdAt");
