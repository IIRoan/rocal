import {
  mergeUnifiedSearchResults,
  searchCalendarEvents,
  searchTitleIndex,
  titleHitToUnifiedResult,
  type CalendarEvent,
  type TitleIndexDocument,
  type UnifiedCalendarSearchResult,
  type UnifiedSearchResult,
} from "@workspace/calendar-core";

export type NativePaletteSearchResult = UnifiedCalendarSearchResult;

function isCalendarResult(
  result: UnifiedSearchResult,
): result is UnifiedCalendarSearchResult {
  return result.source === "calendar";
}

export function mergePaletteSearchResults(input: {
  titleDocuments: TitleIndexDocument[];
  query: string;
  /** The decrypted corpus held in memory; searched on the device. */
  events: CalendarEvent[];
  limit: number;
}): NativePaletteSearchResult[] {
  const localHits = searchTitleIndex(
    input.titleDocuments.filter((document) => document.source === "calendar"),
    input.query,
    input.limit * 2,
  )
    .map((hit) => titleHitToUnifiedResult(hit))
    .filter(isCalendarResult);

  const liveHits = searchCalendarEvents(input.events, input.query, input.limit * 2);

  // Live hits go first so a tie keeps the full event over the index's stub.
  return mergeUnifiedSearchResults([liveHits, localHits], input.limit).filter(
    isCalendarResult,
  );
}
