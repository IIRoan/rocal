/** @jest-environment jsdom */

import React, { act, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";
import {
  CALENDARS_QUERY_KEY,
  EVENT_TRASH_QUERY_KEY,
  type CalendarEvent,
  type TrashedCalendarEvent,
} from "@workspace/calendar-core";

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock("../../hooks/use-settings", () => ({
  useSettings: () => ({ settings: { timezone: "Europe/Amsterdam" } }),
}));

jest.mock("../../lib/calendar-api-service", () => ({
  calendarApiService: {
    listTrashedEvents: jest.fn(),
    restoreTrashedEvent: jest.fn(),
    deleteTrashedEvent: jest.fn(),
    emptyEventTrash: jest.fn(),
  },
}));

import { toast } from "sonner";
import { useRestoreTrashedEvent } from "../../hooks/use-event-trash";
import { calendarApiService } from "../../lib/calendar-api-service";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const entry = (id: string) => ({ id, calendarId: "gone" }) as TrashedCalendarEvent;

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;
let restore: ReturnType<typeof useRestoreTrashedEvent>;

function Harness({ onReady }: { onReady: (value: typeof restore) => void }) {
  const value = useRestoreTrashedEvent();
  useEffect(() => onReady(value));
  return null;
}

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  queryClient = new QueryClient();
  queryClient.setQueryData(EVENT_TRASH_QUERY_KEY, [entry("t1"), entry("t2")]);
  queryClient.setQueryData(CALENDARS_QUERY_KEY, [{ id: "personal", name: "Personal" }]);
  jest.mocked(calendarApiService.listTrashedEvents).mockResolvedValue([entry("t2")]);
  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <Harness
          onReady={(value) => {
            restore = value;
          }}
        />
      </QueryClientProvider>,
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const cachedIds = () =>
  queryClient.getQueryData<TrashedCalendarEvent[]>(EVENT_TRASH_QUERY_KEY)?.map((cached) => cached.id);

describe("useRestoreTrashedEvent", () => {
  it("takes the entry out of the trash at once and names the calendar it fell back to", async () => {
    let finish: (event: CalendarEvent) => void = () => undefined;
    jest.mocked(calendarApiService.restoreTrashedEvent).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );

    await act(async () => restore.mutate({ trashId: "t1", calendarId: "gone" }));
    expect(cachedIds()).toEqual(["t2"]);

    await act(async () =>
      finish({ id: "event-1", calendarId: "personal", start: new Date(), end: new Date() } as CalendarEvent),
    );
    expect(toast.success).toHaveBeenCalledWith("Restored to Personal");
  });

  it("puts the entry back and says so when the restore fails", async () => {
    jest.mocked(calendarApiService.restoreTrashedEvent).mockRejectedValue(new Error("offline"));

    await act(async () => restore.mutate({ trashId: "t1", calendarId: "gone" }));

    expect(cachedIds()).toEqual(["t1", "t2"]);
    expect(toast.error).toHaveBeenCalledWith("offline", expect.anything());
  });

  it("refreshes only the loaded months a restored series reaches", async () => {
    const months = ["2026-01", "2026-03", "2026-05"];
    for (const month of months) queryClient.setQueryData(["events", month, "Europe/Amsterdam"], []);
    queryClient.setQueryData(["events", "detail", "event-1"], null);
    jest.mocked(calendarApiService.restoreTrashedEvent).mockResolvedValue({
      id: "event-1",
      calendarId: "personal",
      start: new Date("2026-03-10T09:00:00.000Z"),
      end: new Date("2026-03-10T10:00:00.000Z"),
      recurrence: "FREQ=WEEKLY",
    } as CalendarEvent);

    await act(async () => restore.mutate({ trashId: "t1", calendarId: "personal" }));

    const invalidated = (key: readonly unknown[]) => queryClient.getQueryState(key)?.isInvalidated;
    expect(months.map((month) => invalidated(["events", month, "Europe/Amsterdam"]))).toEqual([false, true, true]);
    expect(invalidated(["events", "detail", "event-1"])).toBe(true);
  });
});
