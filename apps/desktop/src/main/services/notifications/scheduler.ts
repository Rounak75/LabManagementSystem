import * as queue from "./queue";
import * as smsSender from "./senders/sms.sender";
import * as emailSender from "./senders/email.sender";
import { nextDelayMs, MAX_RETRIES } from "./retry-policy";

const TICK_MS = 30_000;

let timer: NodeJS.Timeout | null = null;
let running = false;

export async function runTick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await queue.recoverStuckSending();
    await queue.abandonStale();

    const rows = await queue.dueRows(new Date());
    for (const row of rows) {
      const won = await queue.markSending(row.id);
      if (!won) continue;
      const sender = row.channel === "SMS" ? smsSender : emailSender;
      let result;
      try {
        result = await sender.send(row as any);
      } catch (err: any) {
        result = { ok: false as const, error: err.message ?? "sender_threw", retryable: true };
      }
      if (result.ok) {
        await queue.markSent(row.id, result.messageId, result.payload);
      } else if (result.retryable && row.attempts < MAX_RETRIES) {
        const delay = nextDelayMs(row.attempts + 1);
        if (delay != null) {
          await queue.markRetryable(row.id, delay, result.error);
        } else {
          await queue.markFailed(row.id, result.error);
        }
      } else {
        await queue.markFailed(row.id, result.error);
      }
    }
  } finally {
    running = false;
  }
}

export function start(): void {
  if (timer) return;
  timer = setInterval(() => {
    runTick().catch(err => console.error("[notifications] tick failed", err));
  }, TICK_MS);
  runTick().catch(err => console.error("[notifications] initial tick failed", err));
}

export function stop(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
