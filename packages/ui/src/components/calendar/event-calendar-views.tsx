"use client";

import dynamic from "next/dynamic";
import type { Ref } from "react";

import { EventLoadingSkeleton } from "./event-loading-skeleton";
import type { CalendarEvent, CalendarView } from "./types";

const AgendaView = dynamic(
  () => import("./agenda-view").then((mod) => mod.AgendaView),
  {
    ssr: false,
    loading: () => (
      <EventLoadingSkeleton
        view="agenda"
        compactView={false}
        className="absolute inset-0 z-10"
      />
    ),
  },
);
const DayView = dynamic(() => import("./day-view").then((mod) => mod.DayView), {
  ssr: false,
  loading: () => (
    <EventLoadingSkeleton
      view="day"
      compactView={false}
      className="absolute inset-0 z-10"
    />
  ),
});
const ThreeDayView = dynamic(
  () =>
    import("./mobile-three-day-view").then((mod) => mod.MobileThreeDayView),
  {
    ssr: false,
    loading: () => (
      <EventLoadingSkeleton
        view="3day"
        compactView={false}
        className="absolute inset-0 z-10"
      />
    ),
  },
);
const MonthView = dynamic(
  () => import("./month-view").then((mod) => mod.MonthView),
  {
    ssr: false,
    loading: () => (
      <EventLoadingSkeleton
        view="month"
        compactView={false}
        className="absolute inset-0 z-10"
      />
    ),
  },
);
const WeekView = dynamic(
  () => import("./week-view").then((mod) => mod.WeekView),
  {
    ssr: false,
    loading: () => (
      <EventLoadingSkeleton
        view="week"
        compactView={false}
        className="absolute inset-0 z-10"
      />
    ),
  },
);

type EventCalendarViewStageProps = {
  compactView?: boolean;
  currentDate: Date;
  events: CalendarEvent[];
  onEventCreate: (startTime: Date) => void;
  onEventDelete: (eventId: string) => void;
  onEventEdit?: (
    event: CalendarEvent,
    options?: {
      mode?: "modal" | "popover";
      anchorPosition?: { x: number; y: number };
      eventViewMode?: "view" | "edit";
    },
  ) => void;
  onEventSelect: (event: CalendarEvent) => void;
  showWeekNumbers?: boolean;
  stageKey: string;
  stageRef: Ref<HTMLDivElement>;
  timeFormat?: "12h" | "24h";
  timezone?: string;
  view: CalendarView;
  weekStartDay?: number;
  workingDays?: number[];
};

export function EventCalendarViewStage({
  compactView,
  currentDate,
  events,
  onEventCreate,
  onEventDelete,
  onEventEdit,
  onEventSelect,
  showWeekNumbers,
  stageKey,
  stageRef,
  timeFormat,
  timezone,
  view,
  weekStartDay,
  workingDays,
}: EventCalendarViewStageProps) {
  const sharedViewProps = {
    currentDate,
    events,
    onEventSelect,
    onEventCreate,
    compactView,
    timeFormat,
    timezone,
    onEventEdit,
    onEventDelete: (event: CalendarEvent) => onEventDelete(event.id),
    onEventView: onEventEdit,
  };

  return (
    <div className="flex flex-1 flex-col relative min-h-0 overflow-hidden">
      <div
        key={stageKey}
        ref={stageRef}
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {view === "month" && (
          <MonthView
            {...sharedViewProps}
            showWeekNumbers={showWeekNumbers}
            weekStartDay={weekStartDay}
            workingDays={workingDays}
          />
        )}
        {view === "week" && (
          <WeekView
            {...sharedViewProps}
            weekStartDay={weekStartDay}
            workingDays={workingDays}
          />
        )}
        {view === "day" && <DayView {...sharedViewProps} />}
        {view === "3day" && (
          <div className="absolute inset-0 min-h-0">
            <ThreeDayView
              currentDate={currentDate}
              events={events}
              onEventSelect={onEventSelect}
              onEventCreate={onEventCreate}
              timeFormat={timeFormat}
              weekStartDay={weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6}
              workingDays={workingDays}
              timezone={timezone}
              onEventEdit={onEventEdit}
              onEventDelete={(event) => onEventDelete(event.id)}
              onEventView={onEventEdit}
            />
          </div>
        )}
        {view === "agenda" && (
          <AgendaView
            currentDate={currentDate}
            events={events}
            onEventSelect={onEventSelect}
            timeFormat={timeFormat}
            timezone={timezone}
            onEventEdit={onEventEdit}
            onEventDelete={(event) => onEventDelete(event.id)}
            onEventView={onEventEdit}
          />
        )}
      </div>
    </div>
  );
}
