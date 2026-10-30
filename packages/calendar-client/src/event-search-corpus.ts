import type {
  CalendarEvent,
  EventSearchCorpusParams,
} from "@workspace/calendar-core";
import type { CalendarApiService } from "./calendar-api-service";

const PAGE_SIZE = 100;
const SEAL_BATCH_SIZE = 4;

/** Every page of the owner's events, decrypted on the device, so searching them sends no words to the server. */
export async function loadEventSearchCorpus(
  api: Pick<CalendarApiService, "getEventSearchCorpus">,
  params: Pick<EventSearchCorpusParams, "readableInvitations"> = {},
  signal?: AbortSignal,
): Promise<CalendarEvent[]> {
  const events: CalendarEvent[] = [];
  let offset = 0;
  do {
    const page = await api.getEventSearchCorpus(
      { ...params, limit: PAGE_SIZE, offset },
      signal,
    );
    events.push(...page.events);
    offset = page.nextOffset ?? -1;
  } while (offset >= 0 && !signal?.aborted);
  return events;
}

/** Seals every invitation copy the server still stores readable; one that fails waits for the next start. */
export async function sealReadableInvitations(
  api: Pick<
    CalendarApiService,
    "getEventSearchCorpus" | "sealImportedInvitationIfNeeded"
  >,
): Promise<void> {
  const readable = await loadEventSearchCorpus(api, {
    readableInvitations: true,
  });
  // Small batches keep a large backlog from flooding the API.
  for (let index = 0; index < readable.length; index += SEAL_BATCH_SIZE) {
    await Promise.all(
      readable
        .slice(index, index + SEAL_BATCH_SIZE)
        .map((event) => api.sealImportedInvitationIfNeeded(event)),
    );
  }
}
