import {
  getEmailDomain,
  normalizeEmailAddress,
  buildOutgoingMimeMessage,
  resolveEncryptionInternalDomain,
  shouldEncryptOutgoingMail,
  type MailServerPolicy,
  type OutgoingMimeAttachment,
} from "@workspace/calendar-core";
import { type Attachment as ParsedMailAttachment } from "postal-mime";
import { createLogger } from "@workspace/logger";
import { mailDemoApiService } from "@/lib/mail/api-service";
import {
  generateVaultSecret,
  VAULT_WRAP_ALGORITHM,
  wrapVaultSecret,
} from "@/lib/mail/vault-secret";
import { StalwartJmapClient, type JmapAttachmentInput } from "@/lib/mail/jmap-client";
import { mergeMailMessage, mergeMailMessagePreservingKeywords } from "@/lib/mail/mail-message-body";
import { createEncryptedMailVault } from "@/lib/mail/vault-crypto";
import { putStoredMailVault } from "@/lib/mail/vault-storage";
import { mailCryptoWorkerClient } from "@/lib/mail/worker-client";
import type {
  JmapEmailMessage,
  JmapIdentity,
  JmapMailbox,
  JmapSession,
  MailAttachment,
  MailDecryptResult,
  MailSignatureVerificationState,
  MailSyncResponse,
  MailVaultKdfParams,
  UserKeyVault,
} from "@/lib/mail/types";

const log = createLogger("mail-app");

/** Reduced argon2id work factor: the passphrase is server-derived key material with 256 bits of entropy. */
const KEY_MATERIAL_KDF: Partial<MailVaultKdfParams> = {
  memoryKiB: 8192,
  iterations: 1,
  parallelism: 1,
};

export type ActiveMailboxState = {
  client: StalwartJmapClient;
  session: JmapSession;
  mailboxes: JmapMailbox[];
  identities: JmapIdentity[];
  pickerIdentities: JmapIdentity[];
  messages: JmapEmailMessage[];
  unlockedVault: UserKeyVault;
  accountEncryptedAtRest: boolean;
  email: string;
  selectedMailboxId: string | null;
  mailServerPolicy: MailServerPolicy;
};

export type MailAttachmentPreviewState = {
  name: string;
  type: string;
} & (
    | {
      kind: "image" | "pdf";
      url: string;
    }
    | {
      kind: "text";
      text: string;
    }
  );

export type MailAttachmentHoverPreview = (
  | {
    kind: "image" | "pdf";
    url: string;
  }
  | {
    kind: "text";
    text: string;
  }
) & {
  type: string;
};

export type MailReplyContext = {
  threadId?: string | null;
  inReplyTo?: string[];
  references?: string[];
};

export function resolveSignatureVerificationState(
  decrypted: Partial<
    Pick<
      MailDecryptResult,
      "hasVerifiedSignature" | "signatureVerificationState"
    >
  >,
): MailSignatureVerificationState {
  if (decrypted.signatureVerificationState) {
    return decrypted.signatureVerificationState;
  }

  return decrypted.hasVerifiedSignature ? "verified" : "not_signed";
}

export function getPrimaryMailboxId(
  mailboxes: JmapMailbox[],
  role: string,
): string | null {
  return mailboxes.find((m) => m.role === role)?.id ?? mailboxes[0]?.id ?? null;
}

export function messageBelongsToMailbox(
  message: JmapEmailMessage,
  mailboxId: string | null | undefined,
): boolean {
  return Boolean(mailboxId && message.mailboxIds?.[mailboxId]);
}

export function sortMessages(messages: JmapEmailMessage[]): JmapEmailMessage[] {
  return Array.from(messages).sort((left, right) => {
    const leftTime = left.receivedAt ? Date.parse(left.receivedAt) : 0;
    const rightTime = right.receivedAt ? Date.parse(right.receivedAt) : 0;
    return rightTime - leftTime;
  });
}

function getAttachmentSize(content: MailAttachment["content"]): number | null {
  if (content == null) return null;
  if (typeof content === "string") {
    return new TextEncoder().encode(content).byteLength;
  }
  if (content instanceof ArrayBuffer) {
    return content.byteLength;
  }
  if (ArrayBuffer.isView(content)) {
    return content.byteLength;
  }
  return null;
}

function toAttachmentBlobPart(content: MailAttachment["content"]): BlobPart {
  if (typeof content === "string" || content instanceof ArrayBuffer) {
    return content;
  }
  if (ArrayBuffer.isView(content)) {
    const copy = new Uint8Array(content.byteLength);
    copy.set(
      new Uint8Array(content.buffer, content.byteOffset, content.byteLength),
    );
    return copy.buffer;
  }
  throw new Error("Attachment content is unavailable.");
}

