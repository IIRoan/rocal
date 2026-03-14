import * as ical from "node-ical";
import { CalendarEvent, Prisma } from "../generated/prisma/index.js";

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
  timezone?: string; // IANA timezone identifier
}

export interface ICSParseResult {
  events: ParsedICSEvent[];
  errors: string[];
  calendarName?: string;
  calendarDescription?: string;
  calendarTimezone?: string; // X-WR-TIMEZONE from calendar
}

// Timezone conversion utilities
function convertTimezoneToUserTimezone(
  date: Date,
  sourceTimezone: string | undefined,
  userTimezone: string,
): Date {
  if (!sourceTimezone || sourceTimezone === userTimezone) {
    return date;
  }

  try {
    // NOTE: We rely on the ICS parser (node-ical) to produce correct Date instances.
    // Avoid manual conversion here to prevent double-offset errors.
    return date;
  } catch (error) {
    console.warn(
      `Failed to convert timezone from ${sourceTimezone} to ${userTimezone}:`,
      error,
    );
    return date; // Return original date if conversion fails
  }
}

function mapICSTimezoneToIANA(icsTimezone: string): string {
  // Map common ICS timezone names to IANA timezone identifiers
  const timezoneMap: Record<string, string> = {
    "W. Europe Standard Time": "Europe/Amsterdam",
    "Central European Standard Time": "Europe/Paris",
    "Eastern Standard Time": "America/New_York",
    "Pacific Standard Time": "America/Los_Angeles",
    "Central Standard Time": "America/Chicago",
    "Mountain Standard Time": "America/Denver",
    "GMT Standard Time": "Europe/London",
    UTC: "UTC",
    "Greenwich Standard Time": "UTC",
  };

  return timezoneMap[icsTimezone] || icsTimezone;
}

