"use client";

import { AgendaView } from "./agenda-view";
import { DayView } from "./day-view";
import { MobileDayView } from "./mobile-day-view";
import { MobileThreeDayView } from "./mobile-three-day-view";
import { MobileWeekView } from "./mobile-week-view";
import { MonthView } from "./month-view";
import { WeekView } from "./week-view";
import type { CalendarEvent, CalendarView } from "./types";

export function MobileEventCalendarViews({
  compactView,
  currentDate,
  events,
  isMobile,
  onEventCreate,
  onEventSelect,
  showWeekNumbers,
  timeFormat,
  timezone,
  view,
  weekStartDay,
  workingDays,
}: {
  compactView?: boolean;
  currentDate: Date;
  events: CalendarEvent[];
  isMobile: boolean;
  onEventCreate: (startTime: Date) => void;
  onEventSelect: (event: CalendarEvent) => void;
  showWeekNumbers?: boolean;
  timeFormat?: "12h" | "24h";
  timezone?: string;
  view: CalendarView;
  weekStartDay?: number;
  workingDays?: number[];
}) {
  return (
    <div className="flex flex-1 flex-col">
      {view === "month" && (
        <MonthView
          currentDate={currentDate}
          events={events}
          onEventSelect={onEventSelect}
          onEventCreate={onEventCreate}
          showWeekNumbers={showWeekNumbers}
          compactView={compactView}
          timeFormat={timeFormat}
          weekStartDay={weekStartDay}
          workingDays={workingDays}
          timezone={timezone}
        />
      )}
      {view === "week" &&
        (isMobile ? (
          <MobileWeekView
            currentDate={currentDate}
            events={events}
            onEventSelect={onEventSelect}
            onEventCreate={onEventCreate}
            timeFormat={timeFormat}
            weekStartDay={weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6}
            workingDays={workingDays}
            timezone={timezone}
            showMonthPicker={true}
          />
        ) : (
          <WeekView
            currentDate={currentDate}
            events={events}
            onEventSelect={onEventSelect}
            onEventCreate={onEventCreate}
            compactView={compactView}
            timeFormat={timeFormat}
            weekStartDay={weekStartDay}
            workingDays={workingDays}
            timezone={timezone}
          />
        ))}
      {view === "3day" && isMobile && (
        <MobileThreeDayView
          currentDate={currentDate}
          events={events}
          onEventSelect={onEventSelect}
          onEventCreate={onEventCreate}
          timeFormat={timeFormat}
          weekStartDay={weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6}
          workingDays={workingDays}
          timezone={timezone}
        />
      )}
      {view === "day" &&
        (isMobile ? (
          <MobileDayView
            currentDate={currentDate}
            events={events}
            onEventSelect={onEventSelect}
            onEventCreate={onEventCreate}
            timeFormat={timeFormat}
            timezone={timezone}
            workingDays={workingDays}
            showMonthPicker={true}
            weekStartDay={weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6}
          />
        ) : (
          <DayView
            currentDate={currentDate}
            events={events}
            onEventSelect={onEventSelect}
            onEventCreate={onEventCreate}
            compactView={compactView}
            timeFormat={timeFormat}
            workingDays={workingDays}
            timezone={timezone}
          />
        ))}
      {view === "agenda" && (
        <AgendaView
          currentDate={currentDate}
          events={events}
          onEventSelect={onEventSelect}
          onEventCreate={onEventCreate}
          timeFormat={timeFormat}
          timezone={timezone}
        />
      )}
    </div>
  );
}
