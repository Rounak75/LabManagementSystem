import { get, set } from "idb-keyval";

const QUEUE_KEY = "queue:v1";
const EXPIRY_MS = 24 * 60 * 60 * 1000;

export enum ItemStatus {
  Pending = "Pending",
  Sending = "Sending",
  Error = "Error",
}

export interface QueueItem {
  id: string;
  kind: "patient.create" | "patient.update" | "result.upsert";
  body: unknown;
  status: ItemStatus;
  enqueuedAt: number;
  lastError?: string;
  attempts: number;
}

async function load(): Promise<QueueItem[]> {
  return ((await get(QUEUE_KEY)) as QueueItem[]) ?? [];
}
async function save(items: QueueItem[]): Promise<void> {
  await set(QUEUE_KEY, items);
}

export async function enqueue(p: { kind: QueueItem["kind"]; body: unknown }): Promise<string> {
  const items = await load();
  const id = crypto.randomUUID();
  items.push({
    id,
    kind: p.kind,
    body: p.body,
    status: ItemStatus.Pending,
    enqueuedAt: Date.now(),
    attempts: 0,
  });
  await save(items);
  return id;
}

export async function dequeueOne(): Promise<QueueItem | null> {
  const items = await load();
  const idx = items.findIndex((i) => i.status === ItemStatus.Pending);
  if (idx === -1) return null;
  items[idx] = { ...items[idx]!, status: ItemStatus.Sending, attempts: items[idx]!.attempts + 1 };
  await save(items);
  return items[idx]!;
}

export async function markSent(id: string): Promise<void> {
  const items = (await load()).filter((i) => i.id !== id);
  await save(items);
}

export async function markError(id: string, error: string): Promise<void> {
  const items = await load();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return;
  items[idx] = { ...items[idx]!, status: ItemStatus.Error, lastError: error };
  await save(items);
}

export async function listPending(): Promise<QueueItem[]> {
  return (await load()).filter((i) => i.status !== ItemStatus.Sending);
}

export async function clearExpired(): Promise<number> {
  const items = await load();
  const cutoff = Date.now() - EXPIRY_MS;
  const kept = items.filter((i) => i.enqueuedAt >= cutoff);
  await save(kept);
  return items.length - kept.length;
}
