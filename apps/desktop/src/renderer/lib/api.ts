import type { Channel } from "@shared/api";
import type { IpcResult } from "@lab/types";
import { useToast } from "@/lib/toast.store";

export async function call<T>(channel: Channel, payload?: unknown): Promise<T> {
  try {
    const res = (await window.api.invoke<T>(channel, payload)) as IpcResult<T>;
    if (!res.ok) {
      const err = new Error(res.error.message);
      (err as any).code = res.error.code;
      throw err;
    }
    return res.data;
  } catch (err: any) {
    const message =
      typeof err?.message === "string" && err.message.length > 0
        ? err.message
        : "Something went wrong — try again or contact support.";
    useToast.getState().error(message);
    throw err;
  }
}
