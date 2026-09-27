import { CALENDAR_VIEWS, type CalendarView } from "@workspace/calendar-core";

export interface CalendarPaletteCommandHandlers {
  setCurrentDate: (date: Date) => void;
  setCalendarView: (view: CalendarView) => void;
}

function isCalendarView(value: unknown): value is CalendarView {
  return (
    typeof value === "string" &&
    (CALENDAR_VIEWS as readonly string[]).includes(value)
  );
}

/** Returns true when the command changed the calendar so the palette can close. */
export function runCalendarPaletteCommand(
  action: string,
  payload: Record<string, unknown> | undefined,
  handlers: CalendarPaletteCommandHandlers,
  now: () => Date = () => new Date(),
): boolean {
  if (action === "goToday") {
    handlers.setCurrentDate(now());
    return true;
  }
  const view = payload?.view;
  if (action === "setView" && isCalendarView(view)) {
    handlers.setCalendarView(view);
    return true;
  }
  return false;
}
