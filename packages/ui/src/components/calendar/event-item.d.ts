import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { CalendarEvent } from "./types";
interface EventItemProps {
    event: CalendarEvent;
    view: "month" | "week" | "day" | "agenda";
    isDragging?: boolean;
    onClick?: (e: React.MouseEvent) => void;
    showTime?: boolean;
    currentTime?: Date;
    isFirstDay?: boolean;
    isLastDay?: boolean;
    children?: React.ReactNode;
    className?: string;
    dndListeners?: SyntheticListenerMap;
    dndAttributes?: DraggableAttributes;
    onMouseDown?: (e: React.MouseEvent) => void;
    onTouchStart?: (e: React.TouchEvent) => void;
    timeFormat?: "12h" | "24h";
    timezone?: string;
}
export declare function EventItem({ event, view, isDragging, onClick, showTime, currentTime, isFirstDay, isLastDay, children, className, dndListeners, dndAttributes, onMouseDown, onTouchStart, timeFormat, timezone, }: EventItemProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=event-item.d.ts.map