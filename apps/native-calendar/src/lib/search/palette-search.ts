import {
  mergeUnifiedSearchResults,
  searchTitleIndex,
  titleHitToUnifiedResult,
  type CalendarEvent,
  type TitleIndexDocument,
  type UnifiedCalendarSearchResult,
  type UnifiedSearchResult,
} from "@workspace/calendar-core";
import { toCalendarSearchResult } from "./calendar-search-result";

export type NativePaletteSearchResult = UnifiedCalendarSearchResult;

function isCalendarResult(
  result: UnifiedSearchResult,
): result is UnifiedCalendarSearchResult {
  return result.source === "calendar";
}

export function mergePaletteSearchResults(input: {
  titleDocuments: TitleIndexDocument[];
  query: string;
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

  const calendarHits = input.events.map((event, index) =>
    toCalendarSearchResult(event, index),
  );

  return mergeUnifiedSearchResults([localHits, calendarHits], input.limit).filter(
    isCalendarResult,
  );
}
