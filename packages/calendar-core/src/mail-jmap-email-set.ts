import { z } from "zod";
import {
  getEmailDomain,
  parseRecipientString,
  type ParsedMailAddress,
} from "./mail-addresses";
import type { JmapMethodCallLike } from "./mail-server-policy";

export type JmapEmailSetMethodCall = [
  "Email/set",
  Record<string, unknown>,
  string,
];

export type JmapAttachmentInput = {
  blobId: string;
  name: string;
  type: string;
  size: number;
  disposition?: "attachment" | "inline";
  cid?: string;
};

export type JmapPgpMimeCiphertext = {
  blobId: string;
  size: number;
};

/** Creation id of the self-encrypted Sent copy created next to a plaintext submission. */
export const SENT_COPY_CREATION_ID = "sent1";

type OutgoingEmailHeaders = {
  fromEmail: string;
  fromName?: string | null;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
};

function toJmapAddressList(addresses: string[]): ParsedMailAddress[] {
  return addresses.map((address) => parseRecipientString(address));
}

function buildEmailHeaders(input: OutgoingEmailHeaders): Record<string, unknown> {
  const fromName = input.fromName?.trim();
  return {
    from: [{ email: input.fromEmail, ...(fromName ? { name: fromName } : {}) }],
    to: toJmapAddressList(input.to),
    ...(input.cc?.length ? { cc: toJmapAddressList(input.cc) } : {}),
    ...(input.bcc?.length ? { bcc: toJmapAddressList(input.bcc) } : {}),
    subject: input.subject,
  };
}

function normalizeJmapBodyValue(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n/g, "\r\n");
}

/** RFC 3156 PGP/MIME body: a version part and the armored ciphertext blob, the layout Stalwart's encryption at rest uses. */
function buildPgpMimeContentFields(
  ciphertext: JmapPgpMimeCiphertext,
): Record<string, unknown> {
  return {
    bodyStructure: {
      type: "multipart/encrypted",
      subParts: [
        { type: "application/pgp-encrypted", partId: "pgp-version" },
        {
          type: "application/octet-stream",
          blobId: ciphertext.blobId,
          size: ciphertext.size,
        },
      ],
    },
    bodyValues: { "pgp-version": { value: "Version: 1\r\n" } },
  };
}

/** JMAP Email/set body fields, using the convenience textBody/htmlBody/attachments properties for plaintext. */
function buildEmailContentFields(input: {
  textBody: string;
  htmlBody?: string;
  attachments?: JmapAttachmentInput[];
  pgpMimeCiphertext?: JmapPgpMimeCiphertext;
}): Record<string, unknown> {
  if (input.pgpMimeCiphertext) {
    return buildPgpMimeContentFields(input.pgpMimeCiphertext);
  }

  const trimmedHtml = input.htmlBody?.trim();
  return {
    bodyValues: {
      text: { value: normalizeJmapBodyValue(input.textBody) },
      ...(trimmedHtml ? { html: { value: normalizeJmapBodyValue(trimmedHtml) } } : {}),
    },
    textBody: [{ partId: "text", type: "text/plain" }],
    ...(trimmedHtml ? { htmlBody: [{ partId: "html", type: "text/html" }] } : {}),
    ...(input.attachments?.length
      ? {
          attachments: input.attachments.map((attachment) => ({
            blobId: attachment.blobId,
            type: attachment.type,
            name: attachment.name,
            disposition: attachment.disposition ?? "attachment",
            ...(attachment.cid ? { cid: attachment.cid } : {}),
          })),
        }
      : {}),
  };
}

