/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CalendarEvent } from "@workspace/calendar-core";
import { loadEventSearchCorpus } from "@workspace/calendar-client";
import { useUnifiedSearch } from "@/hooks/use-unified-search";

jest.mock("@workspace/calendar-client", () => ({
  loadEventSearchCorpus: jest.fn(),
}));
jest.mock("@/lib/calendar-api-service", () => ({ calendarApiService: {} }));
jest.mock("@/lib/mail/api-service", () => ({ mailDemoApiService: {} }));
jest.mock("@/lib/mail/jmap-client", () => ({ StalwartJmapClient: jest.fn() }));
jest.mock("@/lib/mail/oauth-client", () => ({
  createMailOAuthTokenManager: jest.fn(),
}));
jest.mock("@/lib/search/private-title-index", () => ({
  mailDocumentToMessageStub: jest.fn(),
}));
jest.mock("@/hooks/use-private-title-index", () => ({
  usePrivateTitleIndex: () => ({ documents: [], enabled: true, isIndexing: false }),
}));

const mockLoadCorpus = jest.mocked(loadEventSearchCorpus);
const planning: CalendarEvent = {
  id: "event-1",
  title: "Quarterly planning",
  description: "Budget review",
  start: new Date("2026-05-01T10:00:00.000Z"),
  end: new Date("2026-05-01T11:00:00.000Z"),
  calendarId: "cal-1",
  userId: "user-1",
  createdAt: new Date("2026-04-01T10:00:00.000Z"),
  updatedAt: new Date("2026-04-01T10:00:00.000Z"),
};

let root: Root;
let container: HTMLDivElement;

function Harness({ query }: { query: string }) {
  const { results } = useUnifiedSearch({ query, includeMail: false });
  return <p>{results.map((result) => result.id).join(",")}</p>;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mockLoadCorpus.mockResolvedValue([planning]);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

it("searches calendar events on the device without sending the search words", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <Harness query="budget" />
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  expect(mockLoadCorpus).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(mockLoadCorpus.mock.calls[0]?.slice(0, 2))).not.toContain(
    "budget",
  );
  expect(container.textContent).toBe("calendar:event-1");
});
