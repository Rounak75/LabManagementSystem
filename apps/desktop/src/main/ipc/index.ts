import { ipcMain } from "electron";
import type {
  Channel,
  ChannelInput,
  ChannelOutput,
  ContractedChannel,
  LooseChannel,
} from "@shared/api";
import type { IpcResult } from "@lab/types";
import { logError } from "@main/services/logger";
import { isDomainCode, messageForCode } from "@shared/domain-error";

type Handler = (payload: any) => Promise<unknown> | unknown;
const handlers = new Map<Channel, Handler>();

/**
 * Bind a handler to a channel.
 *
 * A channel in `ChannelContract` must satisfy it — the handler's payload and
 * return type are both checked against the same entry the renderer reads. The
 * loose overload deliberately excludes contracted channels so a mismatched
 * handler cannot quietly fall through to it; that fallback would have made the
 * contract decorative.
 */
export function register<C extends ContractedChannel>(
  channel: C,
  handler: (payload: ChannelInput<C>) => Promise<ChannelOutput<C>> | ChannelOutput<C>,
): void;
export function register(channel: LooseChannel, handler: Handler): void;
export function register(channel: Channel, handler: Handler): void {
  handlers.set(channel, handler);
}

export function attachIpc() {
  for (const [channel, handler] of handlers) {
    ipcMain.handle(channel, async (_event, payload): Promise<IpcResult<unknown>> => {
      try {
        const data = await handler(payload);
        return { ok: true, data: stripNonCloneable(data) };
      } catch (err) {
        const e = err as Error;
        // Membership in the message table, not the shape of the string. The old
        // test was /^[A-Z_]+$/, which let any screaming-snake string through as
        // though it were a known code — a typo, or a `reason` that came from
        // somewhere else — and `codeToMessage` then fell through to returning
        // the code itself. The lab saw RAZORPAY_NOT_CONFIGURED on screen and
        // nothing reached the log. An unrecognised code is now what it always
        // was: an internal error, logged, reported in words.
        if (isDomainCode(e?.message)) {
          return { ok: false, error: { code: e.message, message: messageForCode(e.message) } };
        }
        // Unknown/internal error: log the real detail to disk, return a safe generic message.
        logError(`ipc:${channel}`, err);
        return {
          ok: false,
          error: { code: "INTERNAL_ERROR", message: messageForCode("INTERNAL_ERROR") },
        };
      }
    });
  }
}

/**
 * Round-trip through JSON to convert non-cloneable values into plain
 * JS primitives before Electron's structured-clone serialization.
 *
 *   Prisma Decimal → string  (via its built-in toJSON)
 *   BigInt         → string  (via replacer)
 *   Date           → string  (via built-in toJSON — all frontend code handles ISO strings)
 *
 * Without this, any IPC handler returning Prisma Decimal fields
 * (Test.price, TestParameter.refRange*, Invoice.total, etc.)
 * crashes with "An object could not be cloned".
 */
function stripNonCloneable(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  return JSON.parse(JSON.stringify(data, (_key, value) => {
    if (typeof value === "bigint") return value.toString();
    return value;
  }));
}
