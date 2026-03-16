import { generateText, stepCountIs, tool } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";

const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const DEFAULT_SEARCH_BACK_DAYS = 60;
const DEFAULT_SEARCH_FORWARD_DAYS = 400;
const MAX_FETCH_WINDOW_DAYS = 550;
const WEEKDAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const calendarSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().optional(),
  isDefault: z.boolean().optional(),
});

const eventSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  start: z.string(),
  end: z.string(),
  allDay: z.boolean().optional(),
  location: z.string().optional(),
  calendarId: z.string(),
});

const requestSchema = z.object({
  query: z.string().min(1).max(500),
  timezone: z.string().min(1).max(100).optional(),
  now: z.string().datetime().optional(),
  calendars: z.array(calendarSchema).max(50).default([]),
  events: z.array(eventSchema).max(300).default([]),
});

type BackendEvent = {
  id: string;
  title: string;
  description?: string | null;
  start: string;
  end: string;
  allDay?: boolean;
  location?: string | null;
  calendarId: string;
};

type DateRange = {
  start: Date;
  end: Date;
  label: string;
};

type CreateEventInput = {
  title: string;
  description?: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  calendarId: string;
};

type UpdateEventInput = {
  title?: string;
  description?: string;
  start?: string;
  end?: string;
  allDay?: boolean;
  location?: string;
  calendarId?: string;
};

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function addDays(date: Date, amount: number) {
  const value = new Date(date);
  value.setDate(value.getDate() + amount);
  return value;
}

function addMonths(date: Date, amount: number) {
  const value = new Date(date);
  value.setMonth(value.getMonth() + amount);
  return value;
}

function startOfWeek(date: Date) {
  const value = startOfDay(date);
  const day = value.getDay();
  const diff = (day + 6) % 7;
  return addDays(value, -diff);
}

function endOfWeek(date: Date) {
  return endOfDay(addDays(startOfWeek(date), 6));
}

function startOfMonth(date: Date) {
  const value = startOfDay(date);
  value.setDate(1);
  return value;
}

function endOfMonth(date: Date) {
  const value = startOfMonth(addMonths(date, 1));
  return endOfDay(addDays(value, -1));
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/\b(events?|schedule|calendar|meetings?)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseIsoDateOnly(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(parsed.getTime()) ? null : startOfDay(parsed);
}

function parseWeekday(value: string) {
  const clean = normalizeText(value).replace(/\b(on|for|at|the)\b/g, " ").trim();
  return WEEKDAY_NAMES.findIndex(
    (day) => clean === day || clean === day.slice(0, 3) || clean.endsWith(` ${day}`),
  );
}

function resolveWeekday(targetDay: number, now: Date, mode: "this" | "next" | "last" | "nearest") {
  const today = startOfDay(now);
  const currentDay = today.getDay();

  if (mode === "this") {
    return addDays(startOfWeek(today), (targetDay + 6) % 7);
  }

  if (mode === "last") {
    const delta = currentDay - targetDay;
    return startOfDay(addDays(today, delta >= 0 ? -delta : -(7 + delta)));
  }

  const rawDelta = (targetDay - currentDay + 7) % 7;
  const nextDelta = rawDelta === 0 ? 7 : rawDelta;

  if (mode === "next") {
    return startOfDay(addDays(today, nextDelta));
  }

  return startOfDay(addDays(today, nextDelta));
}

function parseNaturalDate(value: string, now: Date): Date | null {
  const raw = normalizeText(value).replace(/\b(my|what|whats|what is|show|tell me|about)\b/g, " ").trim();
  if (!raw) return null;

  const isoDate = parseIsoDateOnly(raw);
  if (isoDate) return isoDate;

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime()) && /\d/.test(raw)) {
    return direct;
  }

  if (raw === "today") return startOfDay(now);
  if (raw === "tomorrow") return startOfDay(addDays(now, 1));
  if (raw === "yesterday") return startOfDay(addDays(now, -1));

  const weekday = parseWeekday(raw);
  if (weekday !== -1) {
    if (raw.includes("next week")) return addDays(startOfWeek(addDays(now, 7)), (weekday + 6) % 7);
    if (raw.includes("this week")) return addDays(startOfWeek(now), (weekday + 6) % 7);
    if (raw.includes("last week")) return addDays(startOfWeek(addDays(now, -7)), (weekday + 6) % 7);
    if (raw.startsWith("next ")) return resolveWeekday(weekday, now, "next");
    if (raw.startsWith("this ")) return resolveWeekday(weekday, now, "this");
    if (raw.startsWith("last ")) return resolveWeekday(weekday, now, "last");
    return resolveWeekday(weekday, now, "nearest");
  }

  return null;
}

