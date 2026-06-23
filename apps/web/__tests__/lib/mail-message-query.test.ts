import { describe, expect, it } from "@jest/globals";
import { QueryClient } from "@tanstack/react-query";

import {
  fetchMailMessageById,
  findCachedMailMessage,
  mergeMessageIntoMailboxCaches,
  seedMailMessageCache,
} from "../../lib/mail/mail-message-query";
import { mailQueryKeys } from "../../lib/mail/mail-query-keys";
import type { JmapEmailMessage } from "../../lib/mail/types";

function message(
  overrides: Partial<JmapEmailMessage> & Pick<JmapEmailMessage, "id">,
): JmapEmailMessage {
  return {
    subject: overrides.subject ?? "Subject",
    ...overrides,
  };
}

describe("mail message query cache", () => {
  it("finds a message from mailbox list cache", () => {
    const queryClient = new QueryClient();
    seedMailMessageCache(
      queryClient,
      "mb-inbox",
      [message({ id: "message-1" })],
      1,
    );

    expect(findCachedMailMessage(queryClient, "message-1")?.id).toBe(
      "message-1",
    );
    expect(findCachedMailMessage(queryClient, "missing")).toBeUndefined();
  });

  it("finds a message from the direct message cache", () => {
    const queryClient = new QueryClient();
    const cached = message({ id: "message-2" });
    queryClient.setQueryData(mailQueryKeys.message("message-2"), cached);

    expect(findCachedMailMessage(queryClient, "message-2")).toEqual(cached);
  });

  it("merges a fetched message into mailbox caches", () => {
    const queryClient = new QueryClient();
    seedMailMessageCache(
      queryClient,
      "mb-inbox",
      [message({ id: "message-1" })],
      1,
    );

    const fetched = message({ id: "message-2", subject: "Fetched" });
    mergeMessageIntoMailboxCaches(queryClient, fetched);

    const mailboxCache = queryClient.getQueryData<{
      messages: JmapEmailMessage[];
    }>(mailQueryKeys.mailboxMessages("mb-inbox"));

    expect(mailboxCache?.messages.map((entry) => entry.id)).toEqual([
      "message-1",
      "message-2",
    ]);
    expect(findCachedMailMessage(queryClient, "message-2")?.subject).toBe(
      "Fetched",
    );
  });

  it("fetches by id through TanStack Query when cache is empty", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const fetched = message({ id: "message-3", subject: "Remote" });
    let fetchCount = 0;

    const result = await fetchMailMessageById(queryClient, {
      client: {
        getMessagesByIds: async () => {
          fetchCount += 1;
          return [fetched];
        },
      } as never,
      session: {} as never,
      messageId: "message-3",
    });

    expect(result).toEqual(fetched);
    expect(queryClient.getQueryData(mailQueryKeys.message("message-3"))).toEqual(
      fetched,
    );
    expect(fetchCount).toBe(1);
  });

  it("reuses cached message data without refetching", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const cached = message({
      id: "message-4",
      textBody: [{ partId: "text", type: "text/plain" }],
      bodyValues: { text: { value: "Cached body" } },
    });
    queryClient.setQueryData(mailQueryKeys.message("message-4"), cached);

    let fetchCount = 0;
    const result = await fetchMailMessageById(queryClient, {
      client: {
        getMessagesByIds: async () => {
          fetchCount += 1;
          return [message({ id: "message-4", subject: "Remote" })];
        },
      } as never,
      session: {} as never,
      messageId: "message-4",
    });

    expect(result).toEqual(cached);
    expect(fetchCount).toBe(0);
  });

  it("refetches preview-only cached rows when a full body is required", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    seedMailMessageCache(
      queryClient,
      "mb-inbox",
      [message({ id: "message-5", preview: "Snippet" })],
      1,
    );

    const fetched = message({
      id: "message-5",
      textBody: [{ partId: "text", type: "text/plain" }],
      bodyValues: { text: { value: "Full body" } },
    });
    let fetchCount = 0;

    const result = await fetchMailMessageById(queryClient, {
      client: {
        getMessagesByIds: async () => {
          fetchCount += 1;
          return [fetched];
        },
      } as never,
      session: {} as never,
      messageId: "message-5",
      requireBody: true,
    });

    expect(result.bodyValues?.text?.value).toBe("Full body");
    expect(fetchCount).toBe(1);
  });
});
