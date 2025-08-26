import React from "react";
import { CalendarEvent } from "./types";
interface DayViewProps {
    currentDate: Date;
    events: CalendarEvent[];
    onEventSelect: (event: CalendarEvent) => void;
    onEventCreate: (startTime: Date) => void;
    compactView?: boolean;
    timeFormat?: "12h" | "24h";
    timezone?: string;
    workingDays?: number[];
}
export declare function DayView({ currentDate, events, onEventSelect, onEventCreate, compactView, timeFormat, timezone, }: DayViewProps): React.JSX.Element;
export {};
//# sourceMappingURL=day-view.d.ts.map