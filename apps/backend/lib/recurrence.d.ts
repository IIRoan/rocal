export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";
export interface RecurrenceRule {
    frequency: RecurrenceFrequency;
    interval: number;
    count?: number;
    until?: Date;
    byWeekDay?: number[];
    byMonthDay?: number[];
    byMonth?: number[];
}
export interface RecurrenceInstance {
    date: Date;
    isOriginal: boolean;
    originalEventId: string;
    instanceId?: string;
}
export declare class RecurrenceEngine {
    /**
     * Parse a JSON recurrence string into a RecurrenceRule object
     */
    static parseRecurrenceRule(recurrenceJson: string): RecurrenceRule | null;
    /**
     * Create a recurrence rule JSON string
     */
    static createRecurrenceRule(rule: RecurrenceRule): string;
    /**
     * Generate recurring instances for a given date range
     */
    static generateInstances(baseEvent: {
        id: string;
        start: Date;
        end: Date;
        recurrence: string;
    }, rangeStart: Date, rangeEnd: Date, exceptions?: Array<{
        exceptionDate: Date;
        type: "modified" | "deleted";
    }>): RecurrenceInstance[];
    /**
     * Get the next occurrence based on recurrence rule
     */
    private static getNextOccurrence;
    /**
     * Get number of days in a month
     */
    private static getDaysInMonth;
    /**
     * Validate a recurrence rule
     */
    static validateRecurrenceRule(rule: RecurrenceRule): string[];
    /**
     * Create a human-readable description of a recurrence rule
     */
    static getRecurrenceDescription(rule: RecurrenceRule): string;
    /**
     * Create common recurrence patterns
     */
    static createCommonPatterns(): {
        daily: () => RecurrenceRule;
        weekly: (weekdays?: number[]) => RecurrenceRule;
        biweekly: (weekdays?: number[]) => RecurrenceRule;
        monthly: (dayOfMonth?: number) => RecurrenceRule;
        yearly: (month?: number, dayOfMonth?: number) => RecurrenceRule;
        weekdays: () => RecurrenceRule;
    };
}
//# sourceMappingURL=recurrence.d.ts.map