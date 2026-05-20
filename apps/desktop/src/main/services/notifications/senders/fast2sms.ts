import type { SendResult } from "../types";

export interface Fast2SmsArgs {
  apiKey: string;
  senderId: string;
  dltTemplateId: string;
  numbers: string; // comma-separated for multi-recipient; we always send one
  variablesValues: string; // pipe-joined
  messageId: string;
}

const ENDPOINT = "https://www.fast2sms.com/dev/bulkV2";

const NON_RETRYABLE_KEYWORDS = [
  "invalid api key",
  "invalid mobile",
  "invalid number",
  "dnd",
  "template not found",
  "template id",
  "sender id",
];

function classifyError(httpStatus: number, message: string): boolean {
  if (httpStatus >= 500) return true;
  if (httpStatus === 429) return true;
  if (httpStatus === 401 || httpStatus === 403) return false;
  const lower = message.toLowerCase();
  if (NON_RETRYABLE_KEYWORDS.some((k) => lower.includes(k))) return false;
  return true;
}

export async function sendViaFast2Sms(
  args: Fast2SmsArgs
): Promise<SendResult> {
  try {
    const body = {
      route: "dlt",
      sender_id: args.senderId,
      message: args.dltTemplateId,
      variables_values: args.variablesValues,
      numbers: args.numbers,
      flash: 0,
      message_id: args.messageId,
    };
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        authorization: args.apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const json: any = await res.json().catch(() => ({}));
    if (res.ok && json.return === true) {
      const messageId = String(json.request_id ?? `f2s-${Date.now()}`);
      return { ok: true, messageId, payload: args.variablesValues };
    }
    const message = String(json.message ?? `HTTP ${res.status}`);
    return {
      ok: false,
      error: message,
      retryable: classifyError(res.status, message),
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err.message ?? "network_error",
      retryable: true,
    };
  }
}
