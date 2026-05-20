import { describe, it, expect, vi, beforeEach } from "vitest";

// Must stubGlobal before importing the module under test
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import {
  toPaise,
  classifyError,
  createRazorpayClient,
  type RazorpayClient,
} from "../razorpay-client";

// ─── toPaise ─────────────────────────────────────────────────────────────────

describe("toPaise", () => {
  it("converts whole rupees", () => {
    expect(toPaise(1)).toBe(100);
    expect(toPaise(500)).toBe(50000);
  });

  it("rounds fractional rupees", () => {
    expect(toPaise(1.5)).toBe(150);
    // IEEE 754: 1.005 * 100 = 100.49999... so Math.round gives 100, not 101
    expect(toPaise(1.005)).toBe(100);
    expect(toPaise(0.999)).toBe(100);
    expect(toPaise(1.506)).toBe(151);
  });
});

// ─── classifyError ───────────────────────────────────────────────────────────

describe("classifyError", () => {
  it("401 → non-retryable auth message", () => {
    const r = classifyError({ status: 401, body: {} });
    expect(r.retryable).toBe(false);
    expect(r.userMessage).toMatch(/authentication failed/i);
  });

  it("429 → retryable busy message", () => {
    const r = classifyError({ status: 429, body: {} });
    expect(r.retryable).toBe(true);
    expect(r.userMessage).toMatch(/busy/i);
  });

  it("500 → retryable server error message", () => {
    const r = classifyError({ status: 500, body: {} });
    expect(r.retryable).toBe(true);
    expect(r.userMessage).toMatch(/server error/i);
  });

  it("503 → retryable (also 5xx)", () => {
    const r = classifyError({ status: 503, body: {} });
    expect(r.retryable).toBe(true);
  });

  it("4xx with body.error.description → non-retryable, uses description", () => {
    const r = classifyError({
      status: 400,
      body: { error: { description: "Amount must be >= 100 paise" } },
    });
    expect(r.retryable).toBe(false);
    expect(r.userMessage).toBe("Amount must be >= 100 paise");
  });

  it("4xx without description → non-retryable, generic message", () => {
    const r = classifyError({ status: 422, body: {} });
    expect(r.retryable).toBe(false);
    expect(r.userMessage).toBeTruthy();
  });

  it("network error (no status) → retryable", () => {
    const r = classifyError(new Error("ECONNREFUSED"));
    expect(r.retryable).toBe(true);
    expect(r.userMessage).toMatch(/reach Razorpay/i);
  });
});

// ─── createRazorpayClient ────────────────────────────────────────────────────

const KEY_ID = "rzp_test_abc";
const KEY_SECRET = "secret123";
const EXPECTED_AUTH =
  "Basic " + Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64");

function makeClient(): RazorpayClient {
  return createRazorpayClient({ keyId: KEY_ID, keySecret: KEY_SECRET });
}

function okResponse(body: unknown, status = 200) {
  return {
    ok: true,
    status,
    json: async () => body,
  };
}

function errResponse(body: unknown, status: number) {
  return {
    ok: false,
    status,
    json: async () => body,
  };
}

beforeEach(() => fetchMock.mockReset());

// ── createPaymentLink ────────────────────────────────────────────────────────

describe("createRazorpayClient.createPaymentLink", () => {
  it("sends correct URL, auth header, and body", async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse({
        id: "plink_1",
        short_url: "https://rzp.io/l/abc",
        expire_by: 1800000000,
      })
    );

    const client = makeClient();
    const expireBy = Math.floor(Date.now() / 1000) + 3600;
    const result = await client.createPaymentLink({
      amountRupees: 250,
      currency: "INR",
      description: "Lab test fee",
      referenceId: "INV-001",
      expireByEpoch: expireBy,
      customer: { name: "Ravi Kumar", contact: "9876543210" },
    });

    expect(result.id).toBe("plink_1");
    expect(result.shortUrl).toBe("https://rzp.io/l/abc");
    expect(result.expireBy).toBe(1800000000);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.razorpay.com/v1/payment_links");
    expect(init.headers["Authorization"]).toBe(EXPECTED_AUTH);
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body);
    expect(body.amount).toBe(25000); // 250 rupees * 100
    expect(body.currency).toBe("INR");
    expect(body.description).toBe("Lab test fee");
    expect(body.reference_id).toBe("INV-001");
    expect(body.expire_by).toBe(expireBy);
    expect(body.notify).toEqual({ sms: false, email: false });
    expect(body.customer.name).toBe("Ravi Kumar");
    expect(body.customer.contact).toBe("9876543210");
  });

  it("includes optional email in customer when provided", async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse({
        id: "plink_2",
        short_url: "https://rzp.io/l/xyz",
        expire_by: 1800000001,
      })
    );

    const client = makeClient();
    await client.createPaymentLink({
      amountRupees: 100,
      currency: "INR",
      description: "Fee",
      referenceId: "INV-002",
      expireByEpoch: 1800000001,
      customer: {
        name: "Priya",
        contact: "9999999999",
        email: "priya@example.com",
      },
    });

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.customer.email).toBe("priya@example.com");
  });

  it("throws ClassifiedError on 401", async () => {
    fetchMock.mockResolvedValueOnce(errResponse({}, 401));

    const client = makeClient();
    await expect(
      client.createPaymentLink({
        amountRupees: 100,
        currency: "INR",
        description: "Fee",
        referenceId: "INV-003",
        expireByEpoch: 99999999,
        customer: { name: "X", contact: "0000000000" },
      })
    ).rejects.toMatchObject({ retryable: false, userMessage: expect.stringMatching(/authentication failed/i) });
  });

  it("throws ClassifiedError on network failure", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ENOTFOUND api.razorpay.com"));

    const client = makeClient();
    await expect(
      client.createPaymentLink({
        amountRupees: 100,
        currency: "INR",
        description: "Fee",
        referenceId: "INV-004",
        expireByEpoch: 99999999,
        customer: { name: "X", contact: "0000000000" },
      })
    ).rejects.toMatchObject({ retryable: true, userMessage: expect.stringMatching(/reach Razorpay/i) });
  });
});

