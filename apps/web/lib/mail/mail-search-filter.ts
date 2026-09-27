import {
  extractTextQueryFromJmapFilter,
  sortMailMessagesBySearchRelevance,
} from "@workspace/calendar-core";
import type { JmapEmailMessage } from "@/lib/mail/types";
import { searchMailMessages } from "@/lib/search/unified-search";

export {
  SEARCH_FILTER_FIELDS,
  buildJmapFilter,
  conditionToChip,
  filtersToChips,
  hasActiveFilters,
  toJmapTextQuery,
  type MailSearchChip,
  type MailSearchFilterCondition,
  type MailSearchFilters,
} from "@workspace/calendar-core";

export function mergeInlineSearchResults(
  serverResults: JmapEmailMessage[],
  loadedMessages: JmapEmailMessage[],
  query: string,
): JmapEmailMessage[] {
  const trimmed = query.trim();
  if (!trimmed) return serverResults;

  const localMatches = searchMailMessages(loadedMessages, trimmed, 40).map(
    (result) => result.message,
  );
  if (localMatches.length === 0) {
    return sortMailMessagesBySearchRelevance(serverResults, trimmed);
  }

  const seen = new Set(serverResults.map((message) => message.id));
  const merged = [...serverResults];
  for (const message of localMatches) {
    if (!seen.has(message.id)) {
      merged.push(message);
      seen.add(message.id);
    }
  }
  return sortMailMessagesBySearchRelevance(merged, trimmed);
}

export { extractTextQueryFromJmapFilter };
