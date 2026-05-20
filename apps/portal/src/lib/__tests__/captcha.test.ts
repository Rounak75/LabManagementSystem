import { describe, it, expect, beforeAll } from "vitest";
import { issuePuzzle, verifyPuzzle } from "../captcha";

describe("captcha", () => {
  beforeAll(() => {
    process.env.SUPABASE_JWT_SECRET = "test-secret-at-least-32-chars-long-aaaaaaa";
  });

  it("issues a puzzle with question and signed token", async () => {
    const p = await issuePuzzle();
    expect(p.question).toMatch(/^What is \d+ \+ \d+\?$/);
    expect(typeof p.token).toBe("string");
    expect(p.token.split(".").length).toBe(3);
  });

  it("verifies the correct answer", async () => {
    const p = await issuePuzzle();
    const m = p.question.match(/(\d+) \+ (\d+)/)!;
    const answer = parseInt(m[1], 10) + parseInt(m[2], 10);
    expect(await verifyPuzzle(p.token, answer)).toBe(true);
  });

  it("rejects the wrong answer", async () => {
    const p = await issuePuzzle();
    expect(await verifyPuzzle(p.token, 9999)).toBe(false);
  });

  it("rejects a malformed token", async () => {
    expect(await verifyPuzzle("not-a-jwt", 1)).toBe(false);
  });

  it("rejects NaN / non-finite answers without throwing", async () => {
    const p = await issuePuzzle();
    expect(await verifyPuzzle(p.token, NaN)).toBe(false);
  });
});
