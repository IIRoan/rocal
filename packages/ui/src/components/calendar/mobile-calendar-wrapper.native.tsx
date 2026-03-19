import React from "react";
import { MobileEventCalendar } from "./mobile-event-calendar";
import { useSharedCalendarData } from "./calendar-data-provider";

interface MobileCalendarWrapperProps {
  initialView?: "month" | "week" | "day" | "agenda";
  defaultCalendarId?: string | null;
  weekStartDay?: number;
}

export function MobileCalendarWrapper({
  initialView = "day",
  defaultCalendarId,
  weekStartDay = 1,
}: MobileCalendarWrapperProps) {
  const calendarData = useSharedCalendarData();

  const events = React.useMemo(
    () =>
      calendarData.events.map((event) => ({
        ...event,
        description: event.description ?? undefined,
        color: event.color ?? undefined,
        location: event.location ?? undefined,
        categoryId: event.categoryId ?? undefined,
        reminder: event.reminder ?? undefined,
      })),
    [calendarData.events],
  );

  const effectiveDefaultCalendarId =
    defaultCalendarId ||
    calendarData.calendars.find((calendar) => calendar.isDefault)?.id ||
    calendarData.calendars[0]?.id ||
    null;

  return (
    <MobileEventCalendar
      initialView={initialView}
      events={events}
      loading={calendarData.eventsLoading}
      error={calendarData.error}
      onDateRangeChange={calendarData.setDateRange}
      onCreateEvent={calendarData.createEvent}
      defaultCalendarId={effectiveDefaultCalendarId}
      weekStartDay={weekStartDay}
    />
  );
}
