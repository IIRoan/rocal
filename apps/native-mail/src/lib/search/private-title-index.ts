import {
  buildMailBodyExcerpt,
  mailToTitleIndexDocument,
  refreshMailBodyExcerpts,
  runTasksWithConcurrencyLimit,
  type TitleIndexDocument,
} from "@workspace/calendar-core";
import type { MailRuntime } from "../mail/mail-runtime";
import {
  decryptMailMessage,
  decryptPgpMimeMessage,
  type MailDecryptResult,
} from "../mail/mail-crypto";
import {
  classifyMessageEncryption,
  extractMessageBodies,
  resolveInlinePgpArmoredCiphertext,
} from "../mail/message-security";
import type { JmapEmailMessage } from "../mail/types";
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

async function messageBodyExcerpt(
  runtime: MailRuntime,
  message: JmapEmailMessage,
): Promise<string> {
  const encryption = classifyMessageEncryption(message);
  if (encryption === "plain") {
    return buildMailBodyExcerpt(extractMessageBodies(message));
  }

  let decrypted: MailDecryptResult;
  if (encryption === "pgp_mime") {
    decrypted = await decryptPgpMimeMessage(
      runtime,
      message.id,
      message.bodyStructure,
    );
  } else if (encryption === "inline_pgp") {
    const armored = await resolveInlinePgpArmoredCiphertext({
      message,
      fetchBlob: (blobId) =>
        runtime.client.getBlobAsText(runtime.session, blobId),
    });
    decrypted = await decryptMailMessage(runtime, message.id, armored);
  } else {
    return "";
  }
  return buildMailBodyExcerpt({
    text: decrypted.plaintext,
    html: decrypted.html,
  });
}

/** Decrypts one message at a time so indexing never holds several bodies in memory. */
function createBodyLoader(runtime: MailRuntime) {
  return async (batch: TitleIndexDocument[]): Promise<Map<string, string>> => {
    const ids = batch.flatMap((document) =>
      document.messageId ? [document.messageId] : [],
    );
    const messages = await runtime.client.getMessagesByIds(
      runtime.session,
      ids,
    );
    const excerpts = new Map<string, string>();
    await runTasksWithConcurrencyLimit(
      messages.map((message) => async () => {
        try {
          excerpts.set(
            `mail:${message.id}`,
            await messageBodyExcerpt(runtime, message),
          );
        } catch {
          // Left out so the pass can tell unreadable messages from a locked vault.
        }
      }),
      1,
    );
    return excerpts;
  };
}

export async function rebuildNativeTitleIndex(input: {
  accountId: string;
  runtime: MailRuntime;
}): Promise<{
  documents: TitleIndexDocument[];
  pendingBodies: number;
  loadedBodies: number;
}> {
  const [titles, previous] = await Promise.all([
    loadMailTitles(input.runtime),
    loadNativeTitleIndex(input.accountId),
  ]);
  const { documents, pending, loaded } = await refreshMailBodyExcerpts({
    documents: titles,
    previous,
    loadBodies: createBodyLoader(input.runtime),
  });
  await saveNativeTitleIndex({ accountId: input.accountId, documents });
  return { documents, pendingBodies: pending, loadedBodies: loaded };
}

export async function readNativeTitleIndex(
  accountId: string,
): Promise<TitleIndexDocument[]> {
  return loadNativeTitleIndex(accountId);
}
