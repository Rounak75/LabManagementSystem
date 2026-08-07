import { describe, it, expect } from "vitest";
import { Prisma } from "@lab/db";
import { sanitizeForCloud } from "../prisma-hooks";

// Regression tests for the push failure seen in production:
//
//   push visits/63b83397…: Could not find the 'visit_tests' column of 'visits'
//   in the schema cache [PGRST204]
//
// VisitOrchestrator creates a visit with `include: { visitTests: true }`
// (visit-orchestrator.ts). The outbox hook mirrors whatever Prisma returned, so
// the included relation array was snake_cased to `visit_tests` and pushed as if
// it were a column on `visits`. PostgREST rejected the whole row, the error is
// classified non-retryable, and every visit push failed permanently — which is
// why the admin portal never saw a status move off "Open".
//
// The fix strips relations structurally rather than by name: a cloud column can
// only hold a scalar, so anything array-shaped or object-shaped that is not a
// Date or a Decimal is a Prisma relation and must not be pushed. Blacklisting
// "visitTests" would have fixed today's bug and left the next `include` to
// rediscover it.

describe("sanitizeForCloud strips Prisma relations", () => {
  it("drops an included to-many relation — the exact production failure", () => {
    const row = {
      id: "v1",
      visitId: "VIS-2026-00003",
      status: "Open",
      visitTests: [
        { id: "vt1", testId: "t1", status: "Collected" },
        { id: "vt2", testId: "t2", status: "Collected" },
      ],
    };

    const safe = sanitizeForCloud("Visit", row);

    expect(safe).not.toHaveProperty("visitTests");
    expect(safe.id).toBe("v1");
    expect(safe.visitId).toBe("VIS-2026-00003");
    expect(safe.status).toBe("Open");
  });

  it("drops an included to-one relation", () => {
    const row = {
      id: "v1",
      patientId: "p1",
      patient: { id: "p1", name: "Sujata Mahato", phone: "8102710351" },
    };

    const safe = sanitizeForCloud("Visit", row);

    expect(safe).not.toHaveProperty("patient");
    expect(safe.patientId).toBe("p1");
  });

  it("drops a nested-created relation returned on the result", () => {
    const row = { id: "v1", invoice: { id: "i1", total: "250" } };
    expect(sanitizeForCloud("Visit", row)).not.toHaveProperty("invoice");
  });

  it("drops an empty relation array too", () => {
    // An empty array still serialises to `[]` and PostgREST still rejects the
    // column, so "no children" must not look like a scalar.
    const safe = sanitizeForCloud("Visit", { id: "v1", visitTests: [] });
    expect(safe).not.toHaveProperty("visitTests");
  });
});

describe("sanitizeForCloud keeps everything a cloud column can hold", () => {
  // The regression risk of stripping objects. Decimal is an object, and price /
  // subtotal / total / refRange* are all Decimal in the schema — dropping them
  // would silently push tests with no price and invoices with no total, which is
  // worse than the bug being fixed.
  it("keeps Prisma Decimal values", () => {
    const row = {
      id: "t1",
      name: "Blood Sugar Fasting",
      price: new Prisma.Decimal("150.00"),
    };

    const safe = sanitizeForCloud("Test", row);

    expect(safe).toHaveProperty("price");
    expect(String(safe.price)).toBe("150");
  });

  it("keeps every nullable Decimal on a parameter row", () => {
    const row = {
      id: "tp1",
      refRangeMaleMin: new Prisma.Decimal("70"),
      refRangeMaleMax: new Prisma.Decimal("100"),
      refRangeFemaleMin: null,
    };

    const safe = sanitizeForCloud("TestParameter", row);

    expect(String(safe.refRangeMaleMin)).toBe("70");
    expect(String(safe.refRangeMaleMax)).toBe("100");
    expect(safe.refRangeFemaleMin).toBeNull();
  });

  it("keeps Date values for toSnakePayload to serialise", () => {
    const createdAt = new Date("2026-07-28T10:45:00.000Z");
    const safe = sanitizeForCloud("Visit", { id: "v1", createdAt });
    expect(safe.createdAt).toBeInstanceOf(Date);
    expect((safe.createdAt as Date).toISOString()).toBe("2026-07-28T10:45:00.000Z");
  });

  it("keeps falsy scalars rather than treating them as absent", () => {
    const row = { id: "v1", notes: "", amountPaid: 0, isActive: false, deletedAt: null };
    const safe = sanitizeForCloud("Visit", row);

    expect(safe.notes).toBe("");
    expect(safe.amountPaid).toBe(0);
    expect(safe.isActive).toBe(false);
    expect(safe.deletedAt).toBeNull();
  });
});

describe("sanitizeForCloud keeps its existing guarantees", () => {
  // This used to assert Visit.accessCodePlaintext was stripped. That column is
  // gone with the credential, so the guarantee is pinned to the local-only
  // secret that remains — a desktop-side recovery hash the cloud has no column
  // for, and must never receive.
  it("still strips a desktop-only secret before pushing a User", () => {
    const safe = sanitizeForCloud("User", {
      id: "u1",
      username: "staff1",
      recoveryCodeHash: "$2a$10$hash",
    });

    expect(safe).not.toHaveProperty("recoveryCodeHash");
    expect(safe.username).toBe("staff1");
  });

  it("still strips relation arrays off a Visit", () => {
    const safe = sanitizeForCloud("Visit", {
      id: "v1",
      visitId: "VIS-2026-00001",
      visitTests: [{ id: "vt1" }],
    });

    expect(safe).not.toHaveProperty("visitTests");
    expect(safe.visitId).toBe("VIS-2026-00001");
  });

  it("still remaps the diverging TestResult column names", () => {
    const safe = sanitizeForCloud("TestResult", {
      id: "r1",
      abnormalOverride: true,
      enteredById: "u1",
    });

    expect(safe.isAbnormalOverride).toBe(true);
    expect(safe.enteredByUserId).toBe("u1");
    expect(safe).not.toHaveProperty("abnormalOverride");
    expect(safe).not.toHaveProperty("enteredById");
  });

  it("still allowlists LabSettings to public columns", () => {
    const safe = sanitizeForCloud("LabSettings", {
      id: "singleton",
      labName: "Golmuri Janch Ghar",
      supabaseServiceKey: "v2:secret",
      backupPath: "D:\\backups",
    });

    expect(safe.labName).toBe("Golmuri Janch Ghar");
    expect(safe).not.toHaveProperty("supabaseServiceKey");
    expect(safe).not.toHaveProperty("backupPath");
  });
});
