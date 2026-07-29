import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("electron", () => ({ ipcMain: { handle: vi.fn() }, app: { getPath: () => "." } }));

const mocks = vi.hoisted(() => ({ testFindMany: vi.fn(), paramCreate: vi.fn() }));
vi.mock("@main/db", () => ({
  prisma: () => ({
    test: { findMany: mocks.testFindMany },
    testParameter: { create: mocks.paramCreate },
  }),
}));

import { applyCatalogueParameters } from "../apply-catalogue-parameters";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.testFindMany.mockResolvedValue([]);
  mocks.paramCreate.mockResolvedValue({});
});

describe("applyCatalogueParameters", () => {
  // A pathologist's own ranges must never be overwritten by this, which is what
  // makes it safe to run on every boot.
  it("only looks at active tests that have no parameters at all", async () => {
    await applyCatalogueParameters();
    expect(mocks.testFindMany.mock.calls[0]![0].where).toEqual({
      isActive: true,
      parameters: { none: {} },
    });
  });

  it("names a single-parameter test after the test itself", async () => {
    mocks.testFindMany.mockResolvedValue([{ id: "t1", name: "Haemoglobin" }]);

    const stats = await applyCatalogueParameters();

    expect(stats).toEqual({ testsGivenParameters: 1, parametersCreated: 1 });
    const data = mocks.paramCreate.mock.calls[0]![0].data;
    // Reads on the report as "Haemoglobin  12.4 g/dL".
    expect(data.name).toBe("Haemoglobin");
    expect(data.unit).toBe("g/dL");
    expect(data.refRangeMaleMin).toBe(13);
    expect(data.refRangeFemaleMin).toBe(12);
  });

  it("creates every parameter of a panel, in order", async () => {
    mocks.testFindMany.mockResolvedValue([{ id: "t2", name: "Diff.WBC Count" }]);

    const stats = await applyCatalogueParameters();

    expect(stats.parametersCreated).toBe(5);
    const names = mocks.paramCreate.mock.calls.map((c) => c[0].data.name);
    expect(names).toEqual([
      "Neutrophils",
      "Lymphocytes",
      "Monocytes",
      "Eosinophils",
      "Basophils",
    ]);
    expect(mocks.paramCreate.mock.calls.map((c) => c[0].data.displayOrder)).toEqual([0, 1, 2, 3, 4]);
  });

  it("stores the choices for a qualitative test", async () => {
    mocks.testFindMany.mockResolvedValue([{ id: "t3", name: "Hbs Ag" }]);

    await applyCatalogueParameters();

    const data = mocks.paramCreate.mock.calls[0]![0].data;
    expect(data.resultType).toBe("Qualitative");
    expect(JSON.parse(data.qualitativeOptions)).toEqual(["Negative", "Positive"]);
    expect(data.normalQualitative).toBe("Negative");
  });

  // Where no defensible interval exists the value is still recorded — it is
  // simply never flagged abnormal, rather than judged against a made-up number.
  it("leaves the range empty when the catalogue states none", async () => {
    mocks.testFindMany.mockResolvedValue([{ id: "t4", name: "Fungal Culture" }]);

    await applyCatalogueParameters();

    const data = mocks.paramCreate.mock.calls[0]![0].data;
    expect(data.refRangeMaleMin).toBeNull();
    expect(data.refRangeMaleMax).toBeNull();
  });

  it("matches a test name whose case and spacing differ", async () => {
    mocks.testFindMany.mockResolvedValue([{ id: "t5", name: "Total WBC count" }]);
    expect((await applyCatalogueParameters()).parametersCreated).toBe(1);
  });

  // Reported by the reconciliation log instead, so the gap is visible.
  it("leaves a test the catalogue does not know about alone", async () => {
    mocks.testFindMany.mockResolvedValue([{ id: "t6", name: "Some Bespoke Panel" }]);

    const stats = await applyCatalogueParameters();

    expect(stats).toEqual({ testsGivenParameters: 0, parametersCreated: 0 });
    expect(mocks.paramCreate).not.toHaveBeenCalled();
  });
});
