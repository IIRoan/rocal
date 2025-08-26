import { CalendarEvent, Prisma } from '../generated/prisma/index.js';
export interface ParsedICSEvent {
    uid: string;
    title: string;
    description?: string;
    start: Date;
    end: Date;
    allDay: boolean;
    location?: string;
    recurrence?: string;
    timezone?: string;
}
export interface ICSParseResult {
    events: ParsedICSEvent[];
    errors: string[];
    calendarName?: string;
    calendarDescription?: string;
    calendarTimezone?: string;
}
export declare function parseICSFile(icsContent: string, userTimezone?: string): ICSParseResult;
export declare function convertParsedEventToCalendarEvent(parsedEvent: ParsedICSEvent, userId: string, calendarId: string, subscriptionId?: string): Prisma.CalendarEventCreateInput;
export declare function isEventModified(existing: CalendarEvent, parsed: ParsedICSEvent): boolean;
//# sourceMappingURL=ics-parser.d.ts.map