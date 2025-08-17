// Component exports
export * from "./ui";
export * from "./layout";
export * from "./navigation";
export * from "./landing";

// Calendar exports (avoiding conflicts)
export { AgendaView } from "./calendar/agenda-view";
export { DayView } from "./calendar/day-view";
export { MonthView } from "./calendar/month-view";
export { WeekView } from "./calendar/week-view";
export { EventCalendar } from "./calendar/event-calendar";
export { MobileEventCalendar } from "./calendar/mobile-event-calendar";
export { MobileCalendarWrapper } from "./calendar/mobile-calendar-wrapper";
export { EventItem } from "./calendar/event-item";
export { EventsPopup } from "./calendar/events-popup";
export { DraggableEvent } from "./calendar/draggable-event";
export { DroppableCell } from "./calendar/droppable-cell";
export {
  CalendarSkeleton,
  EventDialogSkeleton,
  SidebarCalendarSkeleton,
} from "./calendar/calendar-skeleton";

// Context providers
export {
  CalendarDndProvider,
  useCalendarDnd,
} from "./calendar/calendar-dnd-context";
export {
  CalendarProvider,
  useCalendarContext,
} from "./calendar/calendar-context";

// Calendar constants, utilities and types
export * from "./calendar/constants";
export * from "./calendar/utils";

// Calendar types (with explicit exports to avoid conflicts)
export type {
  CalendarView,
  CalendarEvent,
  CreateCalendarData,
  EventColor,
  CreateEventData,
} from "./calendar/types";
export type { Calendar as CalendarData } from "./calendar/types";
