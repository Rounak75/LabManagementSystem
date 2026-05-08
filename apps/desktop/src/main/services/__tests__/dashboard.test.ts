import { describe, it, expect, beforeEach, vi } from "vitest";

type FakeVisit = {
  id: string;
  status: string;
  visitDate: Date;
  updatedAt: Date;
};

type FakeVisitTest = {
  id: string;
  isLocked: boolean;
  resultEnteredAt: Date | null;
  outsourcedStatus: string | null;
  createdAt: Date;
};

type FakeInvoice = {
  id: string;
  total: number;
  amountPaid: number;
  discountAmount: number;
  createdAt: Date;
};

const visits: FakeVisit[] = [];
const visitTests: FakeVisitTest[] = [];
const invoices: FakeInvoice[] = [];

function inRange(d: Date, gte: Date | undefined, lt: Date | undefined): boolean {
  if (gte && d < gte) return false;
  if (lt && d >= lt) return false;
  return true;
}

const fakePrisma = {
  visit: {
    count: async ({ where }: any = {}) => {
      return visits.filter((v) => {
        if (where?.visitDate) {
          if (!inRange(v.visitDate, where.visitDate.gte, where.visitDate.lt)) return false;
        }
        if (where?.updatedAt) {
          if (!inRange(v.updatedAt, where.updatedAt.gte, where.updatedAt.lt)) return false;
        }
        if (where?.status !== undefined) {
          if (typeof where.status === "string") {
            if (v.status !== where.status) return false;
          } else if (where.status?.not !== undefined) {
            if (v.status === where.status.not) return false;
          }
        }
        return true;
      }).length;
    }
  },
  visitTest: {
    count: async ({ where }: any = {}) => {
      return visitTests.filter((vt) => {
        if (where?.createdAt) {
          if (!inRange(vt.createdAt, where.createdAt.gte, where.createdAt.lt)) return false;
        }
        if (where?.isLocked !== undefined && vt.isLocked !== where.isLocked) return false;
        if (where?.resultEnteredAt?.not !== undefined) {
          if (where.resultEnteredAt.not === null && vt.resultEnteredAt === null) return false;
        }
        if (where?.outsourcedStatus !== undefined && vt.outsourcedStatus !== where.outsourcedStatus) return false;
        return true;
      }).length;
    }
  },
  invoice: {
    findMany: async ({ where, select }: any = {}) => {
      void select;
      return invoices.filter((i) => {
        if (where?.createdAt) {
          if (!inRange(i.createdAt, where.createdAt.gte, where.createdAt.lt)) return false;
        }
        return true;
      }).map((i) => ({
        total: i.total,
        amountPaid: i.amountPaid,
        discountAmount: i.discountAmount
      }));
    }
  }
};

vi.mock("@main/db", () => ({ prisma: () => fakePrisma }));

import { setSession } from "@main/session";
import { register } from "@main/ipc";

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

await import("@main/ipc/dashboard.ipc");

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfYesterday(): Date {
  const d = startOfToday();
  d.setDate(d.getDate() - 1);
  return d;
}

function noonToday(): Date {
  const d = startOfToday();
  d.setHours(12, 0, 0, 0);
  return d;
}

function noonYesterday(): Date {
  const d = startOfYesterday();
  d.setHours(12, 0, 0, 0);
  return d;
}

beforeEach(() => {
  visits.length = 0;
  visitTests.length = 0;
  invoices.length = 0;

  // 3 visits today, 2 visits yesterday
  visits.push(
    { id: "v-t-1", status: "Open", visitDate: noonToday(), updatedAt: noonToday() },
    { id: "v-t-2", status: "Open", visitDate: noonToday(), updatedAt: noonToday() },
    { id: "v-t-3", status: "Completed", visitDate: noonToday(), updatedAt: noonToday() },
    { id: "v-y-1", status: "Open", visitDate: noonYesterday(), updatedAt: noonYesterday() },
    { id: "v-y-2", status: "Completed", visitDate: noonYesterday(), updatedAt: noonYesterday() }
  );

  // 5 VisitTests created today
  for (let i = 0; i < 5; i++) {
    visitTests.push({
      id: `vt-${i + 1}`,
      isLocked: false,
      resultEnteredAt: null,
      outsourcedStatus: null,
      createdAt: noonToday()
    });
  }

  // pendingResults: 1 with resultEnteredAt non-null and isLocked false
  visitTests.push({
    id: "vt-pending-1",
    isLocked: false,
    resultEnteredAt: noonToday(),
    outsourcedStatus: null,
    createdAt: noonToday()
  });

  // 2 outsourced Sent
  visitTests.push(
    {
      id: "vt-out-1",
      isLocked: false,
      resultEnteredAt: null,
      outsourcedStatus: "Sent",
      createdAt: noonToday()
    },
    {
      id: "vt-out-2",
      isLocked: false,
      resultEnteredAt: null,
      outsourcedStatus: "Sent",
      createdAt: noonToday()
    }
  );

  // 2 invoices today: ₹500 paid in full, ₹300 paid with ₹100 discount
  invoices.push(
    { id: "inv-1", total: 500, amountPaid: 500, discountAmount: 0, createdAt: noonToday() },
    { id: "inv-2", total: 300, amountPaid: 300, discountAmount: 100, createdAt: noonToday() }
  );
});

describe("dashboard:stats — Admin", () => {
  beforeEach(() => {
    setSession({ id: "admin-1", username: "admin", name: "Admin", role: "Admin" });
  });

  it("returns today, money, and backlog populated", async () => {
    const handler = handlers.get("dashboard:stats")!;
    const result = await handler(undefined);

    expect(result.today.visits).toBe(3);
    expect(result.today.tests).toBe(8); // 5 + 1 pending + 2 outsourced all created today
    expect(result.today.reports).toBe(1); // 1 visit completed today
    expect(result.today.reportsPending).toBe(3); // 3 visits with status not "Completed"
    expect(result.today.deltaVisits).toBe(1); // 3 today - 2 yesterday

    expect(result.money).not.toBeNull();
    expect(result.money.billed).toBe(800);
    expect(result.money.collected).toBe(800);
    expect(result.money.discount).toBe(100);

    expect(result.backlog.pendingResults).toBe(1);
    expect(result.backlog.openVisits).toBe(3); // 2 today + 1 yesterday open
    expect(result.backlog.outsourcedSent).toBe(2);
  });
});

describe("dashboard:stats — Staff", () => {
  beforeEach(() => {
    setSession({ id: "staff-1", username: "staff", name: "Staff", role: "Staff" });
  });

  it("returns today and backlog populated, money is null", async () => {
    const handler = handlers.get("dashboard:stats")!;
    const result = await handler(undefined);

    expect(result.today.visits).toBe(3);
    expect(result.today.tests).toBe(8);
    expect(result.today.reports).toBe(1);
    expect(result.today.reportsPending).toBe(3);
    expect(result.today.deltaVisits).toBe(1);

    expect(result.money).toBeNull();

    expect(result.backlog.pendingResults).toBe(1);
    expect(result.backlog.openVisits).toBe(3);
    expect(result.backlog.outsourcedSent).toBe(2);
  });
});
