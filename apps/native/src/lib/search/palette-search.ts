import {
  mailToTitleIndexDocument,
  mergeUnifiedSearchResults,
  searchTitleIndex,
  titleHitToUnifiedResult,
  type TitleIndexDocument,
  type UnifiedSearchResult,
} from "@workspace/calendar-core";
import type { CalendarEvent } from "@workspace/calendar-core";
import type { JmapEmailMessage } from "../mail/types";
import { toCalendarSearchResult } from "./calendar-search-result";

export type NativePaletteSearchResult = UnifiedSearchResult<JmapEmailMessage>;

function stubMailMessage(document: TitleIndexDocument): JmapEmailMessage {
  return {
    id: document.messageId ?? document.id.replace(/^mail:/, ""),
    subject: document.title,
    threadId: document.threadId,
    receivedAt: document.timestamp,
    mailboxIds: Object.fromEntries(
      (document.mailboxIds ?? []).map((id) => [id, true] as const),
    ),
  };
}

export function mailMessageToSearchResult(
  message: JmapEmailMessage,
  score: number,
): NativePaletteSearchResult {
  const document = mailToTitleIndexDocument(message);
  return titleHitToUnifiedResult(
    {
      document,
      score,
      matchedFields: ["title"],
      snippet: document.subtitle,
    },
    () => message,
  );
}

export function mergePaletteSearchResults(input: {
  titleDocuments: TitleIndexDocument[];
  query: string;
  events: CalendarEvent[];
  messages: JmapEmailMessage[];
  limit: number;
}): NativePaletteSearchResult[] {
  const localHits = searchTitleIndex(
    input.titleDocuments,
    input.query,
    input.limit * 2,
  ).map((hit) => titleHitToUnifiedResult(hit, stubMailMessage));

  const calendarHits = input.events.map((event, index) =>
    toCalendarSearchResult(event, index),
  );
  const mailHits = input.messages.map((message, index) =>
    mailMessageToSearchResult(message, 80 - index),
  );

  return mergeUnifiedSearchResults<JmapEmailMessage>(
    [localHits, calendarHits, mailHits],
    input.limit,
  );
}