function parseTimeParts(value: string) {
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3]?.toLowerCase();

  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;

  return { hours, minutes };
}

function parseDateTime(input: string, now: Date) {
  const value = input.trim();
  if (!value) return null;

  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime()) && /\d/.test(value)) {
    return direct;
  }

  const timeOnly = parseTimeParts(value);
  if (timeOnly) {
    const date = new Date(now);
    date.setHours(timeOnly.hours, timeOnly.minutes, 0, 0);
    return date;
  }

  const combined = value.match(/^(.*?)(?:\s+at)?\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)$/i);
  if (combined) {
    const datePart = parseNaturalDate(combined[1], now);
    const timePart = parseTimeParts(combined[2]);
    if (datePart && timePart) {
      datePart.setHours(timePart.hours, timePart.minutes, 0, 0);
      return datePart;
    }
  }

  return parseNaturalDate(value, now);
}

function resolveDateRange(params: {
  rangeQuery?: string;
  startDate?: string;
  endDate?: string;
  now: Date;
}) {
  const { rangeQuery, startDate, endDate, now } = params;
  const query = normalizeText(rangeQuery || "");

  if (startDate) {
    const start = parseNaturalDate(startDate, now);
    if (!start) throw new Error(`Could not parse start date: ${startDate}`);

    const resolvedEnd = endDate ? parseNaturalDate(endDate, now) : null;
    const end = resolvedEnd ? endOfDay(resolvedEnd) : endOfDay(start);

    if (start > end) {
      throw new Error("End date must be on or after the start date.");
    }

    return {
      start: startOfDay(start),
      end,
      label: `${formatDate(start)} to ${formatDate(end)}`,
    } satisfies DateRange;
  }

  if (!query) {
    const today = startOfDay(now);
    return { start: today, end: endOfDay(today), label: formatDate(today) } satisfies DateRange;
  }

  if (query.includes("next weekend")) {
    const start = addDays(startOfWeek(addDays(now, 7)), 5);
    return { start, end: endOfDay(addDays(start, 1)), label: "next weekend" } satisfies DateRange;
  }
  if (query.includes("this weekend")) {
    const start = addDays(startOfWeek(now), 5);
    return { start, end: endOfDay(addDays(start, 1)), label: "this weekend" } satisfies DateRange;
  }
  if (query.includes("next week")) {
    const anchor = addDays(now, 7);
    return { start: startOfWeek(anchor), end: endOfWeek(anchor), label: "next week" } satisfies DateRange;
  }
  if (query.includes("this week")) {
    return { start: startOfWeek(now), end: endOfWeek(now), label: "this week" } satisfies DateRange;
  }
  if (query.includes("last week")) {
    const anchor = addDays(now, -7);
    return { start: startOfWeek(anchor), end: endOfWeek(anchor), label: "last week" } satisfies DateRange;
  }
  if (query.includes("next month")) {
    const anchor = addMonths(now, 1);
    return { start: startOfMonth(anchor), end: endOfMonth(anchor), label: "next month" } satisfies DateRange;
  }
  if (query.includes("this month")) {
    return { start: startOfMonth(now), end: endOfMonth(now), label: "this month" } satisfies DateRange;
  }
  if (query.includes("last month")) {
    const anchor = addMonths(now, -1);
    return { start: startOfMonth(anchor), end: endOfMonth(anchor), label: "last month" } satisfies DateRange;
  }

  const singleDate = parseNaturalDate(query, now);
  if (singleDate) {
    return {
      start: startOfDay(singleDate),
      end: endOfDay(singleDate),
      label: formatDate(singleDate),
    } satisfies DateRange;
  }

  throw new Error(`Could not understand the date range: ${rangeQuery}`);
}

