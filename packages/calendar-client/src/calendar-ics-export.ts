import type { Calendar } from "@workspace/calendar-core";
import {
  buildCalendarIcsExport,
  type EventIcsExport,
} from "@workspace/calendar-core/event-ics-export";
import type { CalendarApiService } from "./calendar-api-service";
import { loadEventSearchCorpus } from "./event-search-corpus";

/** Builds the .ics of the given calendars from the decrypted corpus on the device, so the server never sees the content; several calendars share one file. */
export async function loadCalendarIcsExport(
  api: Pick<CalendarApiService, "getEventSearchCorpus">,
  options: { calendars: Array<Pick<Calendar, "id" | "name">>; timezone?: string | null },
): Promise<EventIcsExport> {
  const [only, ...others] = options.calendars;
  const calendarIds = new Set(options.calendars.map((calendar) => calendar.id));
  const events = await loadEventSearchCorpus(api, { includeExceptions: true });
  return buildCalendarIcsExport(
    events.filter((event) => calendarIds.has(event.calendarId)),
    {
      calendarName: only && others.length === 0 ? only.name : "Solace calendars",
      timezone: options.timezone,
    },
  );
}
