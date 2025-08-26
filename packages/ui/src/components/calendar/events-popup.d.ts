import { CalendarEvent } from "./types";
interface EventsPopupProps {
    date: Date;
    events: CalendarEvent[];
    position: {
        top: number;
        left: number;
    };
    onClose: () => void;
    onEventSelect: (event: CalendarEvent) => void;
    timezone?: string;
}
export declare function EventsPopup({ date, events, position, onClose, onEventSelect, timezone, }: EventsPopupProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=events-popup.d.ts.map