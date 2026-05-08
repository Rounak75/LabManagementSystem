import { describe, it, expect, beforeEach, vi } from "vitest";

type FakeTest = {
  id: string;
  name: string;
  price: number;
  isOutsourced: boolean;
};

type FakeVisit = {
  id: string;
  visitId: string;
  patientId: string;
  type: string;
  visitDate: Date;
  status: string;
  staffId: string;
};

type FakeVisitTest = {
  id: string;
  visitId: string;
  testId: string;
  status: string;
  outsourcedSentTo: string | null;
  outsourcedExternalRef: string | null;
  outsourcedStatus: string | null;
  outsourcedSentAt: Date | null;
  outsourcedReceivedAt: Date | null;
  sampleCollectedAt: Date | null;
  resultEnteredAt: Date | null;
  verifiedById: string | null;
  verifiedAt: Date | null;
  isLocked: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type FakeAuditLog = {
  id: string;
  userId: string;
  action: string;
  targetEntity: string;
  targetId: string;
  details: string | null;
};

type FakeInvoice = { id: string; visitId: string; subtotal: number; total: number; paymentStatus: string; amountPaid: number };

const tests: FakeTest[] = [];
const visits: FakeVisit[] = [];
const visitTests: FakeVisitTest[] = [];
const invoices: FakeInvoice[] = [];
const auditLogs: FakeAuditLog[] = [];
let visitCounter = 0;
let visitTestCounter = 0;
let invoiceCounter = 0;
let auditCounter = 0;

const fakePrisma = {
  test: {
    findMany: async ({ where }: any) => {
      if (where?.id?.in) return tests.filter(t => where.id.in.includes(t.id));
      return [...tests];
    },
    findUnique: async ({ where }: any) => tests.find(t => t.id === where.id) ?? null
  },
  visit: {
    create: async ({ data, include }: any) => {
      const v: FakeVisit = {
        id: `v-${++visitCounter}`,
        visitId: data.visitId,
        patientId: data.patientId,
        type: data.type,
        visitDate: data.visitDate ?? new Date(),
        status: data.status ?? "Open",
        staffId: data.staffId
      };
      visits.push(v);
      const created: FakeVisitTest[] = [];
      // nested visitTests create
      if (data.visitTests?.create) {
        for (const vt of data.visitTests.create) {
          const row: FakeVisitTest = {
            id: `vt-${++visitTestCounter}`,
            visitId: v.id,
            testId: vt.testId,
            status: vt.status ?? "Collected",
            outsourcedSentTo: vt.outsourcedSentTo ?? null,
            outsourcedExternalRef: vt.outsourcedExternalRef ?? null,
            outsourcedStatus: vt.outsourcedStatus ?? null,
            outsourcedSentAt: vt.outsourcedSentAt ?? null,
            outsourcedReceivedAt: vt.outsourcedReceivedAt ?? null,
            sampleCollectedAt: vt.sampleCollectedAt ?? null,
            resultEnteredAt: null,
            verifiedById: null,
            verifiedAt: null,
            isLocked: false,
            createdAt: new Date(),
            updatedAt: new Date()
          };
          visitTests.push(row);
          created.push(row);
        }
      }
      if (data.invoice?.create) {
        invoices.push({
          id: `inv-${++invoiceCounter}`,
          visitId: v.id,
          subtotal: data.invoice.create.subtotal,
          total: data.invoice.create.total,
          paymentStatus: data.invoice.create.paymentStatus,
          amountPaid: data.invoice.create.amountPaid
        });
      }
      if (include?.visitTests) {
        return { ...v, visitTests: created };
      }
      return v;
    }
  },
  visitTest: {
    findUnique: async ({ where }: any) => visitTests.find(vt => vt.id === where.id) ?? null,
    findMany: async ({ where, orderBy }: any = {}) => {
      let rows = [...visitTests];
      if (where?.outsourcedStatus !== undefined) {
        rows = rows.filter(r => r.outsourcedStatus === where.outsourcedStatus);
      }
      if (orderBy?.outsourcedSentAt === "asc") {
        rows.sort((a, b) => {
          const at = a.outsourcedSentAt?.getTime() ?? 0;
          const bt = b.outsourcedSentAt?.getTime() ?? 0;
          return at - bt;
        });
      }
      return rows;
    },
    update: async ({ where, data }: any) => {
      const row = visitTests.find(vt => vt.id === where.id);
      if (!row) throw new Error("not found");
      Object.assign(row, data);
      row.updatedAt = new Date();
      return row;
    }
  },
  auditLog: {
    create: async ({ data }: any) => {
      const row: FakeAuditLog = {
        id: `audit-${++auditCounter}`,
        userId: data.userId,
        action: data.action,
        targetEntity: data.targetEntity,
        targetId: data.targetId,
        details: data.details ?? null
      };
      auditLogs.push(row);
      return row;
    }
  },
  $transaction: async (ops: any[]) => Promise.all(ops)
};

vi.mock("@main/db", () => ({ prisma: () => fakePrisma }));
vi.mock("@main/services/id-generator", () => ({
  nextVisitId: async () => `V-${Date.now()}-${Math.floor(Math.random() * 1000)}`
}));

import { setSession } from "@main/session";
import { register } from "@main/ipc";

// Map of registered handlers we capture from the IPC modules.
const handlers = new Map<string, (p: any) => Promise<any>>();
vi.mock("@main/ipc", async (importOriginal) => {
  const orig: any = await importOriginal();
  return {
    ...orig,
    register: (channel: string, handler: any) => {
      handlers.set(channel, handler);
    }
  };
});

// After the mock, import the IPC modules so they call our spy register.
await import("@main/ipc/visits.ipc");
await import("@main/ipc/outsourced.ipc");

beforeEach(() => {
  tests.length = 0;
  visits.length = 0;
  visitTests.length = 0;
  invoices.length = 0;
  auditLogs.length = 0;
  visitCounter = 0;
  visitTestCounter = 0;
  invoiceCounter = 0;
  auditCounter = 0;
  setSession({ id: "actor", username: "actor", name: "Actor", role: "Admin" });
});

function seedOutsourcedTest(id = "test-out"): FakeTest {
  const t: FakeTest = { id, name: `Test ${id}`, price: 500, isOutsourced: true };
  tests.push(t);
  return t;
}

function seedRegularTest(id = "test-reg"): FakeTest {
  const t: FakeTest = { id, name: `Test ${id}`, price: 100, isOutsourced: false };
  tests.push(t);
  return t;
}

describe("outsourced visit-creation hook", () => {
  it("populates outsourced fields on a VisitTest when test is outsourced and sentTo is provided", async () => {
    const t = seedOutsourcedTest();
    const create = handlers.get("visits:create")!;
    await create({
      patientId: "patient-1",
      type: "OPD",
      testIds: [t.id],
      tests: [{ testId: t.id, outsourcedSentTo: "SRL Diagnostics", outsourcedExternalRef: "EXT-1" }]
    });

    expect(visitTests).toHaveLength(1);
    const vt = visitTests[0]!;
    expect(vt.outsourcedStatus).toBe("Sent");
    expect(vt.outsourcedSentTo).toBe("SRL Diagnostics");
    expect(vt.outsourcedExternalRef).toBe("EXT-1");
    expect(vt.outsourcedSentAt).toBeInstanceOf(Date);

    // audit entry created
    expect(auditLogs.some(a => a.action === "OUTSOURCED_SENT" && a.targetId === vt.id)).toBe(true);
  });

  it("does NOT populate outsourced fields for a non-outsourced test even if client sends data", async () => {
    const t = seedRegularTest();
    const create = handlers.get("visits:create")!;
    await create({
      patientId: "patient-1",
      type: "OPD",
      testIds: [t.id],
      tests: [{ testId: t.id, outsourcedSentTo: "Should Be Ignored" }]
    });

    expect(visitTests).toHaveLength(1);
    expect(visitTests[0]!.outsourcedStatus).toBeNull();
    expect(visitTests[0]!.outsourcedSentTo).toBeNull();
  });
});

describe("outsourced:markReceived state machine", () => {
  it("transitions a Sent row to Received and populates outsourcedReceivedAt", async () => {
    const t = seedOutsourcedTest();
    const create = handlers.get("visits:create")!;
    await create({
      patientId: "patient-1",
      type: "OPD",
      testIds: [t.id],
      tests: [{ testId: t.id, outsourcedSentTo: "SRL" }]
    });
    const vt = visitTests[0]!;
    expect(vt.outsourcedStatus).toBe("Sent");

    const markReceived = handlers.get("outsourced:markReceived")!;
    const result = await markReceived({ visitTestId: vt.id });
    expect(result).toEqual({ ok: true });
    expect(vt.outsourcedStatus).toBe("Received");
    expect(vt.outsourcedReceivedAt).toBeInstanceOf(Date);
  });

  it("throws INVALID_STATE when called on a row with outsourcedStatus null", async () => {
    const t = seedRegularTest();
    const create = handlers.get("visits:create")!;
    await create({
      patientId: "patient-1",
      type: "OPD",
      testIds: [t.id]
    });
    const vt = visitTests[0]!;
    expect(vt.outsourcedStatus).toBeNull();

    const markReceived = handlers.get("outsourced:markReceived")!;
    await expect(markReceived({ visitTestId: vt.id })).rejects.toThrow("INVALID_STATE");
  });

  it("throws INVALID_STATE when called on a row already Received", async () => {
    const t = seedOutsourcedTest();
    const create = handlers.get("visits:create")!;
    await create({
      patientId: "patient-1",
      type: "OPD",
      testIds: [t.id],
      tests: [{ testId: t.id, outsourcedSentTo: "SRL" }]
    });
    const vt = visitTests[0]!;

    const markReceived = handlers.get("outsourced:markReceived")!;
    await markReceived({ visitTestId: vt.id });
    expect(vt.outsourcedStatus).toBe("Received");

    await expect(markReceived({ visitTestId: vt.id })).rejects.toThrow("INVALID_STATE");
  });
});

describe("outsourced:list", () => {
  it("returns only rows with outsourcedStatus 'Sent', ordered by outsourcedSentAt ascending", async () => {
    const t = seedOutsourcedTest("t-out-1");
    const create = handlers.get("visits:create")!;

    // Create three outsourced visit-tests at different times
    const earliest = new Date("2026-01-01T10:00:00Z");
    const middle = new Date("2026-01-01T11:00:00Z");
    const latest = new Date("2026-01-01T12:00:00Z");

    await create({
      patientId: "p1", type: "OPD", testIds: [t.id],
      tests: [{ testId: t.id, outsourcedSentTo: "Lab A" }]
    });
    visitTests[visitTests.length - 1]!.outsourcedSentAt = middle;

    await create({
      patientId: "p2", type: "OPD", testIds: [t.id],
      tests: [{ testId: t.id, outsourcedSentTo: "Lab B" }]
    });
    visitTests[visitTests.length - 1]!.outsourcedSentAt = earliest;

    await create({
      patientId: "p3", type: "OPD", testIds: [t.id],
      tests: [{ testId: t.id, outsourcedSentTo: "Lab C" }]
    });
    visitTests[visitTests.length - 1]!.outsourcedSentAt = latest;

    // Mark one as received — should NOT appear in list
    const markReceived = handlers.get("outsourced:markReceived")!;
    await markReceived({ visitTestId: visitTests[0]!.id });

    const list = handlers.get("outsourced:list")!;
    const rows = await list(undefined);

    expect(rows).toHaveLength(2);
    expect(rows.every((r: any) => r.outsourcedStatus === "Sent")).toBe(true);
    // ordered ascending by outsourcedSentAt
    expect(rows[0].outsourcedSentTo).toBe("Lab B"); // earliest
    expect(rows[1].outsourcedSentTo).toBe("Lab C"); // latest
  });
});
