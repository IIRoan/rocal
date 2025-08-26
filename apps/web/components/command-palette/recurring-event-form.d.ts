import React from "react";
import type { RecurrenceRule } from "@/lib/types/calendar";
interface RecurringEventFormProps {
    isRecurring: boolean;
    onIsRecurringChange: (isRecurring: boolean) => void;
    recurrenceRule: RecurrenceRule | null;
    onRecurrenceRuleChange: (rule: RecurrenceRule | null) => void;
    eventStartDate: Date;
    eventEndDate: Date;
}
export declare function RecurringEventForm({ isRecurring, onIsRecurringChange, recurrenceRule, onRecurrenceRuleChange, eventStartDate, eventEndDate, }: RecurringEventFormProps): React.JSX.Element;
export {};
//# sourceMappingURL=recurring-event-form.d.ts.map