/** Shared by the submitted email and its Sent copy, so replies thread onto the copy. */
function createMessageId(fromEmail: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${token}@${getEmailDomain(fromEmail) ?? "localhost"}`;
}

export function buildSendMessageMethodCalls(
  input: OutgoingEmailHeaders & {
    draftsMailboxId: string;
    sentMailboxId?: string | null;
    textBody: string;
    htmlBody?: string;
    identityId: string;
    attachments?: JmapAttachmentInput[];
    pgpMimeCiphertext?: JmapPgpMimeCiphertext;
    /** Self-encrypted copy stored in Sent when the submission itself is plaintext; null when it is already encrypted to the sender. */
    sentCopyCiphertext: JmapPgpMimeCiphertext | null;
    inReplyTo?: string[];
    references?: string[];
    previousDraftId?: string;
  },
): JmapMethodCallLike[] {
  const headers = buildEmailHeaders(input);
  const seenEnvelopeRecipients = new Set<string>();
  const envelopeRecipients: { email: string }[] = [];
  for (const address of toJmapAddressList([
    ...input.to,
    ...(input.cc ?? []),
    ...(input.bcc ?? []),
  ])) {
    if (seenEnvelopeRecipients.has(address.email)) continue;
    seenEnvelopeRecipients.add(address.email);
    envelopeRecipients.push({ email: address.email });
  }

  const threading = {
    ...(input.sentCopyCiphertext ? { messageId: [createMessageId(input.fromEmail)] } : {}),
    ...(input.inReplyTo?.length ? { inReplyTo: input.inReplyTo } : {}),
    ...(input.references?.length ? { references: input.references } : {}),
  };
  const create: Record<string, unknown> = {
    draft1: {
      mailboxIds: { [input.draftsMailboxId]: true },
      keywords: { $seen: true, $draft: true },
      ...threading,
      ...headers,
      ...buildEmailContentFields(input),
    },
  };

  const submissionParams: Record<string, unknown> = {
    create: {
      s1: {
        emailId: "#draft1",
        identityId: input.identityId,
        envelope: {
          mailFrom: { email: input.fromEmail.trim() },
          rcptTo: envelopeRecipients,
        },
      },
    },
  };

  if (input.sentCopyCiphertext) {
    // Stalwart queues its own copy of the bytes, so destroying the plaintext email never cancels delivery.
    submissionParams.onSuccessDestroyEmail = ["#s1"];
    if (input.sentMailboxId) {
      create[SENT_COPY_CREATION_ID] = {
        mailboxIds: { [input.sentMailboxId]: true },
        keywords: { $seen: true },
        ...threading,
        ...headers,
        ...buildPgpMimeContentFields(input.sentCopyCiphertext),
      };
    }
  } else if (input.sentMailboxId) {
    submissionParams.onSuccessUpdateEmail = {
      "#s1": {
        [`mailboxIds/${input.sentMailboxId}`]: true,
        [`mailboxIds/${input.draftsMailboxId}`]: null,
        "keywords/$draft": null,
      },
    };
  }

  const emailSetArgs: Record<string, unknown> = { create };
  if (input.previousDraftId) {
    emailSetArgs.destroy = [input.previousDraftId];
  }

  return [
    ["Email/set", emailSetArgs, "c1"],
    ["EmailSubmission/set", submissionParams, "c2"],
  ];
}

/** Drafts are stored only as PGP/MIME encrypted to the account's own key; the headers stay readable. */
export function buildDraftMethodCalls(
  input: OutgoingEmailHeaders & {
    draftsMailboxId: string;
    ciphertext: JmapPgpMimeCiphertext;
    previousDraftId?: string;
  },
): JmapMethodCallLike[] {
  const emailSetArgs: Record<string, unknown> = {
    create: {
      draft1: {
        mailboxIds: { [input.draftsMailboxId]: true },
        keywords: { $draft: true },
        ...buildEmailHeaders(input),
        ...buildPgpMimeContentFields(input.ciphertext),
      },
    },
  };

  if (input.previousDraftId) {
    emailSetArgs.destroy = [input.previousDraftId];
  }

  return [["Email/set", emailSetArgs, "c1"]];
}

const createdIdSchema = z.object({ id: z.string().min(1) });
const sendEmailSetResultSchema = z.object({
  created: z
    .object({
      draft1: createdIdSchema.optional(),
      [SENT_COPY_CREATION_ID]: createdIdSchema.optional(),
    })
    .nullish(),
});
const sendSubmissionResultSchema = z.object({
  created: z.object({ s1: createdIdSchema }),
});

/** After a refused submission, drops the plaintext email and keeps its encrypted Sent copy as the draft; null when nothing needs fixing. */
export function buildUnsentMessageCleanupMethodCall(input: {
  accountId: string;
  draftsMailboxId: string;
  methodResponses: readonly [string, unknown, string][] | undefined;
}): JmapEmailSetMethodCall | null {
  const resultOf = (name: string) =>
    input.methodResponses?.find(([method]) => method === name)?.[1];
  if (sendSubmissionResultSchema.safeParse(resultOf("EmailSubmission/set")).success) {
    return null;
  }
  const created = sendEmailSetResultSchema.safeParse(resultOf("Email/set"));
  const plaintextId = created.success ? created.data.created?.draft1?.id : undefined;
  const copyId = created.success
    ? created.data.created?.[SENT_COPY_CREATION_ID]?.id
    : undefined;
  if (!plaintextId && !copyId) return null;

  return [
    "Email/set",
    {
      accountId: input.accountId,
      ...(plaintextId ? { destroy: [plaintextId] } : {}),
      ...(copyId
        ? {
            update: {
              [copyId]: {
                mailboxIds: { [input.draftsMailboxId]: true },
                keywords: { $draft: true, $seen: true },
              },
            },
          }
        : {}),
    },
    "c1",
  ];
}

export type MailMailboxRestore = {
  id: string;
  mailboxIds: Record<string, boolean>;
};

export const EMPTY_MAILBOX_BATCH_SIZE = 100;

export function buildEmailDestroyMethodCall(
  accountId: string,
  messageIds: readonly string[],
): JmapEmailSetMethodCall {
  return ["Email/set", { accountId, destroy: [...messageIds] }, "c1"];
}

export function buildEmailMoveMethodCall(
  accountId: string,
  messageIds: readonly string[],
  targetMailboxId: string,
): JmapEmailSetMethodCall {
  const update = Object.fromEntries(
    messageIds.map((id) => [id, { mailboxIds: { [targetMailboxId]: true } }]),
  );
  return ["Email/set", { accountId, update }, "c1"];
}

/** Puts each message back into exactly the mailboxes it had before a move (undo). */
export function buildEmailRestoreMailboxesMethodCall(
  accountId: string,
  restores: readonly MailMailboxRestore[],
): JmapEmailSetMethodCall {
  const update = Object.fromEntries(
    restores.map(({ id, mailboxIds }) => [id, { mailboxIds: { ...mailboxIds } }]),
  );
  return ["Email/set", { accountId, update }, "c1"];
}

/** Captures current mailbox membership so a later move can be undone; skips messages with none. */
export function collectMailboxRestores(
  messages: readonly { id: string; mailboxIds?: Record<string, boolean> }[],
): MailMailboxRestore[] {
  const seen = new Set<string>();
  const restores: MailMailboxRestore[] = [];
  for (const message of messages) {
    if (seen.has(message.id)) continue;
    const mailboxIds = Object.fromEntries(
      Object.entries(message.mailboxIds ?? {}).filter(([, member]) => member),
    );
    if (Object.keys(mailboxIds).length === 0) continue;
    seen.add(message.id);
    restores.push({ id: message.id, mailboxIds });
  }
  return restores;
}

/** Destroys a mailbox's messages page by page; stops when a batch makes no progress so a refusing server cannot loop forever. */
export async function destroyMailboxMessagesInBatches(input: {
  listIds: (limit: number) => Promise<string[]>;
  destroy: (ids: string[]) => Promise<void>;
  batchSize?: number;
}): Promise<number> {
  const batchSize = input.batchSize ?? EMPTY_MAILBOX_BATCH_SIZE;
  let destroyed = 0;
  let previousBatchKey: string | null = null;

  while (true) {
    const ids = await input.listIds(batchSize);
    if (ids.length === 0) break;
    const batchKey = ids.join("\n");
    if (batchKey === previousBatchKey) break;
    previousBatchKey = batchKey;
    await input.destroy(ids);
    destroyed += ids.length;
    if (ids.length < batchSize) break;
  }

  return destroyed;
}
