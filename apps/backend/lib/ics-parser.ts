import * as ical from 'ical';
import { CalendarEvent, Prisma } from '../generated/prisma';

type VEvent = any;
type VCalendar = any;

export interface ParsedICSEvent {
  uid: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  allDay: boolean;
  location?: string;
  recurrence?: string;
}

export interface ICSParseResult {
  events: ParsedICSEvent[];
  errors: string[];
  calendarName?: string;
  calendarDescription?: string;
}

export function parseICSFile(icsContent: string): ICSParseResult {
  const result: ICSParseResult = {
    events: [],
    errors: []
  };

  try {
    const parsed = ical.parseICS(icsContent);
    
    for (const eventKey in parsed) {
      const event = parsed[eventKey];
      
      if (event && event.type === 'VCALENDAR') {
        const calendar = event as VCalendar;
        if (calendar.title) {
          result.calendarName = calendar.title;
        }
        if (calendar.description) {
          result.calendarDescription = calendar.description;
        }
        continue;
      }
      
      if (event && event.type === 'VEVENT') {
        const vEvent = event as VEvent;
        
        try {
          const parsedEvent = parseVEvent(vEvent);
          if (parsedEvent) {
            result.events.push(parsedEvent);
          }
        } catch (error) {
          result.errors.push(`Failed to parse event ${vEvent.uid || 'unknown'}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }
  } catch (error) {
    result.errors.push(`Failed to parse ICS file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return result;
}

function parseVEvent(vEvent: VEvent): ParsedICSEvent | null {
  if (!vEvent.uid || !vEvent.start || !vEvent.end || !vEvent.summary) {
    return null;
  }

  // Debug: Log the raw vEvent data to understand timezone handling
  console.log('Raw vEvent data:', {
    uid: vEvent.uid,
    summary: vEvent.summary,
    start: {
      value: vEvent.start,
      type: typeof vEvent.start,
      isDate: vEvent.start instanceof Date
    },
    end: {
      value: vEvent.end,
      type: typeof vEvent.end,
      isDate: vEvent.end instanceof Date
    },
    dtstart: vEvent.dtstart,
    dtend: vEvent.dtend
  });

  // Include all events regardless of participation status (PARTSTAT)
  // This ensures declined, tentative, and pending events are also synced

  let start = vEvent.start;
  let end = vEvent.end;
  let allDay = false;

  // Handle date/time parsing with proper timezone handling
  if (typeof start === 'string') {
    const date = new Date(start);
    if (!isNaN(date.getTime())) {
      start = date;
      // Check if this is truly an all-day event (no time component)
      allDay = !start.includes('T') && !start.includes(':');
    }
  } else if (start instanceof Date) {
    // Date object from ICS library - use as-is but check for all-day
    // ICS library typically handles timezone conversion
    allDay = false; // Will be determined by the original ICS data
  }
  
  if (typeof end === 'string') {
    const date = new Date(end);
    if (!isNaN(date.getTime())) {
      end = date;
      if (allDay) {
        // For all-day events, subtract 1 day from end date as ICS format uses exclusive end dates
        end = new Date(end.getTime() - 24 * 60 * 60 * 1000);
      }
    }
  } else if (end instanceof Date) {
    // Date object from ICS library - use as-is
  }

  // Ensure we have valid Date objects
  if (!(start instanceof Date) || !(end instanceof Date)) {
    return null;
  }

  let recurrence: string | undefined;
  if (vEvent.rrule) {
    try {
      console.log('Raw RRULE from ICS:', vEvent.uid, vEvent.rrule);
      // Convert RRULE to our internal format
      const parsedRule = parseRRule(vEvent.rrule);
      console.log('Parsed RRULE result:', vEvent.uid, parsedRule);
      
      // Only set recurrence if we have valid frequency and interval
      if (parsedRule.frequency && parsedRule.interval) {
        recurrence = JSON.stringify(parsedRule);
        console.log('Final recurrence JSON:', vEvent.uid, recurrence);
      } else {
        console.warn(`Invalid RRULE - missing frequency or interval for ${vEvent.uid}:`, parsedRule);
      }
    } catch (error) {
      // If RRULE parsing fails, continue without recurrence
      console.warn(`Failed to parse RRULE for event ${vEvent.uid}: ${error}`);
    }
  }

  return {
    uid: vEvent.uid,
    title: vEvent.summary,
    description: vEvent.description || undefined,
    start,
    end,
    allDay,
    location: vEvent.location || undefined,
    recurrence
  };
}

function parseRRule(rrule: any): any {
  // Convert RRULE object to our internal recurrence format
  const recurrenceRule: any = {};

  if (rrule.freq) {
    switch (rrule.freq) {
      case 'DAILY':
        recurrenceRule.frequency = 'daily';
        break;
      case 'WEEKLY':
        recurrenceRule.frequency = 'weekly';
        break;
      case 'MONTHLY':
        recurrenceRule.frequency = 'monthly';
        break;
      case 'YEARLY':
        recurrenceRule.frequency = 'yearly';
        break;
    }
  }

  // Default interval to 1 if not specified
  recurrenceRule.interval = rrule.interval || 1;

  if (rrule.count) {
    recurrenceRule.count = rrule.count;
  }

  if (rrule.until) {
    recurrenceRule.until = rrule.until instanceof Date ? rrule.until.toISOString() : rrule.until;
  }

  if (rrule.byday) {
    // Convert weekday format
    const weekdays = Array.isArray(rrule.byday) ? rrule.byday : [rrule.byday];
    recurrenceRule.byWeekday = weekdays.map((day: string) => {
      const weekdayMap: Record<string, number> = {
        'SU': 0, 'MO': 1, 'TU': 2, 'WE': 3, 'TH': 4, 'FR': 5, 'SA': 6
      };
      return weekdayMap[day.substr(-2)] || 0;
    });
  }

  if (rrule.bymonthday) {
    recurrenceRule.byMonthDay = Array.isArray(rrule.bymonthday) ? rrule.bymonthday : [rrule.bymonthday];
  }

  if (rrule.bymonth) {
    recurrenceRule.byMonth = Array.isArray(rrule.bymonth) ? rrule.bymonth : [rrule.bymonth];
  }

  return recurrenceRule;
}

export function convertParsedEventToCalendarEvent(
  parsedEvent: ParsedICSEvent,
  userId: string,
  calendarId: string,
  subscriptionId?: string
): Prisma.CalendarEventCreateInput {
  return {
    title: parsedEvent.title,
    description: parsedEvent.description,
    start: parsedEvent.start,
    end: parsedEvent.end,
    allDay: parsedEvent.allDay,
    location: parsedEvent.location,
    recurrence: parsedEvent.recurrence,
    isSynced: !!subscriptionId,
    externalId: parsedEvent.uid,
    subscriptionId: subscriptionId,
    syncedAt: subscriptionId ? new Date() : undefined,
    user: {
      connect: { id: userId }
    },
    calendar: {
      connect: { id: calendarId }
    }
  };
}

export function isEventModified(existing: CalendarEvent, parsed: ParsedICSEvent): boolean {
  // Compare key fields to determine if event has been modified
  return (
    existing.title !== parsed.title ||
    existing.description !== (parsed.description || null) ||
    existing.start.getTime() !== parsed.start.getTime() ||
    existing.end.getTime() !== parsed.end.getTime() ||
    existing.allDay !== parsed.allDay ||
    existing.location !== (parsed.location || null) ||
    existing.recurrence !== (parsed.recurrence || null)
  );
}