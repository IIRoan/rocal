import {
  eventToTitleIndexDocument,
  type TitleIndexDocument,
} from "@workspace/calendar-core";
import { calendarApiService } from "@workspace/native-core/lib/api";
import {
  loadNativeTitleIndex,
  saveNativeTitleIndex,
} from "@workspace/native-core/lib/search/title-index-store";

const PAGE_SIZE = 100;

async function loadCalendarTitles(
  signal?: AbortSignal,
): Promise<TitleIndexDocument[]> {
  const documents: TitleIndexDocument[] = [];
  let offset = 0;

  do {
    const page = await calendarApiService.getEventSearchCorpus(
      { limit: PAGE_SIZE, offset },
      signal,
    );
    for (const event of page.events) {
      const document = eventToTitleIndexDocument(event);
      if (document) documents.push(document);
    }
    offset = page.nextOffset ?? -1;
  } while (offset >= 0 && !signal?.aborted);

  return documents;
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
