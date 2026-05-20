-- AlterTable
ALTER TABLE "Patient" ADD COLUMN "deletedAt" DATETIME;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TestParameter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "testId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "resultType" TEXT NOT NULL DEFAULT 'Numeric',
    "refRangeMaleMin" DECIMAL,
    "refRangeMaleMax" DECIMAL,
    "refRangeFemaleMin" DECIMAL,
    "refRangeFemaleMax" DECIMAL,
    "refRangeChildMin" DECIMAL,
    "refRangeChildMax" DECIMAL,
    "qualitativeOptions" TEXT,
    "normalQualitative" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "computeRule" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TestParameter_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Test" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TestParameter" ("createdAt", "displayOrder", "id", "name", "normalQualitative", "qualitativeOptions", "refRangeChildMax", "refRangeChildMin", "refRangeFemaleMax", "refRangeFemaleMin", "refRangeMaleMax", "refRangeMaleMin", "resultType", "testId", "unit", "updatedAt") SELECT "createdAt", "displayOrder", "id", "name", "normalQualitative", "qualitativeOptions", "refRangeChildMax", "refRangeChildMin", "refRangeFemaleMax", "refRangeFemaleMin", "refRangeMaleMax", "refRangeMaleMin", "resultType", "testId", "unit", "updatedAt" FROM "TestParameter";
DROP TABLE "TestParameter";
ALTER TABLE "new_TestParameter" RENAME TO "TestParameter";
CREATE TABLE "new_TestResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "visitTestId" TEXT NOT NULL,
    "parameterId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "isAbnormal" BOOLEAN NOT NULL DEFAULT false,
    "abnormalOverride" BOOLEAN,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "enteredById" TEXT NOT NULL,
    "enteredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TestResult_visitTestId_fkey" FOREIGN KEY ("visitTestId") REFERENCES "VisitTest" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TestResult_parameterId_fkey" FOREIGN KEY ("parameterId") REFERENCES "TestParameter" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TestResult_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_TestResult" ("enteredAt", "enteredById", "id", "isAbnormal", "parameterId", "updatedAt", "value", "visitTestId") SELECT "enteredAt", "enteredById", "id", "isAbnormal", "parameterId", "updatedAt", "value", "visitTestId" FROM "TestResult";
DROP TABLE "TestResult";
ALTER TABLE "new_TestResult" RENAME TO "TestResult";
CREATE UNIQUE INDEX "TestResult_visitTestId_parameterId_key" ON "TestResult"("visitTestId", "parameterId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Patient_deletedAt_idx" ON "Patient"("deletedAt");
