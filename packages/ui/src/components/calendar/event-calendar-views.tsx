"use client";

import type { Ref } from "react";

import { AgendaView } from "./agenda-view";
import { DayView } from "./day-view";
import { MobileThreeDayView } from "./mobile-three-day-view";
import { MonthView } from "./month-view";
import { WeekView } from "./week-view";
import type { CalendarEvent, CalendarView } from "./types";

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
            <MobileThreeDayView
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
