import React from "react";
import { CalendarEvent } from "./types";
interface EventDotsProps {
    events: CalendarEvent[];
    view: "month" | "week" | "day" | "agenda";
    onClick?: (event: CalendarEvent) => void;
    showTime?: boolean;
    timeFormat?: "12h" | "24h";
    className?: string;
    style?: React.CSSProperties;
    timezone?: string;
}
export declare function EventDots({ events, view, onClick, showTime, timeFormat, className, style, timezone, }: EventDotsProps): React.JSX.Element | null;
export declare function groupEventsByExactTime(events: CalendarEvent[]): CalendarEvent[][];
export declare function haveSameExactTime(event1: CalendarEvent, event2: CalendarEvent): boolean;
export {};
//# sourceMappingURL=event-dots.d.ts.map