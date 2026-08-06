import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import * as os from "os";
import * as fs from "fs";
import { join } from "path";
import { applyPendingMigrations } from "@main/services/apply-migrations";

/**
 * The duplicate-test-name guard, against a real database.
 *
 * This has to be an integration test. The guard is a `$queryRaw` doing
 * `lower(trim(name))`, and a mocked Prisma returns whatever the mock says —
 * usually `undefined` — so a mocked test would pass no matter what the SQL did,
 * including if it were syntactically invalid or matched nothing.
 *
 * The bug being locked down: the catalogue reached 209 active tests under 193
 * distinct names, and the patient booking form printed fourteen of them twice at
 * two different prices, letting a patient book either one.
 */

vi.mock("electron", () => ({ ipcMain: { handle: vi.fn() }, app: { getPath: () => "." } }));

const holder = vi.hoisted(() => ({ client: null as unknown as PrismaClient }));
vi.mock("@main/db", () => ({ prisma: () => holder.client }));

// The handlers call requireAdmin() before touching the database; this test is
// about the name check, so the session is stubbed to a fixed admin.
vi.mock("@main/session", () => ({
  requireAdmin: () => ({ id: "u1", role: "Admin" }),
  requireSession: () => ({ id: "u1", role: "Admin" }),
}));
vi.mock("@main/services/audit.service", () => ({ audit: vi.fn() }));

// register() records handlers rather than reaching a real ipcMain.
const handlers = new Map<string, (input: unknown) => Promise<unknown>>();
vi.mock("@main/ipc", () => ({
  register: (name: string, fn: (input: unknown) => Promise<unknown>) => {
    handlers.set(name, fn);
  },
}));

const MIGRATIONS_DIR = join(process.cwd(), "../../packages/db/prisma/migrations");
const tmpDir = fs.mkdtempSync(join(os.tmpdir(), "lab-testdupe-int-"));
const tmpDb = join(tmpDir, "test.sqlite");

let db: PrismaClient;

beforeAll(async () => {
  db = new PrismaClient({ datasources: { db: { url: "file:" + tmpDb } } });
  holder.client = db;
  await applyPendingMigrations(db as never, MIGRATIONS_DIR);
  await db.$executeRawUnsafe("PRAGMA foreign_keys = ON");
  await import("../tests.ipc");
});

afterAll(async () => {
  await db.$disconnect();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await db.testParameter.deleteMany();
  await db.test.deleteMany();
});

const create = (over: Partial<Record<string, unknown>> = {}) =>
  handlers.get("tests:create")!({
    name: "Lipid Profile", category: "Blood", price: 380, isOutsourced: false, ...over,
  });

describe("tests:create duplicate-name guard", () => {
  it("creates the first test of a given name", async () => {
    await expect(create()).resolves.toBeDefined();
    expect(await db.test.count()).toBe(1);
  });

  it("refuses an exact duplicate name", async () => {
    await create();
    await expect(create()).rejects.toThrow("DUPLICATE_TEST_NAME");
    expect(await db.test.count()).toBe(1);
  });

  it("refuses names differing only by case or surrounding space", async () => {
    await create();
    // These are distinct strings to SQLite and the same name to a patient
    // reading the booking form, which is the whole point of the guard.
    await expect(create({ name: "lipid profile" })).rejects.toThrow("DUPLICATE_TEST_NAME");
    await expect(create({ name: "LIPID PROFILE" })).rejects.toThrow("DUPLICATE_TEST_NAME");
    await expect(create({ name: "  Lipid Profile  " })).rejects.toThrow("DUPLICATE_TEST_NAME");
    expect(await db.test.count()).toBe(1);
  });

  it("allows a genuinely different name", async () => {
    await create();
    await expect(create({ name: "Lipid Profile Extended" })).resolves.toBeDefined();
    expect(await db.test.count()).toBe(2);
  });

  it("allows reusing the name of a DEACTIVATED test", async () => {
    // Retiring a duplicate is how the catalogue gets cleaned up. The retired row
    // keeps its name so old invoices still print correctly, and that name must
    // not then block the surviving test.
    const first = (await create()) as { id: string };
    await db.test.update({ where: { id: first.id }, data: { isActive: false } });
    await expect(create()).resolves.toBeDefined();
  });
});

describe("tests:update duplicate-name guard", () => {
  it("refuses renaming a test onto a name already in use", async () => {
    await create();
    const other = (await create({ name: "CBC / Blood Examination", price: 325 })) as { id: string };
    await expect(
      handlers.get("tests:update")!({
        id: other.id, name: "Lipid Profile", category: "Blood", price: 325,
        isOutsourced: false, isActive: true,
      })
    ).rejects.toThrow("DUPLICATE_TEST_NAME");
  });

  it("lets a test keep its own name when edited", async () => {
    const t = (await create()) as { id: string };
    await expect(
      handlers.get("tests:update")!({
        id: t.id, name: "Lipid Profile", category: "Blood", price: 420,
        isOutsourced: false, isActive: true,
      })
    ).resolves.toBeDefined();
    expect(Number((await db.test.findUnique({ where: { id: t.id } }))!.price)).toBe(420);
  });

  it("lets a duplicate be deactivated even though its name clashes", async () => {
    const keep = (await create()) as { id: string };
    await db.test.update({ where: { id: keep.id }, data: { isActive: false } });
    const dupe = (await create()) as { id: string };
    await db.test.update({ where: { id: keep.id }, data: { isActive: true } });
    // `dupe` now clashes with `keep`; retiring it must still be possible.
    await expect(
      handlers.get("tests:update")!({
        id: dupe.id, name: "Lipid Profile", category: "Blood", price: 380,
        isOutsourced: false, isActive: false,
      })
    ).resolves.toBeDefined();
  });
});
