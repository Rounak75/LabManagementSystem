import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { sendViaFast2Sms } from "../fast2sms";

describe("fast2sms", () => {
  beforeEach(() => fetchMock.mockReset());

  const baseArgs = {
    apiKey: "test-key",
    senderId: "GOLMRI",
    dltTemplateId: "1707111111",
    numbers: "9876543210",
    variablesValues: "Ravi|12 May 2026",
    messageId: "n1",
  };

  it("sends DLT-route request body", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ return: true, request_id: "rid-1", message: "sent" }),
    });

    const res = await sendViaFast2Sms(baseArgs);
    expect(res.ok).toBe(true);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain("fast2sms.com");
    const body = JSON.parse(init.body);
    expect(body.route).toBe("dlt");
    expect(body.sender_id).toBe("GOLMRI");
    expect(body.message).toBe("1707111111");
    expect(body.variables_values).toBe("Ravi|12 May 2026");
    expect(body.numbers).toBe("9876543210");
    expect(init.headers.authorization).toBe("test-key");
  });

  it("maps invalid API key to non-retryable", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ return: false, message: "Invalid API key" }),
    });
    const res = await sendViaFast2Sms(baseArgs);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.retryable).toBe(false);
  });

  it("maps invalid number to non-retryable", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ return: false, message: "Invalid mobile number" }),
    });
    const res = await sendViaFast2Sms(baseArgs);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.retryable).toBe(false);
  });

  it("maps 5xx to retryable", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ return: false, message: "Service unavailable" }),
    });
    const res = await sendViaFast2Sms(baseArgs);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.retryable).toBe(true);
  });

  it("maps network error to retryable", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    const res = await sendViaFast2Sms(baseArgs);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.retryable).toBe(true);
  });
});
