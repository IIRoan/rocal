/** @jest-environment jsdom */

import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { wallClockToUtc } from "@workspace/calendar-core";
import { createRoot, type Root } from "react-dom/client";

jest.mock("./encryption-status", () => ({
  EncryptionStatusBadge: () => null,
}));

import { AgendaView } from "./agenda-view";
import {
  CalendarViewTitle,
  MobileCalendarViewTitle,
} from "./calendar-view-title";
import { MonthView } from "./month-view";
import type { CalendarEvent } from "./types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no ResizeObserver; the month view measures its cells with one.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Zones far from any test machine's zone, so browser-local days would land on the wrong day.
const ZONES = ["Pacific/Pago_Pago", "UTC", "Pacific/Kiritimati"];
const NOV_30 = new Date(2026, 10, 30);
const DEC_1 = new Date(2026, 11, 1);

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

describe("month and agenda views in the account time zone", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = (node: React.ReactNode) => {
    act(() => root.render(node));
  };

  it.each(
    ZONES.flatMap(
      (timezone): Array<[string, Date, number, string, string, number]> => [
        [timezone, NOV_30, 23, "2026-10-26", "2026-12-06", 30],
        [timezone, DEC_1, 0, "2026-11-30", "2027-01-03", 31],
      ],
    ),
  )(
    "lays out the %s month of the date",
    (timezone, day, hour, firstCell, lastCell, monthDays) => {
      render(
        <MonthView
          currentDate={wallClockToUtc(day, hour, 30, timezone)}
          events={[]}
          onEventSelect={() => {}}
          onEventCreate={() => {}}
          timeFormat="24h"
          weekStartDay={1}
          timezone={timezone}
        />,
      );

      const cells = Array.from(
        container.querySelectorAll<HTMLElement>("[data-calendar-cell]"),
      );
      const insideMonth = cells.filter(
        (cell) => !cell.closest("[data-outside-cell]"),
      );

      expect(cells[0]?.dataset.cellDate).toBe(firstCell);
      expect(cells.at(-1)?.dataset.cellDate).toBe(lastCell);
      expect(insideMonth).toHaveLength(monthDays);
    },
  );

  it.each(ZONES)("titles the %s month and agenda range", (timezone) => {
    const currentDate = wallClockToUtc(NOV_30, 23, 30, timezone);
    const titles = (view: "month" | "agenda") => {
      render(
        <>
          <CalendarViewTitle
            currentDate={currentDate}
            view={view}
            weekStartDay={1}
            timezone={timezone}
          />
          |
          <MobileCalendarViewTitle
            currentDate={currentDate}
            view={view}
            weekStartDay={1}
            timezone={timezone}
          />
        </>,
      );
      return container.textContent;
    };

    expect(titles("month")).toBe("November 2026|November 2026");
    expect(titles("agenda")).toBe("Nov – Dec 2026|Nov – Dec 2026");
  });

  it.each(ZONES)(
    "starts the agenda on the %s day and groups events by it",
    (timezone) => {
      render(
        <AgendaView
          currentDate={wallClockToUtc(NOV_30, 23, 30, timezone)}
          events={[
            event(
              "late",
              wallClockToUtc(NOV_30, 23, 0, timezone),
              wallClockToUtc(NOV_30, 23, 15, timezone),
            ),
            event(
              "early",
              wallClockToUtc(DEC_1, 0, 15, timezone),
              wallClockToUtc(DEC_1, 0, 45, timezone),
            ),
          ]}
          onEventSelect={() => {}}
          timeFormat="24h"
          timezone={timezone}
        />,
      );

      const sections = Array.from(container.querySelectorAll("section")).map(
        (section) => ({
          header: section.querySelector("header")?.textContent,
          events: Array.from(
            section.querySelectorAll<HTMLElement>("[data-event-id]"),
            (item) => item.dataset.eventId,
          ),
        }),
      );

      expect(sections).toEqual([
        { header: expect.stringMatching(/^30.*November/), events: ["late"] },
        { header: expect.stringMatching(/^1.*December/), events: ["early"] },
      ]);
    },
  );
});
