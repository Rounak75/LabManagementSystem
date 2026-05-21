import { describe, it, expect } from "vitest";
import { apiError, apiOk } from "../api-error";

describe("api-error", () => {
  it("apiError returns the given status and a { error: { code, message } } body", async () => {
    const res = apiError("invalid_phone", 400);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: { code: "invalid_phone", message: expect.any(String) } });
  });

  it("apiError uses a friendly message for a known code", async () => {
    const res = apiError("account_locked", 423);
    const body = await res.json();
    expect(body.error.message.toLowerCase()).toContain("locked");
  });

  it("apiError falls back to a generic message for an unknown code", async () => {
    const res = apiError("some_unknown_code", 500);
    const body = await res.json();
    expect(body.error.code).toBe("some_unknown_code");
    expect(body.error.message).toContain("went wrong");
  });

  it("apiOk wraps data with status 200 by default", async () => {
    const res = apiOk({ hello: "world" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hello: "world" });
  });
});
