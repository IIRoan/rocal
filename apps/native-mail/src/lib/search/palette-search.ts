import {
  mailToTitleIndexDocument,
  mergeUnifiedSearchResults,
  searchTitleIndex,
  titleHitToUnifiedResult,
  type TitleIndexDocument,
  type UnifiedMailSearchResult,
  type UnifiedSearchResult,
} from "@workspace/calendar-core";
import type { JmapEmailMessage } from "../mail/types";

export type NativePaletteSearchResult = UnifiedMailSearchResult<JmapEmailMessage>;

function isMailResult(
  result: UnifiedSearchResult<JmapEmailMessage>,
): result is NativePaletteSearchResult {
  return result.source === "mail";
}

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
): UnifiedSearchResult<JmapEmailMessage> {
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
  messages: JmapEmailMessage[];
  limit: number;
}): NativePaletteSearchResult[] {
  const localHits = searchTitleIndex(
    input.titleDocuments.filter((document) => document.source === "mail"),
    input.query,
    input.limit * 2,
  ).map((hit) => titleHitToUnifiedResult(hit, stubMailMessage));

  const mailHits = input.messages.map((message, index) =>
    mailMessageToSearchResult(message, 80 - index),
  );

  return mergeUnifiedSearchResults<JmapEmailMessage>(
    [localHits, mailHits],
    input.limit,
  ).filter(isMailResult);
}
