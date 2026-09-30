/** @jest-environment jsdom */

import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import { usePrefetchThreadMessages } from "./use-conversation-thread";
import type { JmapEmailMessage } from "./types";

it("keeps combined thread messages stable until their data changes", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  const client = new QueryClient();
  const root = createRoot(document.createElement("div"));
  const messages: JmapEmailMessage[] = [
    { id: "first", threadId: "thread-1" },
    { id: "second", threadId: "thread-2" },
  ];
  const sibling: JmapEmailMessage = { id: "sibling", threadId: "thread-1" };
  const onChange = jest.fn();
  client.setQueryData(QUERY_KEYS.mailThread("thread-1"), [messages[0], sibling]);
  client.setQueryData(QUERY_KEYS.mailThread("thread-2"), [messages[1], sibling]);

  function ThreadMessages() {
    const combined = usePrefetchThreadMessages(undefined, messages);
    useEffect(() => onChange(combined), [combined]);
    return null;
  }

  const render = () =>
    root.render(
      <QueryClientProvider client={client}>
        <ThreadMessages />
      </QueryClientProvider>,
    );

  try {
    await act(async () => render());
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith([
      messages[0],
      sibling,
      messages[1],
    ]);

    await act(async () => render());
    expect(onChange).toHaveBeenCalledTimes(1);

    const updated = { ...messages[1], subject: "Updated subject" };
    await act(async () => {
      client.setQueryData(QUERY_KEYS.mailThread("thread-2"), [updated, sibling]);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith([messages[0], sibling, updated]);
  } finally {
    await act(async () => root.unmount());
    client.clear();
  }
});
