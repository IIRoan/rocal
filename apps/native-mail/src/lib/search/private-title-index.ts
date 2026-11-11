import {
  buildMailBodyExcerpt,
  collectPrivateMailTitles,
  withPrivateSearchBodyCoverage,
  type PrivateSearchCoverage,
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
  captureNativeTitleIndexRequest,
  loadNativeTitleIndex,
  loadNativeTitleIndexSnapshot,
  saveNativeTitleIndex,
} from "@workspace/native-core/lib/search/title-index-store";

async function loadMailTitles(runtime: MailRuntime, isCurrent: () => boolean) {
  return collectPrivateMailTitles({
    mailboxIds: runtime.mailboxes.map((mailbox) => mailbox.id),
    isCurrent,
    loadPage: (mailboxId, position, limit) =>
      runtime.client.getMailboxMessagesForIndex(runtime.session, mailboxId, {
        limit,
        position,
      }),
  });
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
  isCurrent?: () => boolean;
  runtime: MailRuntime;
}): Promise<{
  documents: TitleIndexDocument[];
  pendingBodies: number;
  loadedBodies: number;
  coverage: PrivateSearchCoverage;
}> {
  const owner = captureNativeTitleIndexRequest(input.accountId);
  const request = { ...owner, isCurrent: () => owner.isCurrent() && (input.isCurrent?.() ?? true) };
  if (!request.isCurrent()) throw new Error("Private search was cancelled.");
  const [titles, previous] = await Promise.all([
    loadMailTitles(input.runtime, request.isCurrent),
    loadNativeTitleIndex(input.accountId, request),
  ]);
  const { documents, pending, loaded } = await refreshMailBodyExcerpts({
    documents: titles.documents,
    previous,
    loadBodies: createBodyLoader(input.runtime),
  });
  const coverage = withPrivateSearchBodyCoverage(titles.coverage, documents);
  await saveNativeTitleIndex({
    accountId: input.accountId,
    documents,
    request,
    coverage,
  });
  if (!request.isCurrent()) throw new Error("Private search was cancelled.");
  return { documents, pendingBodies: pending, loadedBodies: loaded, coverage };
}

export async function readNativeTitleIndex(
  accountId: string,
): Promise<TitleIndexDocument[]> {
  return loadNativeTitleIndex(accountId);
}

export const readNativeTitleIndexSnapshot = loadNativeTitleIndexSnapshot;
