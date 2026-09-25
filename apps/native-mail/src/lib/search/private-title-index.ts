import {
  mailToTitleIndexDocument,
  type TitleIndexDocument,
} from "@workspace/calendar-core";
import type { MailRuntime } from "../mail/mail-runtime";
import {
  loadNativeTitleIndex,
  saveNativeTitleIndex,
} from "@workspace/native-core/lib/search/title-index-store";

const PAGE_SIZE = 100;
const MAX_MAIL_PER_MAILBOX = 800;
const MAX_MAILBOXES = 12;
const MAX_MAIL_TITLES = 6000;

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
  runtime: MailRuntime;
}): Promise<TitleIndexDocument[]> {
  const documents = await loadMailTitles(input.runtime);
  await saveNativeTitleIndex({ accountId: input.accountId, documents });
  return documents;
}

export async function readNativeTitleIndex(
  accountId: string,
): Promise<TitleIndexDocument[]> {
  return loadNativeTitleIndex(accountId);
}
