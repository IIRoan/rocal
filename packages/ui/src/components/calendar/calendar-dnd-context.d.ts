import { type ReactNode } from "react";
import { type UniqueIdentifier } from "@dnd-kit/core";
import { CalendarEvent } from "./types";
type CalendarDndContextType = {
    activeEvent: CalendarEvent | null;
    activeId: UniqueIdentifier | null;
    activeView: "month" | "week" | "day" | null;
    currentTime: Date | null;
    eventHeight: number | null;
    isMultiDay: boolean;
    multiDayWidth: number | null;
    dragHandlePosition: {
        x?: number;
        y?: number;
        data?: {
            isFirstDay?: boolean;
            isLastDay?: boolean;
        };
    } | null;
};
export declare const useCalendarDnd: () => CalendarDndContextType;
interface CalendarDndProviderProps {
    children: ReactNode;
    onEventUpdate: (event: CalendarEvent) => void;
    timezone?: string;
}
export declare function CalendarDndProvider({ children, onEventUpdate, timezone, }: CalendarDndProviderProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=calendar-dnd-context.d.ts.map