// ── fetchPaymentLink ─────────────────────────────────────────────────────────

describe("createRazorpayClient.fetchPaymentLink", () => {
  it("calls GET /v1/payment_links/{id} with auth", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ id: "plink_1", status: "created" }));

    const client = makeClient();
    const result = await client.fetchPaymentLink("plink_1");
    expect(result).toMatchObject({ id: "plink_1" });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.razorpay.com/v1/payment_links/plink_1");
    expect(init.method).toBe("GET");
    expect(init.headers["Authorization"]).toBe(EXPECTED_AUTH);
  });
});

// ── findPaymentLinkByReference ───────────────────────────────────────────────

describe("createRazorpayClient.findPaymentLinkByReference", () => {
  it("returns first payment_link when found", async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse({ payment_links: [{ id: "plink_1", reference_id: "INV-001" }] })
    );

    const client = makeClient();
    const result = await client.findPaymentLinkByReference("INV-001");
    expect(result).toMatchObject({ id: "plink_1" });

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain("reference_id=INV-001");
  });

  it("returns null when payment_links array is empty", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ payment_links: [] }));

    const client = makeClient();
    const result = await client.findPaymentLinkByReference("INV-MISSING");
    expect(result).toBeNull();
  });
});

// ── createQr ────────────────────────────────────────────────────────────────

describe("createRazorpayClient.createQr", () => {
  it("sends correct body and returns mapped result", async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse({
        id: "qr_1",
        image_url: "https://rzp.io/qr/abc.png",
        close_by: 1800000005,
      })
    );

    const client = makeClient();
    const result = await client.createQr({
      amountPaise: 25000,
      description: "Lab fee QR",
      closeByEpoch: 1800000005,
      notes: { invoiceId: "INV-001" },
    });

    expect(result.id).toBe("qr_1");
    expect(result.imageUrl).toBe("https://rzp.io/qr/abc.png");
    expect(result.closeBy).toBe(1800000005);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.razorpay.com/v1/payments/qr_codes");
    expect(init.headers["Authorization"]).toBe(EXPECTED_AUTH);

    const body = JSON.parse(init.body);
    expect(body.type).toBe("upi_qr");
    expect(body.usage).toBe("single_use");
    expect(body.fixed_amount).toBe(true);
    expect(body.payment_amount).toBe(25000);
    expect(body.close_by).toBe(1800000005);
    expect(body.description).toBe("Lab fee QR");
    expect(body.notes).toEqual({ invoiceId: "INV-001" });
  });
});

// ── fetchQr ──────────────────────────────────────────────────────────────────

describe("createRazorpayClient.fetchQr", () => {
  it("calls GET /v1/payments/qr_codes/{id}", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ id: "qr_1", status: "active" }));

    const client = makeClient();
    const result = await client.fetchQr("qr_1");
    expect(result).toMatchObject({ id: "qr_1" });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.razorpay.com/v1/payments/qr_codes/qr_1");
    expect(init.method).toBe("GET");
    expect(init.headers["Authorization"]).toBe(EXPECTED_AUTH);
  });
});

// ── closeQr ──────────────────────────────────────────────────────────────────

describe("createRazorpayClient.closeQr", () => {
  it("calls POST /v1/payments/qr_codes/{id}/close", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ id: "qr_1", status: "closed" }));

    const client = makeClient();
    const result = await client.closeQr("qr_1");
    expect(result).toMatchObject({ id: "qr_1" });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.razorpay.com/v1/payments/qr_codes/qr_1/close");
    expect(init.method).toBe("POST");
    expect(init.headers["Authorization"]).toBe(EXPECTED_AUTH);
  });
});

// ── testConnection ───────────────────────────────────────────────────────────

describe("createRazorpayClient.testConnection", () => {
  it("calls GET /v1/payments?count=1 and returns true on 200", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ items: [] }));

    const client = makeClient();
    const result = await client.testConnection();
    expect(result).toBe(true);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.razorpay.com/v1/payments?count=1");
    expect(init.method).toBe("GET");
    expect(init.headers["Authorization"]).toBe(EXPECTED_AUTH);
  });

  it("throws ClassifiedError on 401", async () => {
    fetchMock.mockResolvedValueOnce(errResponse({}, 401));

    const client = makeClient();
    await expect(client.testConnection()).rejects.toMatchObject({
      retryable: false,
      userMessage: expect.stringMatching(/authentication failed/i),
    });
  });
});
