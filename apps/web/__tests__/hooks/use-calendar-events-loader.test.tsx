/** @jest-environment jsdom */

import React, { act } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot, type Root } from "react-dom/client";
import {
  buildPaddedCalendarMonthRanges,
  getZonedDayUtcBounds,
  wallClockToUtc,
  type CalendarEvent,
} from "@workspace/calendar-core";

jest.mock("../../lib/calendar-api-service", () => ({
  calendarApiService: { getEvents: jest.fn() },
}));

import { calendarApiService } from "../../lib/calendar-api-service";
import {
  EVENTS_QUERY_KEY,
  getMonthQueryKey,
  useCalendarEventsLoader,
} from "../../hooks/use-calendar-events-loader";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockGetEvents = jest.mocked(calendarApiService.getEvents);

// Zones far from any test machine's zone, so browser-local months would pick the wrong cache.
const ZONES = ["Pacific/Pago_Pago", "UTC", "Pacific/Kiritimati"];

function event(id: string, start: Date, end: Date): CalendarEvent {
  return {
    id,
    title: id,
    start,
    end,
    calendarId: "cal-1",
    userId: "user-1",
    createdAt: start,
    updatedAt: start,
  };
}

let container: HTMLDivElement;
let queryClient: QueryClient;
let root: Root;
let serverEvents: CalendarEvent[];
const loader: { current: ReturnType<typeof useCalendarEventsLoader> | null } = {
  current: null,
};

function Harness({
  autoRefetch,
  initialDate,
  timezone,
}: {
  autoRefetch: boolean;
  initialDate?: Date;
  timezone: string;
}) {
  const value = useCalendarEventsLoader({
    autoRefetch,
    preloadMonthsAhead: 0,
    timezone,
    initialDate,
  });
  React.useEffect(() => {
    loader.current = value;
  });
  return null;
}

/** Re-rendering keeps the loader mounted, so a new zone reuses its state. */
function renderLoader(
  timezone: string,
  autoRefetch: boolean,
  initialDate?: Date,
) {
  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <Harness
          autoRefetch={autoRefetch}
          initialDate={initialDate}
          timezone={timezone}
        />
      </QueryClientProvider>,
    );
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  serverEvents = [];
  mockGetEvents.mockImplementation(async (start, end) => ({
    events: serverEvents.filter(
      (item) => item.start < end && item.end > start,
    ),
    categories: [],
    calendars: [],
  }));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  queryClient.clear();
  jest.clearAllMocks();
});

describe("useCalendarEventsLoader in the account time zone", () => {
  it("loads the initial date's account-zone month before the calendar moves", async () => {
    // 22:00 UTC on February 28 is already March 1 in Kiritimati.
    renderLoader("Pacific/Kiritimati", true, new Date("2026-02-28T22:00:00.000Z"));
    await act(async () => {
      await Promise.resolve();
    });

    expect(
      queryClient
        .getQueryCache()
        .findAll({ queryKey: EVENTS_QUERY_KEY })
        .map((query) => query.queryKey[1]),
    ).toEqual(["2026-03"]);
  });

  it("refetches a month when the account zone changes", async () => {
    // Just after the Kiritimati-padded range of March, but inside the UTC-padded one.
    const edge = new Date("2026-04-07T12:00:00.000Z");
    serverEvents = [event("edge", edge, new Date(edge.getTime() + 30 * 60 * 1000))];
    const month = wallClockToUtc(new Date(2026, 2, 15), 12, 0, "UTC");

    renderLoader("Pacific/Kiritimati", true);
    await act(async () => {
      loader.current?.setMonth(month);
    });
    expect(loader.current?.events.map((item) => item.id)).toEqual([]);

    renderLoader("UTC", true);
    // Await the fetch before its timed observer notification, so an idle timer cannot win the race.
    await act(async () => {
      await queryClient.getQueryCache().find({
        queryKey: getMonthQueryKey("2026-03", "UTC"),
        exact: true,
      })?.promise;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockGetEvents).toHaveBeenCalledTimes(2);
    expect(loader.current?.events.map((item) => item.id)).toEqual(["edge"]);
  });

  it("loads the latest date's month after a zone change", async () => {
    renderLoader("Europe/Amsterdam", true);
    // 00:30 on March 1 in Amsterdam is still February in London.
    await act(async () => {
      loader.current?.setMonth(
        wallClockToUtc(new Date(2026, 2, 1), 0, 30, "Europe/Amsterdam"),
      );
    });
    await act(async () => {
      loader.current?.setMonth(
        wallClockToUtc(new Date(2026, 2, 20), 12, 0, "Europe/Amsterdam"),
      );
    });
    renderLoader("Europe/London", true);

    expect(
      queryClient
        .getQueryCache()
        .findAll({ queryKey: EVENTS_QUERY_KEY, type: "active" })
        .map((query) => query.queryKey[1]),
    ).toEqual(["2026-03"]);
  });

  it.each(ZONES)(
    "caches the whole six-week mini calendar grid of a month in %s",
    async (timezone) => {
      // February 2026 starts on a Sunday, so a Sunday-start grid ends 14 days after the month.
      const lastGridDay = new Date(2026, 2, 14);
      const gridRange = {
        start: getZonedDayUtcBounds(new Date(2026, 1, 1), timezone).start,
        end: getZonedDayUtcBounds(lastGridDay, timezone).end,
      };
      serverEvents = [
        event(
          "last-row",
          wallClockToUtc(lastGridDay, 23, 0, timezone),
          wallClockToUtc(lastGridDay, 23, 30, timezone),
        ),
      ];
      renderLoader(timezone, false);

      // The mini calendar prefetches the neighbouring months too; the last row lives in March's cache.
      await act(async () => {
        for (const range of buildPaddedCalendarMonthRanges(new Date(2026, 1, 1), {
          adjacentMonthDepth: 1,
          timezone,
        })) {
          loader.current?.prefetchRange(range);
        }
      });

      expect(
        loader.current?.getCachedEventsForRange(gridRange)?.map((item) => item.id),
      ).toEqual(["last-row"]);
    },
  );

  it.each(
    ZONES.flatMap((timezone): Array<[string, Date, number, string]> => [
      [timezone, new Date(2026, 10, 30), 23, "2026-11"],
      [timezone, new Date(2026, 11, 1), 0, "2026-12"],
    ]),
  )(
    "loads the %s month of a date at the edge of a month",
    async (timezone, day, hour, month) => {
      renderLoader(timezone, true);

      await act(async () => {
        loader.current?.setMonth(wallClockToUtc(day, hour, 30, timezone));
      });

      expect(
        queryClient
          .getQueryCache()
          .findAll({ queryKey: EVENTS_QUERY_KEY })
          .map((query) => query.queryKey[1])
          .filter((key) => key !== "none"),
      ).toEqual([month]);
    },
  );
});