export function toParsedMailAttachment(
  attachment: ParsedMailAttachment,
): MailAttachment {
  return {
    name: attachment.filename ?? "Attachment",
    type: attachment.mimeType || "application/octet-stream",
    size: getAttachmentSize(attachment.content),
    content: attachment.content,
  };
}

export async function resolveAttachmentBlob(input: {
  attachment: MailAttachment;
  activeMailbox: ActiveMailboxState | null;
}): Promise<{ blob: Blob; filename: string }> {
  const filename = input.attachment.name?.trim() || "attachment";
  const contentType = input.attachment.type ?? "application/octet-stream";

  if (input.attachment.blobId) {
    if (!input.activeMailbox) {
      throw new Error("Mailbox connection is not ready.");
    }
    const blob = await input.activeMailbox.client.downloadBlob(
      input.activeMailbox.session,
      input.attachment.blobId,
      filename,
      contentType,
    );
    return { blob, filename };
  }

  if (input.attachment.content != null) {
    return {
      blob: new Blob([toAttachmentBlobPart(input.attachment.content)], {
        type: contentType,
      }),
      filename,
    };
  }

  throw new Error("Attachment content is unavailable.");
}

export function buildAttachmentPreviewCacheKey(attachment: MailAttachment): string {
  return [
    attachment.blobId ?? "",
    attachment.name?.trim() ?? "",
    attachment.type ?? "",
    attachment.size ?? "",
  ].join("::");
}

export function buildReplyContext(
  message: Pick<JmapEmailMessage, "threadId" | "messageId" | "references">,
): MailReplyContext {
  const messageIds = (message.messageId ?? []).filter(Boolean);
  const references = Array.from(
    new Set([...(message.references ?? []).filter(Boolean), ...messageIds]),
  );

  return {
    threadId: message.threadId ?? null,
    inReplyTo: messageIds.length > 0 ? messageIds : undefined,
    references: references.length > 0 ? references : undefined,
  };
}