function clampSearchWindow(start: Date, end: Date) {
  const diffDays = Math.ceil((end.getTime() - start.getTime()) / 86400000);
  if (diffDays > MAX_FETCH_WINDOW_DAYS) {
    throw new Error(`Date range is too large. Please keep it under ${MAX_FETCH_WINDOW_DAYS} days.`);
  }
}

function cacheEvents(cache: Map<string, BackendEvent>, events: BackendEvent[]) {
  for (const event of events) {
    cache.set(event.id, event);
  }
}

function eventMatchesSearch(event: BackendEvent, query?: string) {
  if (!query?.trim()) return true;
  const haystack = [event.title, event.description, event.location].filter(Boolean).join(" ").toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((token) => haystack.includes(token));
}

function formatEventResult(event: BackendEvent) {
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    start: event.start,
    end: event.end,
    allDay: !!event.allDay,
    location: event.location,
    calendarId: event.calendarId,
  };
}

async function fetchEvents(start: Date, end: Date, cookies: string) {
  clampSearchWindow(start, end);
  const url = `${backendUrl}/api/events?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;
  const response = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json", Cookie: cookies },
    credentials: "include",
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unable to read response");
    throw new Error(`Failed to fetch events (${response.status}): ${errorText.slice(0, 180)}`);
  }

  const data = await response.json();
  return (data.events || []).map((event: BackendEvent) => ({
    id: event.id,
    title: event.title,
    description: event.description || undefined,
    start: event.start,
    end: event.end,
    allDay: !!event.allDay,
    location: event.location || undefined,
    calendarId: event.calendarId,
  })) as BackendEvent[];
}

async function createEventOnBackend(input: CreateEventInput, cookies: string) {
  const response = await fetch(`${backendUrl}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookies },
    credentials: "include",
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unable to read response");
    throw new Error(`Failed to create event (${response.status}): ${errorText.slice(0, 180)}`);
  }

  const data = await response.json();
  return (data.event || data) as BackendEvent;
}

