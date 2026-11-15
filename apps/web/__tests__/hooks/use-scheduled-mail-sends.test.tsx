/** @jest-environment jsdom */

import React, { act } from "react";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";
import type { ScheduledMailSend } from "@workspace/calendar-core";
import { useScheduledMailSends } from "../../hooks/use-scheduled-mail-sends";
import type { MailConnection } from "../../hooks/use-mail-vacation-response";
import { mailQueryKeys } from "../../lib/mail/mail-query-keys";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const send: ScheduledMailSend = {
  submissionId: "sub-1",
  emailId: "copy-1",
  sendAt: "2026-11-16T07:00:00Z",
  subject: "Plans",
  recipients: ["bob@solace.onl"],
};

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

function renderHook(connection: MailConnection, queryClient: QueryClient) {
  const result: { current: ReturnType<typeof useScheduledMailSends> | null } = { current: null };
  function Probe() {
    result.current = useScheduledMailSends(connection, "user-1", "drafts");
    return null;
  }
  root = createRoot(document.createElement("div"));
  act(() =>
    root?.render(
      <QueryClientProvider client={queryClient}>
        <Probe />
      </QueryClientProvider>,
    ),
  );
  return result;
}

describe("useScheduledMailSends", () => {
  it("removes a canceled send optimistically and restores it when the cancel fails", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(mailQueryKeys.scheduledSends("user-1"), [send]);
    let rejectCancel: (error: Error) => void = () => undefined;
    const client = {
      listScheduledSends: jest.fn(async () => [send]),
      cancelHeldSubmission: jest.fn(
        () => new Promise<"canceled" | "sent">((_resolve, reject) => { rejectCancel = reject; }),
      ),
    };
    const connection = { client, session: {} } as unknown as MailConnection; // test double for the JMAP client
    const result = renderHook(connection, queryClient);

    let pending: Promise<unknown> = Promise.resolve();
    await act(async () => {
      pending = result.current?.cancel(send).catch(() => undefined) ?? pending;
    });
    expect(queryClient.getQueryData(mailQueryKeys.scheduledSends("user-1"))).toEqual([]);
    expect(client.cancelHeldSubmission).toHaveBeenCalledWith({}, { submissionId: "sub-1", copyEmailId: "copy-1", draftsMailboxId: "drafts" });

    await act(async () => {
      rejectCancel(new Error("offline"));
      await pending;
    });
    expect(queryClient.getQueryData(mailQueryKeys.scheduledSends("user-1"))).toEqual([send]);
  });
});
