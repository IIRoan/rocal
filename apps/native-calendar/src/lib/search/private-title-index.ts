import {
  eventToTitleIndexDocument,
  type TitleIndexDocument,
} from "@workspace/calendar-core";
import { loadEventSearchCorpus } from "@workspace/calendar-client";
import { calendarApiService } from "@workspace/native-core/lib/api";
import {
  loadNativeTitleIndex,
  saveNativeTitleIndex,
} from "@workspace/native-core/lib/search/title-index-store";

async function loadCalendarTitles(
  signal?: AbortSignal,
): Promise<TitleIndexDocument[]> {
  const events = await loadEventSearchCorpus(calendarApiService, {}, signal);
  return events.flatMap((event) => {
    const document = eventToTitleIndexDocument(event);
    return document ? [document] : [];
  });
}

export async function rebuildNativeTitleIndex(input: {
  accountId: string;
  signal?: AbortSignal;
}): Promise<TitleIndexDocument[]> {
  const documents = await loadCalendarTitles(input.signal);
  await saveNativeTitleIndex({ accountId: input.accountId, documents });
  return documents;
}

export async function readNativeTitleIndex(
  accountId: string,
): Promise<TitleIndexDocument[]> {
  return loadNativeTitleIndex(accountId);
}