async function updateEventOnBackend(eventId: string, updates: UpdateEventInput, cookies: string) {
  const response = await fetch(`${backendUrl}/api/events/${eventId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookies },
    credentials: "include",
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unable to read response");
    throw new Error(`Failed to update event (${response.status}): ${errorText.slice(0, 180)}`);
  }

  const data = await response.json();
  return (data.event || data) as BackendEvent;
}

async function deleteEventOnBackend(eventId: string, cookies: string) {
  const response = await fetch(`${backendUrl}/api/events/${eventId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", Cookie: cookies },
    credentials: "include",
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unable to read response");
    throw new Error(`Failed to delete event (${response.status}): ${errorText.slice(0, 180)}`);
  }
}

export async function POST(req: Request) {
  try {
    const body = requestSchema.parse(await req.json());
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return Response.json({ error: "OPENROUTER_API_KEY is missing" }, { status: 500 });
    }

    const query = body.query.replace(/[\u0000-\u001F\u007F]/g, " ").trim();
    const lowered = query.toLowerCase();
    const now = new Date(body.now || Date.now());
    const timezone = body.timezone || "UTC";
    const cookies = req.headers.get("cookie") || "";
    const defaultCalendarId = body.calendars.find((calendar) => calendar.isDefault)?.id || body.calendars[0]?.id || "";

    const dangerousPatterns = [
      "ignore previous",
      "ignore all previous",
      "reveal system prompt",
      "show system prompt",
      "developer instructions",
      "bypass",
      "jailbreak",
      "you are now",
      "new instructions",
    ];

    if (dangerousPatterns.some((pattern) => lowered.includes(pattern))) {
      return Response.json({
        reply: "I can only help with calendar tasks like checking schedules or managing events.",
        createdEvent: null,
        updatedEvent: null,
        deletedEventId: null,
        events: [],
      });
    }

    const openrouter = createOpenRouter({ apiKey });
    const model = process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash-lite-preview-09-2025";
    const eventCache = new Map<string, BackendEvent>();
    const fetchedEvents: BackendEvent[] = [];
    let createdEvent: BackendEvent | null = null;
    let updatedEvent: BackendEvent | null = null;
    let deletedEventId: string | null = null;

    const result = await generateText({
      model: openrouter(model, {
        reasoning: {
          effort: "low",
        },
      }),
      temperature: 0,
      stopWhen: stepCountIs(12),
      system: `You are a calendar assistant.

Current time: ${now.toISOString()}
Timezone: ${timezone}
Available calendars: ${JSON.stringify(body.calendars)}
Default calendar ID: ${defaultCalendarId || "none"}
Client provided preview events count: ${body.events.length}

Rules:
1. Backend tools are the source of truth. Do not rely on preview events for schedule answers.
2. For any schedule question, always call get_events or find_events before answering.
3. For update or delete requests, call find_events or get_events first to identify the correct event.
4. If no event exists, clearly say so.
5. If the request is ambiguous, ask a short follow-up question instead of guessing.
6. Keep responses concise and accurate.
7. When listing events, include date and time context in a compact bullet list.`,
      prompt: query,
      tools: {
        get_events: tool({
          description: "Fetch events for a precise day, week, month, or custom range. Supports natural language like 'next monday', 'this week', or explicit start/end dates.",
          inputSchema: z.object({
            rangeQuery: z.string().optional().describe("Natural-language range like 'next monday' or 'this week'."),
            startDate: z.string().optional().describe("Optional explicit start date."),
            endDate: z.string().optional().describe("Optional explicit end date."),
            search: z.string().optional().describe("Optional text filter for event title, description, or location."),
          }),
          execute: async ({ rangeQuery, startDate, endDate, search }) => {
            const range = resolveDateRange({ rangeQuery, startDate, endDate, now });
            const events = (await fetchEvents(range.start, range.end, cookies)).filter((event) => eventMatchesSearch(event, search));
            cacheEvents(eventCache, events);
            fetchedEvents.push(...events);

            return {
              success: true,
              dateRange: {
                start: range.start.toISOString(),
                end: range.end.toISOString(),
                label: range.label,
              },
              count: events.length,
              events: events.map(formatEventResult),
            };
          },
        }),
        find_events: tool({
          description: "Search broadly for events when the date is unclear or when matching a title before updating or deleting.",
          inputSchema: z.object({
            query: z.string().min(1).describe("Search text to match against event title, description, or location."),
            rangeQuery: z.string().optional().describe("Optional range hint like 'next month' or 'this week'."),
          }),
          execute: async ({ query: searchQuery, rangeQuery }) => {
            const range = rangeQuery
              ? resolveDateRange({ rangeQuery, now })
              : {
                  start: startOfDay(addDays(now, -DEFAULT_SEARCH_BACK_DAYS)),
                  end: endOfDay(addDays(now, DEFAULT_SEARCH_FORWARD_DAYS)),
                  label: "broad search window",
                };

            const events = (await fetchEvents(range.start, range.end, cookies)).filter((event) => eventMatchesSearch(event, searchQuery));
            cacheEvents(eventCache, events);
            fetchedEvents.push(...events);

            return {
              success: true,
              query: searchQuery,
              dateRange: {
                start: range.start.toISOString(),
                end: range.end.toISOString(),
                label: range.label,
              },
              count: events.length,
              events: events.map(formatEventResult),
            };
          },
        }),
        create_event: tool({
          description: "Create a calendar event. Use natural language or explicit datetime strings. End time defaults to 1 hour after start unless all-day is true.",
          inputSchema: z.object({
            title: z.string().max(255),
            startDateTime: z.string(),
            endDateTime: z.string().optional(),
            allDay: z.boolean().optional(),
            description: z.string().max(1000).optional(),
            location: z.string().max(255).optional(),
            calendarId: z.string().optional(),
          }),
          execute: async ({ title, startDateTime, endDateTime, allDay, description, location, calendarId }) => {
            const start = parseDateTime(startDateTime, now);
            if (!start) {
              return { error: `Could not parse start time: ${startDateTime}` };
            }

            const end = allDay
              ? endOfDay(start)
              : endDateTime
                ? parseDateTime(endDateTime, now)
                : new Date(start.getTime() + 60 * 60 * 1000);

            if (!end) {
              return { error: `Could not parse end time: ${endDateTime}` };
            }

            const resolvedCalendarId = calendarId || defaultCalendarId;
            if (!resolvedCalendarId) {
              return { error: "No calendar is available for creating events." };
            }

            createdEvent = await createEventOnBackend(
              {
                title,
                description,
                start: (allDay ? startOfDay(start) : start).toISOString(),
                end: (allDay ? endOfDay(end) : end).toISOString(),
                allDay: !!allDay,
                location,
                calendarId: resolvedCalendarId,
              },
              cookies,
            );

            if (createdEvent) {
              eventCache.set(createdEvent.id, createdEvent);
            }

            return {
              success: true,
              event: createdEvent ? formatEventResult(createdEvent) : null,
            };
          },
        }),
        update_event: tool({
          description: "Update an existing event after locating it with get_events or find_events.",
          inputSchema: z.object({
            eventId: z.string(),
            title: z.string().max(255).optional(),
            description: z.string().max(1000).optional(),
            startDateTime: z.string().optional(),
            endDateTime: z.string().optional(),
            allDay: z.boolean().optional(),
            location: z.string().max(255).optional(),
            calendarId: z.string().optional(),
          }),
          execute: async ({ eventId, title, description, startDateTime, endDateTime, allDay, location, calendarId }) => {
            const existingEvent = eventCache.get(eventId);
            if (!existingEvent) {
              return { error: `Event ${eventId} is not loaded. Search for it first.` };
            }

            const updates: UpdateEventInput = {};
            if (title !== undefined) updates.title = title;
            if (description !== undefined) updates.description = description;
            if (location !== undefined) updates.location = location;
            if (calendarId !== undefined) updates.calendarId = calendarId;
            if (allDay !== undefined) updates.allDay = allDay;

            const parsedStart = startDateTime ? parseDateTime(startDateTime, now) : null;
            const parsedEnd = endDateTime ? parseDateTime(endDateTime, now) : null;

            if (startDateTime && !parsedStart) {
              return { error: `Could not parse start time: ${startDateTime}` };
            }
            if (endDateTime && !parsedEnd) {
              return { error: `Could not parse end time: ${endDateTime}` };
            }

            if (parsedStart) updates.start = parsedStart.toISOString();
            if (parsedEnd) updates.end = parsedEnd.toISOString();

            updatedEvent = await updateEventOnBackend(eventId, updates, cookies);
            eventCache.set(eventId, updatedEvent);

            return {
              success: true,
              event: formatEventResult(updatedEvent),
            };
          },
        }),
        delete_event: tool({
          description: "Delete an event after identifying its id.",
          inputSchema: z.object({ eventId: z.string() }),
          execute: async ({ eventId }) => {
            const existingEvent = eventCache.get(eventId);
            if (!existingEvent) {
              return { error: `Event ${eventId} is not loaded. Search for it first.` };
            }

            await deleteEventOnBackend(eventId, cookies);
            deletedEventId = eventId;
            eventCache.delete(eventId);

            return {
              success: true,
              deletedEventId: eventId,
              title: existingEvent.title,
            };
          },
        }),
      },
    });

    const uniqueFetchedEvents = Array.from(new Map(fetchedEvents.map((event) => [event.id, event])).values());

    return Response.json({
      reply: result.text,
      createdEvent,
      updatedEvent,
      deletedEventId,
      events: uniqueFetchedEvents,
    });
  } catch (error: any) {
    const reply = error?.message?.includes("parse")
      ? "I had trouble understanding that calendar request. Try rephrasing it with a clearer date or time."
      : "Something went wrong while handling that calendar request.";

    return Response.json(
      {
        reply,
        createdEvent: null,
        updatedEvent: null,
        deletedEventId: null,
        events: [],
        error: error?.message || "Unknown error",
      },
      { status: 400 },
    );
  }
}
