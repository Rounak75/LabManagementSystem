import type { ClassifiedError } from "./types";

// ─── toPaise ─────────────────────────────────────────────────────────────────

/** Convert rupees to paise (smallest INR unit). */
export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

// ─── classifyError ───────────────────────────────────────────────────────────

interface HttpErrorInput {
  status: number;
  body: unknown;
}

/**
 * Classify an HTTP or network error into a ClassifiedError.
 * Accepts either an HttpErrorInput (non-2xx response) or a native Error
 * (network / fetch failure with no HTTP status).
 */
export function classifyError(
  err: HttpErrorInput | Error
): ClassifiedError & { raw?: unknown } {
  // Native Error → network failure
  if (err instanceof Error) {
    return {
      retryable: true,
      userMessage: "Couldn't reach Razorpay — check internet",
      raw: err,
    };
  }

  const { status, body } = err;

  if (status === 401) {
    return {
      retryable: false,
      userMessage:
        "Razorpay authentication failed — check Key ID and Secret in Settings",
      raw: body,
    };
  }

  if (status === 429) {
    return {
      retryable: true,
      userMessage: "Razorpay busy, try again",
      raw: body,
    };
  }

  if (status >= 500) {
    return {
      retryable: true,
      userMessage: "Razorpay server error — try again",
      raw: body,
    };
  }

  // 4xx — try to surface Razorpay's description
  const description = (
    body as { error?: { description?: string } } | null | undefined
  )?.error?.description;

  if (description) {
    return { retryable: false, userMessage: description, raw: body };
  }

  return {
    retryable: false,
    userMessage: `Razorpay request failed (HTTP ${status})`,
    raw: body,
  };
}

// ─── RazorpayClient ──────────────────────────────────────────────────────────

const BASE = "https://api.razorpay.com";

export interface CreatePaymentLinkInput {
  amountRupees: number;
  currency: string;
  description: string;
  referenceId: string;
  expireByEpoch: number;
  customer: {
    name: string;
    contact: string;
    email?: string;
  };
}

export interface PaymentLinkRaw {
  id: string;
  short_url: string;
  expire_by: number;
  [key: string]: unknown;
}

export interface CreatePaymentLinkResult {
  id: string;
  shortUrl: string;
  expireBy: number;
}

export interface CreateQrInput {
  amountPaise: number;
  description: string;
  closeByEpoch: number;
  notes?: Record<string, string>;
}

export interface QrRaw {
  id: string;
  image_url: string;
  close_by: number;
  [key: string]: unknown;
}

export interface CreateQrResult {
  id: string;
  imageUrl: string;
  closeBy: number;
}

export interface RazorpayClient {
  createPaymentLink(input: CreatePaymentLinkInput): Promise<CreatePaymentLinkResult>;
  fetchPaymentLink(id: string): Promise<PaymentLinkRaw>;
  findPaymentLinkByReference(referenceId: string): Promise<PaymentLinkRaw | null>;
  createQr(input: CreateQrInput): Promise<CreateQrResult>;
  fetchQr(id: string): Promise<QrRaw>;
  closeQr(id: string): Promise<QrRaw>;
  testConnection(): Promise<boolean>;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function authHeader(keyId: string, keySecret: string): string {
  return "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
}

/**
 * Perform a fetch and throw a ClassifiedError on non-2xx status or network
 * failure.
 */
async function rzpFetch(
  url: string,
  init: RequestInit & { headers: Record<string, string> }
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    throw classifyError(err instanceof Error ? err : new Error(String(err)));
  }

  if (!res.ok) {
    let body: unknown = {};
    try {
      body = await res.json();
    } catch {
      // ignore parse failure
    }
    throw classifyError({ status: res.status, body });
  }

  return res.json();
}

// ─── factory ─────────────────────────────────────────────────────────────────

export function createRazorpayClient(options: {
  keyId: string;
  keySecret: string;
}): RazorpayClient {
  const { keyId, keySecret } = options;
  const auth = authHeader(keyId, keySecret);

  const headers: Record<string, string> = {
    Authorization: auth,
    "Content-Type": "application/json",
  };

  const getHeaders: Record<string, string> = {
    Authorization: auth,
  };

  async function createPaymentLink(
    input: CreatePaymentLinkInput
  ): Promise<CreatePaymentLinkResult> {
    const customer: Record<string, string> = {
      name: input.customer.name,
      contact: input.customer.contact,
    };
    if (input.customer.email) {
      customer["email"] = input.customer.email;
    }

    const body = {
      amount: toPaise(input.amountRupees),
      currency: input.currency,
      description: input.description,
      reference_id: input.referenceId,
      expire_by: input.expireByEpoch,
      notify: { sms: false, email: false },
      customer,
    };

    const raw = (await rzpFetch(`${BASE}/v1/payment_links`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })) as PaymentLinkRaw;

    return {
      id: raw.id,
      shortUrl: raw.short_url,
      expireBy: raw.expire_by,
    };
  }

  async function fetchPaymentLink(id: string): Promise<PaymentLinkRaw> {
    return (await rzpFetch(`${BASE}/v1/payment_links/${id}`, {
      method: "GET",
      headers: getHeaders,
    })) as PaymentLinkRaw;
  }

  async function findPaymentLinkByReference(
    referenceId: string
  ): Promise<PaymentLinkRaw | null> {
    const data = (await rzpFetch(
      `${BASE}/v1/payment_links?reference_id=${encodeURIComponent(referenceId)}`,
      { method: "GET", headers: getHeaders }
    )) as { payment_links: PaymentLinkRaw[] };

    return data.payment_links[0] ?? null;
  }

  async function createQr(input: CreateQrInput): Promise<CreateQrResult> {
    const body: Record<string, unknown> = {
      type: "upi_qr",
      usage: "single_use",
      fixed_amount: true,
      payment_amount: input.amountPaise,
      description: input.description,
      close_by: input.closeByEpoch,
    };
    if (input.notes) {
      body["notes"] = input.notes;
    }

    const raw = (await rzpFetch(`${BASE}/v1/payments/qr_codes`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })) as QrRaw;

    return {
      id: raw.id,
      imageUrl: raw.image_url,
      closeBy: raw.close_by,
    };
  }

  async function fetchQr(id: string): Promise<QrRaw> {
    return (await rzpFetch(`${BASE}/v1/payments/qr_codes/${id}`, {
      method: "GET",
      headers: getHeaders,
    })) as QrRaw;
  }

  async function closeQr(id: string): Promise<QrRaw> {
    return (await rzpFetch(`${BASE}/v1/payments/qr_codes/${id}/close`, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    })) as QrRaw;
  }

  async function testConnection(): Promise<boolean> {
    await rzpFetch(`${BASE}/v1/payments?count=1`, {
      method: "GET",
      headers: getHeaders,
    });
    return true;
  }

  return {
    createPaymentLink,
    fetchPaymentLink,
    findPaymentLinkByReference,
    createQr,
    fetchQr,
    closeQr,
    testConnection,
  };
}
