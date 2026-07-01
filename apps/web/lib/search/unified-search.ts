import type {
  UnifiedMailSearchResult,
  UnifiedSearchEncryptionStatus,
  UnifiedSearchResult,
} from "@workspace/calendar-core";
import {
  normalizeSearchText as normalizeSearchTextImpl,
  scoreMailSearchMessage as scoreMailSearchMessageImpl,
  sortMailMessagesBySearchRelevance as sortMailMessagesBySearchRelevanceImpl,
  tokenizeSearchQuery as tokenizeSearchQueryImpl,
} from "@workspace/calendar-core";
import type { CalendarEvent } from "@workspace/ui/components/calendar";
import type { JmapEmailMessage } from "@/lib/mail/types";
import { classifyMessageEncryption } from "@/lib/mail/message-security";

export const normalizeSearchText = normalizeSearchTextImpl;
export const tokenizeSearchQuery = tokenizeSearchQueryImpl;
export const sortMailMessagesBySearchRelevance =
  sortMailMessagesBySearchRelevanceImpl;

function getMailFromLabel(message: JmapEmailMessage): string | undefined {
  const first = message.from?.[0];
  if (!first) return undefined;
  if (first.name && first.email) return `${first.name} <${first.email}>`;
  return first.name ?? first.email ?? undefined;
}

function getMailEncryptionStatus(
  message: JmapEmailMessage,
): UnifiedSearchEncryptionStatus {
  const state = classifyMessageEncryption(message);
  if (state === "plain") return "plaintext";
  if (state === "inline_pgp" || state === "pgp_mime") {
    return "metadata-only";
  }
  return "encrypted-locked";
}

export function searchMailMessages(
  messages: JmapEmailMessage[],
  query: string,
  limit: number,
): UnifiedMailSearchResult<JmapEmailMessage>[] {
  const results = messages.flatMap((message) => {
    const scored = scoreMailSearchMessageImpl(message, query);
    if (!scored) return [];

    const from = getMailFromLabel(message);

    return [
      {
        id: `mail:${message.id}`,
        source: "mail" as const,
        messageId: message.id,
        threadId: message.threadId,
        mailboxIds: Object.keys(message.mailboxIds ?? {}),
        title: message.subject?.trim() || "(no subject)",
        snippet: scored.snippet,
        timestamp: message.receivedAt,
        score: scored.score,
        encryptionStatus: getMailEncryptionStatus(message),
        matchedFields: scored.matchedFields,
        from,
        message,
      },
    ];
  });

  return results.sort((left, right) => right.score - left.score).slice(0, limit);
}

export function toCalendarSearchResult(
  event: CalendarEvent,
  index: number,
): UnifiedSearchResult<JmapEmailMessage> {
  const encryptionStatus: UnifiedSearchEncryptionStatus =
    event.encryptionState === "encrypted"
      ? "encrypted-indexed"
      : event.encryptionState === "shadow_write"
        ? "metadata-only"
        : "plaintext";

  return {
    id: `calendar:${event.id}`,
    source: "calendar",
    eventId: event.id,
    title: event.title,
    snippet: event.location ?? event.description ?? undefined,
    timestamp:
      event.start instanceof Date
        ? event.start.toISOString()
        : new Date(event.start).toISOString(),
    score: 100 - index,
    encryptionStatus,
    matchedFields: ["calendar"],
    event,
  };
}
