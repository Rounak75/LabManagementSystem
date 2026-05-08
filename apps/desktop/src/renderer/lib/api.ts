import type { Channel } from "@shared/api";
import type { IpcResult } from "@lab/types";

export async function call<T>(channel: Channel, payload?: unknown): Promise<T> {
  const res = (await window.api.invoke<T>(channel, payload)) as IpcResult<T>;
  if (!res.ok) {
    const err = new Error(res.error.message);
    (err as any).code = res.error.code;
    throw err;
  }
  return res.data;
}
