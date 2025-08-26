import { CalendarEvent } from "./types";
interface AgendaViewProps {
    currentDate: Date;
    events: CalendarEvent[];
    onEventSelect: (event: CalendarEvent) => void;
    onEventCreate?: (startTime: Date) => void;
    timeFormat?: "12h" | "24h";
    timezone?: string;
}
export declare function AgendaView({ currentDate, events, onEventSelect, timeFormat, timezone, }: AgendaViewProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=agenda-view.d.ts.map