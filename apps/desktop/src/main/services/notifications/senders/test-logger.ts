import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { SendResult } from "../types";

export async function send(row: {
  id: string;
  channel: string;
  recipient: string;
  purpose: string;
  payload?: string | null;
  subject?: string | null;
}): Promise<SendResult> {
  const logPath = path.join(app.getPath("userData"), "notifications-test.log");
  const line =
    JSON.stringify({
      ts: new Date().toISOString(),
      id: row.id,
      channel: row.channel,
      recipient: row.recipient,
      purpose: row.purpose,
      subject: row.subject ?? null,
      body: row.payload ?? "",
    }) + "\n";
  await fs.promises.appendFile(logPath, line, "utf8");
  return {
    ok: true,
    messageId: `test-${Date.now()}-${row.id}`,
    payload: row.payload ?? "",
  };
}
