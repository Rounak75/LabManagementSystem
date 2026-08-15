import type {
  Channel,
  ChannelArgs,
  ChannelOutput,
  ContractedChannel,
  LooseChannel,
} from "@shared/api";
import type { IpcResult } from "@lab/types";
import { useToast } from "@/lib/toast.store";

/**
 * Invoke a main-process handler, unwrapping `IpcResult` and surfacing failures
 * as a toast plus a thrown error carrying the domain `code`.
 *
 * For a channel in `ChannelContract` the payload and the resolved type both come
 * from the contract, so there is no type argument to pass — and passing one is
 * how a call site used to assert a return type nobody checked. The second
 * overload keeps the older loose form working for channels not yet migrated; it
 * excludes contracted channels on purpose, so `call<Something>("auth:login")`
 * stops compiling rather than opting back out of the contract.
 */
export async function call<C extends ContractedChannel>(
  channel: C,
  ...payload: ChannelArgs<C>
): Promise<ChannelOutput<C>>;
export async function call<T>(channel: LooseChannel, payload?: unknown): Promise<T>;
export async function call(channel: Channel, payload?: unknown): Promise<unknown> {
  try {
    const res = (await window.api.invoke(channel, payload)) as IpcResult<unknown>;
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
