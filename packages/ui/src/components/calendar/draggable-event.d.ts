import { CalendarEvent } from "./types";
interface DraggableEventProps {
    event: CalendarEvent;
    view: "month" | "week" | "day";
    showTime?: boolean;
    onClick?: (e: React.MouseEvent) => void;
    height?: number;
    isMultiDay?: boolean;
    multiDayWidth?: number;
    isFirstDay?: boolean;
    isLastDay?: boolean;
    "aria-hidden"?: boolean | "true" | "false";
    timeFormat?: "12h" | "24h";
    timezone?: string;
}
export declare function DraggableEvent({ event, view, showTime, onClick, height, isMultiDay, multiDayWidth, isFirstDay, isLastDay, "aria-hidden": ariaHidden, timeFormat, timezone, }: DraggableEventProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=draggable-event.d.ts.map