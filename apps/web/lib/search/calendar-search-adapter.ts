import type { CalendarEvent } from "@workspace/calendar-core";
import { calendarApiService } from "@/lib/calendar-api-service";
import {
  encryptSearchShard,
  type EncryptedSearchShard,
} from "./local-index-store";

export type CalendarSearchDocument = {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  start: string;
  end: string;
  calendarId: string;
  categoryId?: string | null;
  encryptionState?: CalendarEvent["encryptionState"];
  updatedAt: string;
};

export type CalendarSearchCorpusSnapshot = {
  events: CalendarEvent[];
  total: number;
  indexedAt: string;
};

export async function loadCalendarSearchCorpus(options: {
  updatedAfter?: string;
  pageSize?: number;
  signal?: AbortSignal;
} = {}): Promise<CalendarSearchCorpusSnapshot> {
  const pageSize = Math.min(Math.max(options.pageSize ?? 100, 1), 200);
  const events: CalendarEvent[] = [];
  let offset = 0;
  let total = 0;

  do {
    const page = await calendarApiService.getEventSearchCorpus(
      {
        limit: pageSize,
        offset,
        updatedAfter: options.updatedAfter,
      },
      options.signal,
    );
    events.push(...page.events);
    total = page.total;
    offset = page.nextOffset ?? -1;
  } while (offset >= 0 && !options.signal?.aborted);

  return {
    events,
    total,
    indexedAt: new Date().toISOString(),
  };
}

export function eventToCalendarSearchDocument(
  event: CalendarEvent,
): CalendarSearchDocument {
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    location: event.location,
    start: event.start.toISOString(),
    end: event.end.toISOString(),
    calendarId: event.calendarId,
    categoryId: event.categoryId,
    encryptionState: event.encryptionState,
    updatedAt: event.updatedAt.toISOString(),
  };
}

export async function encryptCalendarSearchShard(input: {
  key: CryptoKey;
  userId: string;
  events: CalendarEvent[];
}): Promise<EncryptedSearchShard> {
  const documents = input.events.map(eventToCalendarSearchDocument);
  return encryptSearchShard(input.key, { documents }, {
    additionalData: `calendar:${input.userId}`,
    itemCount: documents.length,
  });
}
