import type { MouseEvent } from "react";

import type { CalendarEvent } from "./types";

export type WeekEventHandlers = {
  onEventClick: (event: CalendarEvent, event_: MouseEvent) => void;
  onEventCreate: (startTime: Date) => void;
  onEventDelete?: (event: CalendarEvent) => void;
  onEventEdit?: (event: CalendarEvent) => void;
  onEventView?: (event: CalendarEvent) => void;
};
