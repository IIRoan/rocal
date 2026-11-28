/** @jest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  getPaddedCalendarMonthRange,
  type EventsResponse,
} from "@workspace/calendar-core";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import { useMiniCalendarPages } from "./use-mini-calendar-pages";

jest.mock("@workspace/native-core/lib/api", () => ({
  calendarApiService: { getEvents: () => new Promise(() => undefined) },
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const month = new Date(2026, 10, 1);
const range = getPaddedCalendarMonthRange(month, undefined, "Europe/Amsterdam");
const queryKey = QUERY_KEYS.events(
  range.start.toISOString(),
  range.end.toISOString(),
);
const response: EventsResponse = {
  events: [
    {
      id: "event-1",
      title: "Saved event",
      calendarId: "calendar-1",
      userId: "owner",
      start: new Date("2026-11-12T09:00:00Z"),
      end: new Date("2026-11-12T10:00:00Z"),
      createdAt: month,
      updatedAt: month,
    },
  ],
  calendars: [],
  categories: [],
};

function Probe() {
  const { pages } = useMiniCalendarPages({
    epochMonth: month,
    committedIndex: 0,
    calendarMonth: month,
    weekStartDay: 1,
    timezone: "Europe/Amsterdam",
  });
  return (
    <output>
      {pages
        .flatMap((page) =>
          [...page.eventsByDay.values()].flat().map((event) => event.title),
        )
        .join(",")}
    </output>
  );
}

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;

beforeEach(() => {
  jest.useFakeTimers({ legacyFakeTimers: true });
  container = document.createElement("div");
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(queryKey, response);
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  client.clear();
  jest.useRealTimers();
});

it("keeps cached events visible during a background refetch", async () => {
  expect(container.textContent).toContain("Saved event");
  await act(async () => {
    void client
      .invalidateQueries({ queryKey, exact: true })
      .catch(() => undefined);
    jest.advanceTimersByTime(1);
  });
  expect(container.textContent).toContain("Saved event");
});

it("clears events when the owning query cache is reset", async () => {
  expect(container.textContent).toContain("Saved event");
  await act(async () => {
    void client.resetQueries({ queryKey, exact: true }).catch(() => undefined);
    jest.advanceTimersByTime(1);
  });
  expect(container.textContent).not.toContain("Saved event");
});
