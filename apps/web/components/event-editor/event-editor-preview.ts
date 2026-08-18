import { useEffect, useRef } from "react";
import {
  pickerDateAndTimeToUtc,
  pickerDateToAllDayUtcRange,
} from "@workspace/calendar-core";
import type { CalendarEvent } from "@workspace/ui/components/calendar";

import type { EventEditorMode } from "../command-palette-context";

type EventEditorLivePreviewInput = {
  editorMode: EventEditorMode;
  eventAllDay: boolean;
  eventCalendarId: string;
  eventDescription: string;
  eventEndDate: Date;
  eventEndTime: string;
  eventLocation: string;
  eventStartDate: Date;
  eventStartTime: string;
  eventTitle: string;
  open: boolean;
  timezone: string;
  updatePreviewEvent?: (updates: Partial<CalendarEvent>) => void;
};

export function useEventEditorLivePreview({
  editorMode,
  eventAllDay,
  eventCalendarId,
  eventDescription,
  eventEndDate,
  eventEndTime,
  eventLocation,
  eventStartDate,
  eventStartTime,
  eventTitle,
  open,
  timezone,
  updatePreviewEvent,
}: EventEditorLivePreviewInput) {
  const lastPreviewPayloadRef = useRef("");

  useEffect(() => {
    if (editorMode !== "popover" || !updatePreviewEvent || !open) {
      lastPreviewPayloadRef.current = "";
      return;
    }

    const { start, end } = eventAllDay
      ? pickerDateToAllDayUtcRange(eventStartDate, eventEndDate, timezone)
      : {
        start: pickerDateAndTimeToUtc(
          eventStartDate,
          eventStartTime,
          timezone,
        ),
        end: pickerDateAndTimeToUtc(eventEndDate, eventEndTime, timezone),
      };

    const payload = {
      allDay: eventAllDay,
      calendarId: eventCalendarId,
      description: eventDescription || "",
      endIso: end.toISOString(),
      location: eventLocation || "",
      startIso: start.toISOString(),
      title: eventTitle || "(No title)",
    };
    const payloadKey = JSON.stringify(payload);

    if (payloadKey === lastPreviewPayloadRef.current) {
      return;
    }

    lastPreviewPayloadRef.current = payloadKey;
    updatePreviewEvent({
      title: payload.title,
      start,
      end,
      allDay: payload.allDay,
      calendarId: payload.calendarId,
      location: payload.location || undefined,
      description: payload.description || undefined,
      timezone,
    });
  }, [
    editorMode,
    eventAllDay,
    eventCalendarId,
    eventDescription,
    eventEndDate,
    eventEndTime,
    eventLocation,
    eventStartDate,
    eventStartTime,
    eventTitle,
    open,
    timezone,
    updatePreviewEvent,
  ]);
}
