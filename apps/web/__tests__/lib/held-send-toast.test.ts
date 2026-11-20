import { describe, expect, it, jest } from "@jest/globals";
import { CANCELED_SEND_IN_SENT_NOTICE } from "@workspace/calendar-core";
import { toast } from "@workspace/ui/lib/toast";
import { announceHeldSend } from "@/lib/mail/held-send-toast";

jest.mock("@workspace/ui/lib/toast", () => ({
  toast: Object.assign(jest.fn(), { loading: jest.fn(), error: jest.fn() }),
}));

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function pressAction(options: unknown): void {
  if (typeof options !== "object" || !options || !("action" in options)) throw new Error("No action");
  const action = options.action;
  if (typeof action !== "object" || !action || !("onClick" in action) || typeof action.onClick !== "function") throw new Error("No action");
  action.onClick();
}

describe("announceHeldSend", () => {
  it("says the copy is still in Sent and retries the move when the cancel could not move it", async () => {
    const moveToDrafts = jest.fn(async () => undefined);
    const onCanceled = jest.fn();
    announceHeldSend({
      hold: { until: "2026-11-20T09:00:00Z" },
      submissionId: "sub",
      sentMessage: "Message sent.",
      timezone: "Europe/Amsterdam",
      timeFormat: "24h",
      cancel: async () => "canceledInSent",
      moveToDrafts,
      onCanceled,
    });
    pressAction(jest.mocked(toast).mock.calls.at(-1)?.[1]);
    await flush();
    const [message, options] = jest.mocked(toast.error).mock.calls.at(-1) ?? [];
    expect([message, options]).toEqual([CANCELED_SEND_IN_SENT_NOTICE, expect.objectContaining({ action: expect.objectContaining({ label: "Retry" }) })]);
    expect(onCanceled).toHaveBeenCalled();
    pressAction(options);
    await flush();
    expect(moveToDrafts).toHaveBeenCalled();
    expect(toast).toHaveBeenLastCalledWith("Moved to Drafts.", { id: "held-send-sub", duration: 4000 });
  });
});
