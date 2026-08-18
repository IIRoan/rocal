"use client";

import dynamic from "next/dynamic";

import { CalendarSkeleton } from "./calendar-skeleton";
import type { CalendarEvent, CalendarView } from "./types";

const AgendaView = dynamic(
  () => import("./agenda-view").then((mod) => mod.AgendaView),
  {
    ssr: false,
    loading: () => <CalendarSkeleton view="agenda" compactView={false} />,
  },
);
const DayView = dynamic(() => import("./day-view").then((mod) => mod.DayView), {
  ssr: false,
  loading: () => <CalendarSkeleton view="day" compactView={false} />,
});
const MonthView = dynamic(
  () => import("./month-view").then((mod) => mod.MonthView),
  {
    ssr: false,
    loading: () => <CalendarSkeleton view="month" compactView={false} />,
  },
);
const WeekView = dynamic(
  () => import("./week-view").then((mod) => mod.WeekView),
  {
    ssr: false,
    loading: () => <CalendarSkeleton view="week" compactView={false} />,
  },
);
const MobileDayView = dynamic(
  () => import("./mobile-day-view").then((mod) => mod.MobileDayView),
  {
    ssr: false,
    loading: () => <CalendarSkeleton view="day" compactView={false} />,
  },
);
const MobileWeekView = dynamic(
  () => import("./mobile-week-view").then((mod) => mod.MobileWeekView),
  {
    ssr: false,
    loading: () => <CalendarSkeleton view="week" compactView={false} />,
  },
);
const MobileThreeDayView = dynamic(
  () => import("./mobile-three-day-view").then((mod) => mod.MobileThreeDayView),
  {
    ssr: false,
    loading: () => <CalendarSkeleton view="3day" compactView={false} />,
  },
);

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
