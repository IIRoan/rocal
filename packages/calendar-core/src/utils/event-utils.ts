import { endOfDay, isSameDay, startOfDay } from "date-fns";
import type { CalendarEvent, EventColor } from "../types";

function isHexColor(color: string): boolean {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
}

export function getEventColorClasses(color?: EventColor | string): string {
  const eventColor = color || "sky";
  if (isHexColor(eventColor)) return "shadow-sm";
  switch (eventColor) {
    case "blue":
    case "sky":
      return "bg-event-sky hover:bg-event-sky/80 text-event-sky-foreground shadow-sm";
    case "violet":
      return "bg-event-violet hover:bg-event-violet/80 text-event-violet-foreground shadow-sm";
    case "rose":
      return "bg-event-rose hover:bg-event-rose/80 text-event-rose-foreground shadow-sm";
    case "emerald":
      return "bg-event-emerald hover:bg-event-emerald/80 text-event-emerald-foreground shadow-sm";
    case "orange":
      return "bg-event-orange hover:bg-event-orange/80 text-event-orange-foreground shadow-sm";
    default:
      return "bg-event-default hover:bg-event-default/80 text-event-default-foreground shadow-sm";
  }
}

export function getEventColorStyles(color?: EventColor | string): React.CSSProperties {
  const eventColor = color || "sky";
  if (isHexColor(eventColor)) return { backgroundColor: eventColor, color: "#ffffff" };
  return {};
}

export function resolveEventColorValue(color?: EventColor | string): string {
  if (!color) return "var(--color-event-default)";
  if (isHexColor(color)) return color;
  if (color === "blue") return "var(--color-event-sky)";
  return `var(--color-event-${color})`;
}

export function getBorderRadiusClasses(isFirstDay: boolean, isLastDay: boolean): string {
  if (isFirstDay && isLastDay) return "rounded";
  if (isFirstDay) return "rounded-l rounded-r-none not-in-data-[slot=popover-content]:w-[calc(100%+5px)]";
  if (isLastDay) return "rounded-r rounded-l-none not-in-data-[slot=popover-content]:w-[calc(100%+4px)] not-in-data-[slot=popover-content]:-translate-x-[4px]";
  return "rounded-none not-in-data-[slot=popover-content]:w-[calc(100%+9px)] not-in-data-[slot=popover-content]:-translate-x-[4px]";
}

export function isMultiDayEvent(event: CalendarEvent): boolean {
  const eventStart = startOfDay(new Date(event.start));
  const eventEnd = startOfDay(new Date(event.end));
  return !!event.allDay || !isSameDay(eventStart, eventEnd);
}

export function getEventInterval(event: CalendarEvent, granularity: "day" | "time" = "day") {
  const rawStart = new Date(event.start);
  const rawEnd = new Date(event.end);
  if (granularity === "time") return { start: rawStart <= rawEnd ? rawStart : rawEnd, end: rawEnd >= rawStart ? rawEnd : rawStart };
  return { start: startOfDay(rawStart), end: endOfDay(rawEnd) };
}