export function createOptimisticReplyMessage(input: {
  fromEmail: string;
  to: string[];
  subject: string;
  textBody: string;
  sentMailboxId?: string | null;
  threadId?: string | null;
  inReplyTo?: string[];
  references?: string[];
  attachments?: JmapAttachmentInput[];
}): JmapEmailMessage {
  const optimisticId = `sent-local-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  return {
    id: optimisticId,
    threadId: input.threadId ?? undefined,
    inReplyTo: input.inReplyTo,
    references: input.references,
    mailboxIds: input.sentMailboxId
      ? { [input.sentMailboxId]: true }
      : undefined,
    from: [{ email: input.fromEmail }],
    to: input.to.map((email) => ({ email })),
    subject: input.subject,
    receivedAt: new Date().toISOString(),
    keywords: { $seen: true },
    textBody: [{ partId: "text" }],
    bodyValues: {
      text: {
        value: input.textBody,
      },
    },
    attachments: input.attachments?.map((attachment) => ({
      blobId: attachment.blobId,
      name: attachment.name,
      type: attachment.type,
      size: attachment.size,
    })),
  };
}

export async function buildTextAttachmentPreview(
  blob: Blob,
  type: string,
): Promise<MailAttachmentHoverPreview> {
  const text = (await blob.text()).slice(0, 5000);
  return {
    kind: "text",
    text,
    type,
  };
}

export async function resolveOutgoingMessageBody(input: {
  activeMailbox: ActiveMailboxState;
  recipients: string[];
  plaintext: string;
  html?: string;
  internalDomain: string | null;
  mimeAttachments?: OutgoingMimeAttachment[];
}): Promise<{
  textBody: string;
  encrypted: boolean;
  pgpMimeCiphertext?: { blobId: string; size: number };
}> {
  const internalDomain = resolveEncryptionInternalDomain(input.internalDomain);
  if (!shouldEncryptOutgoingMail(input.recipients, internalDomain)) {
    return {
      textBody: input.plaintext,
      encrypted: false,
    };
  }

  const internalRecipients = input.recipients.filter(
    (recipient) => getEmailDomain(recipient) === internalDomain,
  );

  const senderEmail = normalizeEmailAddress(input.activeMailbox.email);
  const recipientPublicKeysArmored = new Set<string>([
    input.activeMailbox.unlockedVault.publicKeyArmored,
  ]);

  for (const recipient of internalRecipients) {
    if (recipient === senderEmail) {
      recipientPublicKeysArmored.add(
        input.activeMailbox.unlockedVault.publicKeyArmored,
      );
      continue;
    }

    const recipientKey = await mailDemoApiService.getRecipientKey(recipient);
    recipientPublicKeysArmored.add(recipientKey.publicKeyArmored);
  }

  const shouldUseMime =
    Boolean(input.html?.trim()) || (input.mimeAttachments?.length ?? 0) > 0;
  const encryptPayload = shouldUseMime
    ? buildOutgoingMimeMessage({
      text: input.plaintext,
      html: input.html,
      attachments: input.mimeAttachments,
    })
    : input.plaintext;

  const { armoredMessage } = await mailCryptoWorkerClient.encryptForRecipients({
    plaintext: encryptPayload,
    recipientPublicKeysArmored: [...recipientPublicKeysArmored],
  });

  if ((input.mimeAttachments?.length ?? 0) > 0) {
    const uploaded = await input.activeMailbox.client.uploadTextBlob(
      input.activeMailbox.session,
      armoredMessage,
      "text/plain",
    );
    return {
      textBody: "",
      encrypted: true,
      pgpMimeCiphertext: {
        blobId: uploaded.blobId,
        size: uploaded.size,
      },
    };
  }

  return {
    textBody: armoredMessage,
    encrypted: true,
  };
}

/**
 * Re-encrypt the vault (AES-GCM wrapper and inner PGP private key) under a new
 * passphrase, sealing it to the user's E2EE key when one is supplied.
 */
async function rekeyVault(input: {
  unlockedVault: UserKeyVault;
  oldPassphrase: string;
  newPassphrase: string;
  email: string;
  vaultVersion: number;
  wrappedSecret?: string | null;
}): Promise<void> {
  try {
    const { privateKeyArmored } =
      await mailCryptoWorkerClient.reEncryptPrivateKey({
        privateKeyArmored: input.unlockedVault.encryptedPrivateKeyArmored,
        oldPassphrase: input.oldPassphrase,
        newPassphrase: input.newPassphrase,
      });
    const migratedVault: UserKeyVault = {
      ...input.unlockedVault,
      encryptedPrivateKeyArmored: privateKeyArmored,
    };
    const encrypted = await createEncryptedMailVault(
      migratedVault,
      input.newPassphrase,
      KEY_MATERIAL_KDF,
    );
    await putStoredMailVault({
      email: input.email,
      vaultVersion: input.vaultVersion,
      encryptedVaultB64: encrypted.encryptedVaultB64,
      kdf: encrypted.kdf,
      kdfParams: encrypted.kdfParams,
    });
    await mailDemoApiService.upsertAccountVaultBackup({
      vaultVersion: input.vaultVersion,
      encryptedVaultB64: encrypted.encryptedVaultB64,
      kdf: encrypted.kdf,
      kdfParams: encrypted.kdfParams,
      ...(input.wrappedSecret
        ? {
            wrappedSecret: input.wrappedSecret,
            wrapAlgorithm: VAULT_WRAP_ALGORITHM,
          }
        : {}),
    });
  } catch (err) {
    log.error("Vault re-key failed.", err);
  }
}

/**
 * Move a legacy vault off the server-derived passphrase onto a random secret
 * sealed to the user's E2EE key, so the server can no longer open it.
 */
export async function sealVaultToAccountKey(input: {
  unlockedVault: UserKeyVault;
  currentPassphrase: string;
  email: string;
  vaultVersion: number;
}): Promise<void> {
  try {
    const secret = generateVaultSecret();
    const wrappedSecret = await wrapVaultSecret(secret);
    if (!wrappedSecret) {
      // No E2EE session on this device yet; the next open retries.
      return;
    }

    await rekeyVault({
      unlockedVault: input.unlockedVault,
      oldPassphrase: input.currentPassphrase,
      newPassphrase: secret,
      email: input.email,
      vaultVersion: input.vaultVersion,
      wrappedSecret,
    });
  } catch (error) {
    log.warn("Sealing the mail vault to the account key failed", { error });
  }
}

export function mergeMailboxes(
  currentMailboxes: JmapMailbox[],
  sync: MailSyncResponse["mailbox"],
): JmapMailbox[] {
  if (sync.records.length === 0 && sync.destroyed.length === 0) {
    return currentMailboxes;
  }

  const destroyedIds = new Set(sync.destroyed);
  const byId = new Map<string, JmapMailbox>();

  for (const mailbox of currentMailboxes) {
    if (!destroyedIds.has(mailbox.id)) {
      byId.set(mailbox.id, mailbox);
    }
  }

  for (const mailbox of sync.records) {
    byId.set(mailbox.id, mailbox);
  }

  return Array.from(byId.values()).sort((left, right) => {
    const leftOrder = left.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.sortOrder ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder;
  });
}

export function mergeMessagesForMailbox(
  currentMessages: JmapEmailMessage[],
  mailboxId: string,
  sync: MailSyncResponse["email"],
): JmapEmailMessage[] {
  if (sync.records.length === 0 && sync.destroyed.length === 0) {
    return currentMessages;
  }

  const destroyedIds = new Set(sync.destroyed);
  const nextMessages = new Map<string, JmapEmailMessage>();

  for (const message of currentMessages) {
    if (!destroyedIds.has(message.id)) {
      nextMessages.set(message.id, message);
    }
  }

  for (const message of sync.records) {
    if (message.mailboxIds?.[mailboxId]) {
      const existing = nextMessages.get(message.id);
      nextMessages.set(
        message.id,
        existing ? mergeMailMessage(existing, message) : message,
      );
    } else {
      nextMessages.delete(message.id);
    }
  }

  return sortMessages([...nextMessages.values()]);
}

function sortMessagesByReceivedAt(
  messages: JmapEmailMessage[],
): JmapEmailMessage[] {
  return Array.from(messages).sort((left, right) => {
    const leftTime = left.receivedAt ? Date.parse(left.receivedAt) : 0;
    const rightTime = right.receivedAt ? Date.parse(right.receivedAt) : 0;
    return leftTime - rightTime;
  });
}

export function mergeConversationSourceMessages(
  ...messageSets: JmapEmailMessage[][]
): JmapEmailMessage[] {
  const byId = new Map<string, JmapEmailMessage>();

  for (const messageSet of messageSets) {
    for (const message of messageSet) {
      const existing = byId.get(message.id);
      byId.set(
        message.id,
        // Keep keywords from the first copy so later thread fetches don't
        // wipe optimistic $seen / $flagged on the mailbox list row.
        existing
          ? mergeMailMessagePreservingKeywords(existing, message)
          : message,
      );
    }
  }

  return sortMessagesByReceivedAt([...byId.values()]);
}

export function withMessageKeywords(
  message: JmapEmailMessage,
  update: (keywords: Record<string, boolean>) => Record<string, boolean>,
): JmapEmailMessage {
  return {
    ...message,
    keywords: update({ ...(message.keywords ?? {}) }),
  };
}

export function patchMessagesKeywords(
  messages: JmapEmailMessage[],
  messageId: string,
  update: (keywords: Record<string, boolean>) => Record<string, boolean>,
): JmapEmailMessage[] {
  return messages.map((entry) =>
    entry.id === messageId ? withMessageKeywords(entry, update) : entry,
  );
}

export function resolveConversationReplyRecipients(input: {
  messages: JmapEmailMessage[];
  currentUserEmail: string;
}): string[] {
  const currentUser = normalizeEmailAddress(input.currentUserEmail);
  const seen = new Set<string>();
  const recipients: string[] = [];

  for (const message of input.messages) {
    const addresses = [...(message.from ?? []), ...(message.to ?? []), ...(message.cc ?? [])];
    for (const entry of addresses) {
      const email = entry.email?.trim();
      if (!email) continue;
      const normalized = normalizeEmailAddress(email);
      if (normalized === currentUser || seen.has(normalized)) continue;
      seen.add(normalized);
      recipients.push(normalized);
    }
  }

  return recipients;
}

export function messagesLikelyMatch(
  left: JmapEmailMessage,
  right: JmapEmailMessage,
): boolean {
  const leftFrom = left.from?.[0]?.email ?? "";
  const rightFrom = right.from?.[0]?.email ?? "";
  const leftTo = (left.to ?? []).map((entry) => entry.email).join(",");
  const rightTo = (right.to ?? []).map((entry) => entry.email).join(",");

  // Must share sender, recipients, and subject
  if (
    leftFrom !== rightFrom ||
    leftTo !== rightTo ||
    (left.subject ?? "") !== (right.subject ?? "")
  ) {
    return false;
  }

  // If both have a threadId they must be in the same thread
  if (left.threadId && right.threadId && left.threadId !== right.threadId) {
    return false;
  }

  // Messages must be within 5 minutes of each other (handles clock drift
  // between the optimistic Date.now() timestamp and server receipt time)
  if (left.receivedAt && right.receivedAt) {
    const diff = Math.abs(
      new Date(left.receivedAt).getTime() -
      new Date(right.receivedAt).getTime(),
    );
    if (diff > 5 * 60 * 1000) return false;
  }

  // Compare a normalised prefix of the text body (if both have one).
  // Normalise CRLF→LF because the server follows RFC 2822 CRLF but the
  // optimistic message is built from a JS template literal using \n.
  const leftText = (left.bodyValues?.text?.value ?? "")
    .replace(/\r\n/g, "\n")
    .slice(0, 200)
    .trim();
  const rightText = (right.bodyValues?.text?.value ?? "")
    .replace(/\r\n/g, "\n")
    .slice(0, 200)
    .trim();
  if (leftText && rightText && leftText !== rightText) return false;

  return true;
}
