import { describe, it, expect, beforeEach } from "vitest";
import { saveDraft, loadDraft, clearDraft, evictOldDrafts } from "../draft";

describe("draft helpers", () => {
  beforeEach(() => localStorage.clear());

  it("save then load returns the value with metadata", () => {
    saveDraft("vt-1", { a: 1 });
    const d = loadDraft<{ a: number }>("vt-1");
    expect(d?.payload).toEqual({ a: 1 });
    expect(typeof d?.savedAt).toBe("number");
  });

  it("loadDraft returns null when no draft exists", () => {
    expect(loadDraft("nonexistent")).toBeNull();
  });

  it("clear removes the entry", () => {
    saveDraft("vt-1", { a: 1 });
    clearDraft("vt-1");
    expect(loadDraft("vt-1")).toBeNull();
  });

  it("evictOldDrafts removes entries older than 7 days", () => {
    const oldKey = "result-draft:old";
    localStorage.setItem(oldKey, JSON.stringify({ savedAt: Date.now() - 8 * 24 * 3600 * 1000, payload: {} }));
    saveDraft("fresh", { x: 1 });
    evictOldDrafts();
    expect(localStorage.getItem(oldKey)).toBeNull();
    expect(loadDraft("fresh")).not.toBeNull();
  });

  it("evictOldDrafts handles corrupt JSON gracefully", () => {
    localStorage.setItem("result-draft:corrupt", "{not valid json}");
    expect(() => evictOldDrafts()).not.toThrow();
    expect(localStorage.getItem("result-draft:corrupt")).toBeNull();
  });

  it("evictOldDrafts does not touch unrelated keys", () => {
    localStorage.setItem("unrelated:key", "value");
    evictOldDrafts();
    expect(localStorage.getItem("unrelated:key")).toBe("value");
  });
});
