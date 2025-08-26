import React from "react";
import { CalendarEvent } from "./types";
interface MonthViewProps {
    currentDate: Date;
    events: CalendarEvent[];
    onEventSelect: (event: CalendarEvent) => void;
    onEventCreate: (startTime: Date) => void;
    showWeekNumbers?: boolean;
    compactView?: boolean;
    timeFormat?: "12h" | "24h";
    weekStartDay?: number;
    workingDays?: number[];
    timezone?: string;
}
export declare function MonthView({ currentDate, events, onEventSelect, onEventCreate, showWeekNumbers, compactView, timeFormat, weekStartDay, workingDays, timezone, }: MonthViewProps): React.JSX.Element;
export {};
//# sourceMappingURL=month-view.d.ts.map