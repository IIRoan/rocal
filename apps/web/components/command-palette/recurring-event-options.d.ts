import React from "react";
import type { CalendarEvent } from "@workspace/ui/components/calendar/types";
interface RecurringEventOptionsProps {
    event: CalendarEvent;
    isRecurringInstance: boolean;
    onEditSeries: () => void;
    onEditThisOnly: (occurrenceDate: string) => void;
    onEditThisAndFuture: (occurrenceDate: string) => void;
    onDeleteSeries: () => void;
    onDeleteThisOnly: (occurrenceDate: string) => void;
    onDeleteThisAndFuture: (occurrenceDate: string) => void;
    onCancel: () => void;
    mode: 'edit' | 'delete';
    onFallbackDelete?: () => void;
}
export declare function RecurringEventOptions({ event, isRecurringInstance, onEditSeries, onEditThisOnly, onEditThisAndFuture, onDeleteSeries, onDeleteThisOnly, onDeleteThisAndFuture, onCancel, mode, onFallbackDelete, }: RecurringEventOptionsProps): React.JSX.Element;
export {};
//# sourceMappingURL=recurring-event-options.d.ts.map