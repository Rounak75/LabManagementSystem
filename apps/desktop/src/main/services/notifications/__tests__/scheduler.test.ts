import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as queue from "../queue";

const { smsSend, emailSend } = vi.hoisted(() => ({
  smsSend: vi.fn(),
  emailSend: vi.fn(),
}));
vi.mock("../senders/sms.sender", () => ({ send: smsSend }));
vi.mock("../senders/email.sender", () => ({ send: emailSend }));

import { runTick } from "../scheduler";

describe("scheduler.runTick", () => {
  beforeEach(() => {
    smsSend.mockReset();
    emailSend.mockReset();
    vi.spyOn(queue, "dueRows").mockResolvedValue([]);
    vi.spyOn(queue, "markSending").mockResolvedValue(true);
    vi.spyOn(queue, "markSent").mockResolvedValue();
    vi.spyOn(queue, "markRetryable").mockResolvedValue();
    vi.spyOn(queue, "markFailed").mockResolvedValue();
    vi.spyOn(queue, "recoverStuckSending").mockResolvedValue(0);
    vi.spyOn(queue, "abandonStale").mockResolvedValue(0);
  });
  afterEach(() => vi.restoreAllMocks());

  it("does nothing when no due rows", async () => {
    await runTick();
    expect(smsSend).not.toHaveBeenCalled();
    expect(emailSend).not.toHaveBeenCalled();
  });

  it("sends SMS row via sms.sender and marks Sent on success", async () => {
    vi.spyOn(queue, "dueRows").mockResolvedValue([{ id: "n1", channel: "SMS" } as any]);
    smsSend.mockResolvedValue({ ok: true, messageId: "m1", payload: "body" });
    await runTick();
    expect(smsSend).toHaveBeenCalledTimes(1);
    expect(queue.markSent).toHaveBeenCalledWith("n1", "m1", "body");
  });

  it("calls markRetryable on retryable failure with first retry delay", async () => {
    vi.spyOn(queue, "dueRows").mockResolvedValue([{ id: "n2", channel: "SMS", attempts: 0 } as any]);
    smsSend.mockResolvedValue({ ok: false, error: "timeout", retryable: true });
    await runTick();
    expect(queue.markRetryable).toHaveBeenCalledWith("n2", 60_000, "timeout");
  });

  it("calls markFailed on non-retryable failure", async () => {
    vi.spyOn(queue, "dueRows").mockResolvedValue([{ id: "n3", channel: "SMS", attempts: 0 } as any]);
    smsSend.mockResolvedValue({ ok: false, error: "bad_number", retryable: false });
    await runTick();
    expect(queue.markFailed).toHaveBeenCalledWith("n3", "bad_number");
  });

  it("calls markFailed when retries are exhausted", async () => {
    vi.spyOn(queue, "dueRows").mockResolvedValue([{ id: "n4", channel: "SMS", attempts: 5 } as any]);
    smsSend.mockResolvedValue({ ok: false, error: "timeout", retryable: true });
    await runTick();
    expect(queue.markFailed).toHaveBeenCalledWith("n4", "timeout");
    expect(queue.markRetryable).not.toHaveBeenCalled();
  });

  it("skips row when markSending fails (lost race)", async () => {
    vi.spyOn(queue, "dueRows").mockResolvedValue([{ id: "n5", channel: "SMS" } as any]);
    vi.spyOn(queue, "markSending").mockResolvedValue(false);
    await runTick();
    expect(smsSend).not.toHaveBeenCalled();
  });

  it("routes Email rows to email.sender", async () => {
    vi.spyOn(queue, "dueRows").mockResolvedValue([{ id: "n6", channel: "Email" } as any]);
    emailSend.mockResolvedValue({ ok: true, messageId: "m6", payload: "body6" });
    await runTick();
    expect(emailSend).toHaveBeenCalledTimes(1);
    expect(smsSend).not.toHaveBeenCalled();
  });
});
