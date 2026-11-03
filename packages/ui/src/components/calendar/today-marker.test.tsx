/** @jest-environment jsdom */

import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { utcToPickerDate } from "@workspace/calendar-core";
import { addDays } from "date-fns";
import { createRoot, type Root } from "react-dom/client";

import { MonthDayCell } from "./month-day-cell";
import { ThreeDayViewDayHeaders } from "./three-day-view-day-headers";
import { WeekViewDayHeaders } from "./week-view-day-headers";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const TIMEZONE = "Europe/Amsterdam";
const today = utcToPickerDate(new Date(), TIMEZONE);
const days = [addDays(today, -1), today, addDays(today, 1)];
const EMPTY_BUCKETS = {
  dayEvents: [],
  spanningEvents: [],
  allEvents: [],
  sortedAllDay: [],
};

describe("today in the calendar grids", () => {
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

  const currentMarks = () =>
    Array.from(container.querySelectorAll("[aria-current='date']"));

  it("marks only today's week header, in both header layouts", () => {
    act(() => {
      root.render(
        <WeekViewDayHeaders currentDate={today} days={days} timezone={TIMEZONE} />,
      );
    });

    const marks = currentMarks();
    expect(marks).toHaveLength(2);
    for (const mark of marks) {
      expect(mark.textContent).toMatch(/^Today, /);
    }
  });

  it("marks only today's three-day column header", () => {
    act(() => {
      root.render(
        <ThreeDayViewDayHeaders
          currentDate={today}
          days={days}
          timezone={TIMEZONE}
        />,
      );
    });

    const marks = currentMarks();
    expect(marks).toHaveLength(1);
    expect(marks[0]?.textContent).toContain("Today, ");
  });

  it("marks today's day number in the month grid and leaves other days plain", () => {
    const renderCell = (day: Date) => (
      <MonthDayCell
        key={day.toISOString()}
        day={day}
        currentDate={today}
        buckets={EMPTY_BUCKETS}
        weekIndex={1}
        dayIndex={1}
        isMounted={false}
        compactView={false}
        timeFormat="24h"
        workingDays={[1, 2, 3, 4, 5]}
        timezone={TIMEZONE}
        resolvedTimezone={TIMEZONE}
        contentRef={{ current: null }}
        getVisibleEventCount={(total) => total}
        onEventSelect={() => {}}
        onEventCreate={() => {}}
      />
    );
    act(() => {
      root.render(<>{days.map(renderCell)}</>);
    });

    const marks = currentMarks();
    expect(marks).toHaveLength(1);
    expect(marks[0]?.textContent).toBe(`Today, ${today.getDate()}`);
  });
});
