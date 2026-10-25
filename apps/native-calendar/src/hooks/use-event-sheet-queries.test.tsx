/** @jest-environment jsdom */

import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CalendarEvent } from "@workspace/calendar-core";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import { useEventSheetEvent } from "./use-event-sheet-queries";

const mockGetEvent = jest.fn<Promise<CalendarEvent>, [string]>();

jest.mock("@workspace/native-core/lib/api", () => ({
  calendarApiService: { getEvent: (id: string) => mockGetEvent(id) },
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const OCCURRENCE_ID = "series-1_2026-11-03T09:00:00.000Z";

const series = {
  id: "series-1",
  title: "Standup",
  calendarId: "cal-1",
  userId: "user-1",
  recurrence: '{"frequency":"weekly","interval":1}',
  start: new Date("2026-10-06T09:00:00.000Z"),
  end: new Date("2026-10-06T09:30:00.000Z"),
} as CalendarEvent;

const occurrence = {
  ...series,
  id: OCCURRENCE_ID,
  parentEventId: "series-1",
  isRecurringInstance: true,
  start: new Date("2026-11-03T09:00:00.000Z"),
  end: new Date("2026-11-03T09:30:00.000Z"),
} as CalendarEvent;

function Harness({ queryClient, onEvent }: { queryClient: QueryClient; onEvent: (event?: CalendarEvent) => void }) {
  return (
    <QueryClientProvider client={queryClient}>
      <Probe onEvent={onEvent} />
    </QueryClientProvider>
  );
}

function Probe({ onEvent }: { onEvent: (event?: CalendarEvent) => void }) {
  const { data } = useEventSheetEvent(OCCURRENCE_ID, true);
  useEffect(() => onEvent(data));
  return null;
}

let root: Root;
let queryClient: QueryClient;

beforeEach(() => {
  mockGetEvent.mockReset();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  root = createRoot(document.createElement("div"));
});

afterEach(() => {
  act(() => root.unmount());
  queryClient.clear();
});

async function loadedEvent(): Promise<CalendarEvent | undefined> {
  let latest: CalendarEvent | undefined;
  await act(async () => {
    root.render(<Harness queryClient={queryClient} onEvent={(event) => { latest = event; }} />);
  });
  await act(async () => {
    await mockGetEvent.mock.results[0]?.value;
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return latest;
}

describe("useEventSheetEvent", () => {
  it("keeps the tapped occurrence when the API answers with its series", async () => {
    mockGetEvent.mockResolvedValue(series);
    queryClient.setQueryData(QUERY_KEYS.events("2026-11-01T00:00:00.000Z", "2026-12-01T00:00:00.000Z"), {
      events: [occurrence],
    });

    const event = await loadedEvent();

    expect(mockGetEvent).toHaveBeenCalledWith(OCCURRENCE_ID);
    expect(event).toMatchObject({ id: OCCURRENCE_ID, start: occurrence.start });
  });

  it("labels an uncached series answer with the tapped id so recurring edits find the occurrence", async () => {
    mockGetEvent.mockResolvedValue(series);

    const event = await loadedEvent();

    expect(event).toMatchObject({ id: OCCURRENCE_ID, recurrence: series.recurrence });
  });
});
