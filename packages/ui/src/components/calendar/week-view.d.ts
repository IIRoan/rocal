import React from "react";
import { CalendarEvent } from "./types";
interface WeekViewProps {
    currentDate: Date;
    events: CalendarEvent[];
    onEventSelect: (event: CalendarEvent) => void;
    onEventCreate: (startTime: Date) => void;
    compactView?: boolean;
    timeFormat?: "12h" | "24h";
    weekStartDay?: number;
    workingDays?: number[];
    timezone?: string;
}
export declare function WeekView({ currentDate, events, onEventSelect, onEventCreate, compactView, timeFormat, weekStartDay, workingDays, timezone, }: WeekViewProps): React.JSX.Element;
export {};
//# sourceMappingURL=week-view.d.ts.map