export function parseICSFile(
  icsContent: string,
  userTimezone: string = "UTC",
): ICSParseResult {
  const result: ICSParseResult = {
    events: [],
    errors: [],
  };

  try {
    const parsed = ical.parseICS(icsContent);

    // First pass: extract calendar-level metadata including X-WR-TIMEZONE
    for (const eventKey in parsed) {
      const event = parsed[eventKey];

      if (event && (event.type as any) === "VCALENDAR") {
        const calendar = event as VCalendar;
        if (calendar.title) {
          result.calendarName = calendar.title;
        }
        if (calendar.description) {
          result.calendarDescription = calendar.description;
        }
        // Extract X-WR-TIMEZONE if present
        if (calendar["X-WR-TIMEZONE"] || calendar["x-wr-timezone"]) {
          result.calendarTimezone = mapICSTimezoneToIANA(
            calendar["X-WR-TIMEZONE"] || calendar["x-wr-timezone"],
          );
        }
        continue;
      }
    }

    // Second pass: parse events with calendar timezone context
    for (const eventKey in parsed) {
      const event = parsed[eventKey];

      if (event && event.type === "VEVENT") {
        const vEvent = event as VEvent;

        try {
          const parsedEvent = parseVEvent(
            vEvent,
            userTimezone,
            result.calendarTimezone,
          );
          if (parsedEvent) {
            result.events.push(parsedEvent);
          }
        } catch (error) {
          result.errors.push(
            `Failed to parse event ${vEvent.uid || "unknown"}: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      }
    }
  } catch (error) {
    result.errors.push(
      `Failed to parse ICS file: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  return result;
}

function parseVEvent(
  vEvent: VEvent,
  userTimezone: string = "UTC",
  calendarTimezone?: string,
): ParsedICSEvent | null {
  try {
    console.log("🔍 Parsing vEvent:", vEvent.uid, vEvent.summary);

    if (!vEvent.uid || !vEvent.start || !vEvent.end || !vEvent.summary) {
      console.warn("⚠️ Missing required fields in vEvent:", {
        uid: !!vEvent.uid,
        start: !!vEvent.start,
        end: !!vEvent.end,
        summary: !!vEvent.summary,
      });
      return null;
    }

    // Debug: Log the raw vEvent data to understand timezone handling
    console.log("📊 Raw vEvent data:", {
      uid: vEvent.uid,
      summary: vEvent.summary,
      start: {
        value: vEvent.start,
        type: typeof vEvent.start,
        isDate: vEvent.start instanceof Date,
      },
      end: {
        value: vEvent.end,
        type: typeof vEvent.end,
        isDate: vEvent.end instanceof Date,
      },
      dtstart: vEvent.dtstart,
      dtend: vEvent.dtend,
      datetype: (vEvent as any).datetype,
    });

    // Include all events regardless of participation status (PARTSTAT)
    // This ensures declined, tentative, and pending events are also synced

    let start = vEvent.start;
    let end = vEvent.end;
    let allDay = false;
    let sourceTimezone: string | undefined;

    // Node-ical marks all-day events with datetype === 'date'
    if ((vEvent as any).datetype === "date") {
      allDay = true;
    }

    // Determine event timezone with priority: TZID > X-WR-TIMEZONE > floating time (user timezone)
    if (vEvent.dtstart && vEvent.dtstart.params && vEvent.dtstart.params.TZID) {
      // Event has explicit TZID - use it
      sourceTimezone = mapICSTimezoneToIANA(vEvent.dtstart.params.TZID);
    } else if (calendarTimezone) {
      // No TZID but calendar has X-WR-TIMEZONE - use calendar timezone
      sourceTimezone = calendarTimezone;
    } else if (!allDay) {
      // No TZID and no calendar timezone - this is floating time, use user timezone
      sourceTimezone = userTimezone;
    }
    // For all-day events, timezone is not applicable

    // Handle date/time parsing with proper timezone handling
    console.log("🕐 Processing start time:", start, typeof start);
    try {
      if (typeof start === "string") {
        const startStr = start as string;
        const isAllDayFromStart =
          !startStr.includes("T") && !startStr.includes(":");
        const date = new Date(startStr);
        if (!isNaN(date.getTime())) {
          start = date;
          allDay = allDay || isAllDayFromStart;
          console.log("📅 Parsed string start date:", start, "allDay:", allDay);
        } else {
          throw new Error(`Invalid start date string: ${start}`);
        }
      } else if (start instanceof Date) {
        // Date object from ICS library - use as-is
        start = vEvent.start;
        console.log("📅 Using Date object start:", start);
      } else {
        throw new Error(`Unexpected start date type: ${typeof start}`);
      }
    } catch (error) {
      console.error("❌ Error parsing start date:", error);
      throw error;
    }

    console.log("🕐 Processing end time:", end, typeof end);
    try {
      if (typeof end === "string") {
        const date = new Date(end);
        if (!isNaN(date.getTime())) {
          end = date;
          if (allDay) {
            // For all-day events, subtract 1 day from end date as ICS format uses exclusive end dates
            end = new Date(end.getTime() - 24 * 60 * 60 * 1000);
          }
          console.log("📅 Parsed string end date:", end);
        } else {
          throw new Error(`Invalid end date string: ${end}`);
        }
      } else if (end instanceof Date) {
        // Date object from ICS library - use as-is
        end = vEvent.end;
        if (allDay) {
          // Ensure exclusive end is converted to inclusive for all-day
          end = new Date(end.getTime() - 24 * 60 * 60 * 1000);
        }
        console.log("📅 Using Date object end:", end);
      } else {
        throw new Error(`Unexpected end date type: ${typeof end}`);
      }
    } catch (error) {
      console.error("❌ Error parsing end date:", error);
      throw error;
    }

    // NOTE: Do not convert timezone here. The ICS parser already produces Date objects that represent the correct instant in time.
    // Performing an extra conversion here leads to double-offset errors (e.g., +2 hours in Europe/Amsterdam during DST).

    // Ensure we have valid Date objects
    if (!(start instanceof Date) || !(end instanceof Date)) {
      return null;
    }

    let recurrence: string | undefined;
    if (vEvent.rrule) {
      try {
        console.log(
          "📅 Processing RRULE for event:",
          vEvent.uid,
          vEvent.summary,
        );
        console.log("📋 Raw RRULE from ICS:", vEvent.rrule);

        // Convert RRULE to our internal format
        const parsedRule = parseRRule(vEvent.rrule);
        console.log("🔄 Parsed RRULE result:", parsedRule);

        // Validate the parsed rule has required fields
        if (parsedRule.frequency && parsedRule.interval) {
          recurrence = JSON.stringify(parsedRule);
          console.log(
            "✅ Final recurrence JSON for",
            vEvent.uid,
            ":",
            recurrence,
          );

          // Additional validation for weekdays
          if (parsedRule.byWeekDay && Array.isArray(parsedRule.byWeekDay)) {
            // Keep as is
          }
        } else {
          console.warn(
            `❌ Invalid RRULE - missing frequency or interval for ${vEvent.uid}:`,
            parsedRule,
          );
        }
      } catch (error) {
        console.warn(
          `💥 Failed to parse RRULE for event ${vEvent.uid}: ${error}`,
        );
      }
    }

    console.log(
      "✅ Successfully parsed event:",
      vEvent.uid,
      vEvent.summary,
      "timezone:",
      sourceTimezone,
    );
    return {
      uid: vEvent.uid,
      title: vEvent.summary,
      description: vEvent.description || undefined,
      start: start,
      end: end,
      allDay: allDay,
      location: vEvent.location || undefined,
      recurrence: recurrence,
      timezone: sourceTimezone,
    };
  } catch (error) {
    console.error(
      "💥 Fatal error parsing vEvent:",
      vEvent?.uid || "unknown",
      error,
    );
    console.error(
      "📊 vEvent data that caused error:",
      JSON.stringify(vEvent, null, 2),
    );
    throw new Error(
      `Failed to parse event ${vEvent?.uid || "unknown"}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

function parseRRule(rrule: any): any {
  // Convert RRULE object to our internal recurrence format
  const recurrenceRule: any = {};

  // Handle both RRule object from ical library and simple object format
  const ruleData = rrule.options || rrule;

  // Parse frequency - ical library uses numeric constants (0=yearly, 1=monthly, 2=weekly, 3=daily)
  if (ruleData.freq !== undefined) {
    switch (ruleData.freq) {
      case 0:
      case "YEARLY":
        recurrenceRule.frequency = "yearly";
        break;
      case 1:
      case "MONTHLY":
        recurrenceRule.frequency = "monthly";
        break;
      case 2:
      case "WEEKLY":
        recurrenceRule.frequency = "weekly";
        break;
      case 3:
      case "DAILY":
        recurrenceRule.frequency = "daily";
        break;
    }
  }

  // Default interval to 1 if not specified
  recurrenceRule.interval = ruleData.interval || 1;

  // Handle count
  if (ruleData.count && typeof ruleData.count === "number") {
    recurrenceRule.count = ruleData.count;
  }

  // Handle until date
  if (ruleData.until) {
    if (ruleData.until instanceof Date) {
      recurrenceRule.until = ruleData.until.toISOString();
    } else if (typeof ruleData.until === "string") {
      const parsedDate = new Date(ruleData.until);
      if (!isNaN(parsedDate.getTime())) {
        recurrenceRule.until = parsedDate.toISOString();
      } else {
        recurrenceRule.until = ruleData.until;
      }
    }
  }

  // Handle byweekday - ical library uses Monday=0 system, but JavaScript uses Sunday=0
  // Need to convert: ical Mon=0,Tue=1,Wed=2,Thu=3,Fri=4,Sat=5,Sun=6 -> JS Sun=0,Mon=1,Tue=2,Wed=3,Thu=4,Fri=5,Sat=6
  if (ruleData.byweekday && Array.isArray(ruleData.byweekday)) {
    recurrenceRule.byWeekDay = ruleData.byweekday
      .filter((day: number) => typeof day === "number" && day >= 0 && day <= 6)
      .map((day: number) => {
        // Convert from Monday=0 to Sunday=0 system
        return day === 6 ? 0 : day + 1; // Sun=6->0, Mon=0->1, Tue=1->2, etc.
      });
  }
  // Also handle legacy byday format for string-based parsing
  else if (ruleData.byday) {
    const weekdays = Array.isArray(ruleData.byday)
      ? ruleData.byday
      : [ruleData.byday];
    const weekdayMap: Record<string, number> = {
      SU: 0,
      MO: 1,
      TU: 2,
      WE: 3,
      TH: 4,
      FR: 5,
      SA: 6,
    };

    recurrenceRule.byWeekDay = weekdays
      .map((day: string) => {
        const dayCode = day.length >= 2 ? day.substr(-2) : day;
        return weekdayMap[dayCode];
      })
      .filter((day: number) => day !== undefined);
  }

  // Handle bymonthday
  if (ruleData.bymonthday && Array.isArray(ruleData.bymonthday)) {
    recurrenceRule.byMonthDay = ruleData.bymonthday;
  }

  // Handle bymonth
  if (ruleData.bymonth && Array.isArray(ruleData.bymonth)) {
    recurrenceRule.byMonth = ruleData.bymonth;
  }

  return recurrenceRule;
}

export function convertParsedEventToCalendarEvent(
  parsedEvent: ParsedICSEvent,
  userId: string,
  calendarId: string,
  subscriptionId?: string,
): Prisma.CalendarEventCreateInput {
  return {
    title: parsedEvent.title,
    description: parsedEvent.description,
    start: parsedEvent.start,
    end: parsedEvent.end,
    allDay: parsedEvent.allDay,
    location: parsedEvent.location,
    recurrence: parsedEvent.recurrence,
    timezone: parsedEvent.timezone || "UTC",
    isSynced: !!subscriptionId,
    externalId: parsedEvent.uid,
    subscriptionId: subscriptionId,
    syncedAt: subscriptionId ? new Date() : undefined,
    user: {
      connect: { id: userId },
    },
    calendar: {
      connect: { id: calendarId },
    },
  };
}

export function isEventModified(
  existing: CalendarEvent,
  parsed: ParsedICSEvent,
): boolean {
  // Compare key fields to determine if event has been modified
  return (
    existing.title !== parsed.title ||
    existing.description !== (parsed.description || null) ||
    existing.start.getTime() !== parsed.start.getTime() ||
    existing.end.getTime() !== parsed.end.getTime() ||
    existing.allDay !== parsed.allDay ||
    existing.location !== (parsed.location || null) ||
    existing.recurrence !== (parsed.recurrence || null) ||
    existing.timezone !== (parsed.timezone || "UTC")
  );
}
