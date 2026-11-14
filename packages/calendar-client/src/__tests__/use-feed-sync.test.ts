/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, jest } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EVENTS_QUERY_KEY, SUBSCRIPTIONS_QUERY_KEY } from "@workspace/calendar-core";

import { useFeedSync } from "../use-feed-sync";

// The package root pulls in mail crypto, which needs a TextEncoder jsdom lacks.
jest.mock("@workspace/calendar-core", () => ({
  ...jest.requireActual<object>("@workspace/calendar-core/calendar-query-keys"),
  ...jest.requireActual<object>("@workspace/calendar-core/subscription-feed"),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

async function render(enabled: boolean, attempted: number) {
  const client = new QueryClient();
  const invalidate = jest.spyOn(client, "invalidateQueries");
  const api = { syncDueSubscriptions: jest.fn(async () => attempted) };
  function Probe() {
    useFeedSync({ api, enabled });
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => {
    root.render(
      React.createElement(QueryClientProvider, { client }, React.createElement(Probe)),
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  act(() => root.unmount());
  return { api, invalidate };
}

it("syncs due feeds on open and refreshes feeds and events when it tried any", async () => {
  const { api, invalidate } = await render(true, 2);

  expect(api.syncDueSubscriptions).toHaveBeenCalledTimes(1);
  expect(invalidate.mock.calls.map(([filters]) => filters)).toEqual([
    { queryKey: SUBSCRIPTIONS_QUERY_KEY, exact: true },
    { queryKey: EVENTS_QUERY_KEY },
  ]);
});

it("refreshes nothing when no feed was due, and never runs while disabled", async () => {
  expect((await render(true, 0)).invalidate).not.toHaveBeenCalled();
  expect((await render(false, 1)).api.syncDueSubscriptions).not.toHaveBeenCalled();
});
