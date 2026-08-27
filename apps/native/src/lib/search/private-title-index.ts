import {
  eventToTitleIndexDocument,
  mailToTitleIndexDocument,
  type TitleIndexDocument,
} from "@workspace/calendar-core";
import { calendarApiService } from "../api";
import type { MailRuntime } from "../mail/mail-runtime";
import {
  loadNativeTitleIndex,
  saveNativeTitleIndex,
} from "./title-index-store";

const PAGE_SIZE = 100;
const MAX_MAIL_PER_MAILBOX = 800;
const MAX_MAILBOXES = 12;
const MAX_MAIL_TITLES = 6000;

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

async function loadMailTitles(
  runtime: MailRuntime,
): Promise<TitleIndexDocument[]> {
  const mailboxes = runtime.mailboxes.slice(0, MAX_MAILBOXES);
  const unique = new Map<string, TitleIndexDocument>();

  for (const mailbox of mailboxes) {
    if (unique.size >= MAX_MAIL_TITLES) break;
    let position = 0;
    let loaded = 0;
    let total = Number.POSITIVE_INFINITY;

    while (
      loaded < MAX_MAIL_PER_MAILBOX &&
      position < total &&
      unique.size < MAX_MAIL_TITLES
    ) {
      const page = await runtime.client.getMailboxMessagesForIndex(
        runtime.session,
        mailbox.id,
        { limit: PAGE_SIZE, position },
      );
      total = page.total;
      if (page.messages.length === 0) break;
      for (const message of page.messages) {
        unique.set(message.id, mailToTitleIndexDocument(message));
      }
      loaded += page.messages.length;
      position += page.messages.length;
    }
  }

  return Array.from(unique.values());
}

export async function rebuildNativeTitleIndex(input: {
  accountId: string;
  runtime?: MailRuntime | null;
  signal?: AbortSignal;
}): Promise<TitleIndexDocument[]> {
  const calendarDocuments = await loadCalendarTitles(input.signal);
  const mailDocuments = input.runtime
    ? await loadMailTitles(input.runtime)
    : [];
  const documents = [...calendarDocuments, ...mailDocuments];
  await saveNativeTitleIndex({ accountId: input.accountId, documents });
  return documents;
}

export async function readNativeTitleIndex(
  accountId: string,
): Promise<TitleIndexDocument[]> {
  return loadNativeTitleIndex(accountId);
}
