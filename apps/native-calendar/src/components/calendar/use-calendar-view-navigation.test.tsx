/** @jest-environment jsdom */

import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { formatCalendarDayKey } from "@workspace/calendar-core";
import {
  CalendarViewProvider,
  useCalendarView,
} from "../../providers/CalendarViewProvider";
import type { NativeTimelineCalendarHandle } from "./NativeTimelineCalendar";
import { useCalendarViewNavigation } from "./use-calendar-view-navigation";

jest.mock("../../providers/SheetProvider", () => ({
  useSheet: () => ({ openEventSheet: () => undefined }),
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type Navigation = ReturnType<typeof useCalendarViewNavigation>;

function Probe({
  selectedDate,
  onNavigation,
}: {
  selectedDate: Date;
  onNavigation: (navigation: Navigation) => void;
}) {
  const { setActiveView, setSelectedDate } = useCalendarView();
  const navigation = useCalendarViewNavigation("Europe/Amsterdam");
  useEffect(() => {
    setActiveView("3day");
    setSelectedDate(selectedDate);
  }, [selectedDate, setActiveView, setSelectedDate]);
  useEffect(() => onNavigation(navigation));
  return null;
}

describe("useCalendarViewNavigation in 3-day view", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
  });

  it("steps the whole three-day window, centred on the selected day", () => {
    let navigation: Navigation | undefined;
    act(() => {
      root.render(
        <CalendarViewProvider>
          <Probe
            selectedDate={new Date(2026, 10, 4)}
            onNavigation={(next) => {
              navigation = next;
            }}
          />
        </CalendarViewProvider>,
      );
    });

    const rendered = navigation;
    if (!rendered) throw new Error("navigation hook did not render");
    const goToDate = jest.fn();
    const handle: NativeTimelineCalendarHandle = {
      goToDate,
      goToNextPage: jest.fn(),
      goToPrevPage: jest.fn(),
    };
    rendered.timelineRef.current = handle;

    act(() => rendered.handleNavigateForward());
    act(() => rendered.handleNavigateBackward());

    expect(goToDate.mock.calls.map(([date]) => formatCalendarDayKey(date))).toEqual([
      "2026-11-07",
      "2026-11-01",
    ]);
    expect(handle.goToNextPage).not.toHaveBeenCalled();
    expect(handle.goToPrevPage).not.toHaveBeenCalled();
  });
});
