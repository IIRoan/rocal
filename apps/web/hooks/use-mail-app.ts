"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getErrorMessage, getEmailDomain, normalizeEmailAddress, parsedAddressesToEmails, capIdentitiesForPicker, resolveMailServerPolicy, resolveReplyRecipients, validateComposeRecipients, buildOutgoingMimeMessage, prepareOutgoingAttachments, validateUploadedAttachmentSet, validateMailboxCreate, validateMailboxName, resolveMailboxMessagesPageSize, isCurrentUserMailAddress, resolveEncryptionInternalDomain, shouldEncryptOutgoingMail, type MailServerPolicy, type OutgoingMimeAttachment } from "@workspace/calendar-core";
import { toast } from "sonner";
import PostalMime, {
  type Attachment as ParsedMailAttachment,
} from "postal-mime";
import { createLogger } from "@workspace/logger";
import { useSession, signOut } from "@/lib/auth-client";
import { completeAuthNavigation } from "@/lib/auth-navigation";
import { useSmoothRouter } from "@/hooks/use-smooth-router";
import { useMailRealtime } from "@/hooks/use-mail-realtime";
import { useRecentContacts } from "@/hooks/use-recent-contacts";
import { peekCachedAuthPassword } from "@/lib/e2ee-password-cache";
import {
  clearEncPasswordCookie,
  initEncPasswordFromCookie,
} from "@/lib/enc-password-cookie";
import { bootstrapMailboxForAccount } from "@/lib/mail/account-bootstrap";
import { mailDemoApiService } from "@/lib/mail/api-service";
import { createMailOAuthTokenManager } from "@/lib/mail/oauth-client";
import {
  getPrimaryMailAccountId,
  StalwartJmapClient,
  type JmapAttachmentInput,
} from "@/lib/mail/jmap-client";
import { getConversationForMessage } from "@/lib/mail/conversation-thread";
import {
  fetchMailMessageById,
  findCachedMailMessage,
  mergeMessageIntoMailboxCaches,
  prefetchMailMessageBodies,
  seedMailMessageCache,
} from "@/lib/mail/mail-message-query";
import {
  mergeMailMessage,
  messageHasLoadedBody,
} from "@/lib/mail/mail-message-body";
import {
  findInboxMailbox,
  findSpamMailbox,
  isSpamMailboxRole,
  isTrashMailboxRole,
} from "@/lib/mail/mail-mailbox-roles";
import { mailQueryKeys } from "@/lib/mail/mail-query-keys";
import { getMailComposeBridge, flushComposeDraftSave } from "@/components/mail/mail-compose-context";
import { parseDecryptedMailContent } from "@/lib/mail/decrypted-mail-content";
import {
  hasComposeHtmlBody,
  resolveOutgoingComposeBodies,
} from "@/lib/mail/signature-utils";
import { mergeRefreshedMailboxMessages } from "@/lib/mail/mail-list-merge";
import {
  readMailListSettings,
  MARK_AS_READ_DELAY_MS,
} from "@/lib/mail/mail-list-settings";
import {
  rewriteCidImagesForEditor,
  rewriteComposeInlineImages,
  sanitizeQuotedEmailHtml,
  plainTextToComposerBody,
  htmlHasUnhydratedInlinePlaceholders,
} from "@/lib/mail/compose-editor-utils";
import {
  getComposeInlineImages,
  registerComposeInlineImage,
  waitForQuotedInlineImageHydration,
} from "@/lib/mail/compose-inline-images";
import type { InlineImageUpload } from "@/components/mail/rich-text-editor";
import { readMailComposeSettings } from "@/lib/mail/compose-settings";
import {
  appendMailboxMessages,
  hasMoreMailboxMessages,
  MAILBOX_MESSAGES_PAGE_SIZE,
} from "@/lib/mail/mail-pagination";
import {
  classifyMessageEncryption,
  extractMessageBodies,
  extractPgpMimeCiphertextBlobId,
  resolveInlinePgpArmoredCiphertext,
} from "@/lib/mail/message-security";
import { listCalendarAttachmentCandidates } from "@/lib/mail/calendar-invite";
import {
  resolveAttachmentPreviewKind,
  type MailAttachmentPreviewKind,
} from "@/lib/mail/attachment-preview";
import {
  unlockEncryptedMailVault,
  createEncryptedMailVault,
} from "@/lib/mail/vault-crypto";
import {
  getStoredMailVault,
  putStoredMailVault,
} from "@/lib/mail/vault-storage";
import { mailCryptoWorkerClient } from "@/lib/mail/worker-client";
import type {
  JmapAttachment,
  JmapEmailMessage,
  JmapIdentity,
  JmapMailbox,
  JmapSession,
  LabelDef,
  MailAccountStatus,
  MailAttachment,
  MailDecryptResult,
  MailDemoConfig,
  MailSignatureVerificationState,
  MailSyncResponse,
  MailVaultBackupRecord,
  MailVaultKdfParams,
  UserKeyVault,
} from "@/lib/mail/types";

const log = createLogger("mail-app");

// Reduced KDF params for high-entropy passphrases (server-derived HMAC key material).
// argon2id work factor is irrelevant when the passphrase already has 256 bits of entropy.
const KEY_MATERIAL_KDF: Partial<MailVaultKdfParams> = {
  memoryKiB: 8192,
  iterations: 1,
  parallelism: 1,
};
const MAILBOX_REAUTH_REQUIRED_MESSAGE =
  "This mailbox still needs a one-time password migration. Sign out and sign back in with your email password once to finish automatic unlocking.";

const PROTECTED_ROLES = new Set([
  "inbox",
  "sent",
  "drafts",
  "trash",
  "junk",
  "spam",
]);

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

type MailAttachmentPreviewState = {
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

type MailAttachmentHoverPreview = (
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

type MailReplyContext = {
  threadId?: string | null;
  inReplyTo?: string[];
  references?: string[];
};

function resolveSignatureVerificationState(
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

function getPrimaryMailboxId(
  mailboxes: JmapMailbox[],
  role: string,
): string | null {
  return mailboxes.find((m) => m.role === role)?.id ?? mailboxes[0]?.id ?? null;
}

function sortMessages(messages: JmapEmailMessage[]): JmapEmailMessage[] {
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

function toParsedMailAttachment(
  attachment: ParsedMailAttachment,
): MailAttachment {
  return {
    name: attachment.filename ?? "Attachment",
    type: attachment.mimeType || "application/octet-stream",
    size: getAttachmentSize(attachment.content),
    content: attachment.content,
  };
}

async function resolveAttachmentBlob(input: {
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

function buildAttachmentPreviewCacheKey(attachment: MailAttachment): string {
  return [
    attachment.blobId ?? "",
    attachment.name?.trim() ?? "",
    attachment.type ?? "",
    attachment.size ?? "",
  ].join("::");
}

function buildReplyContext(
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

function createOptimisticReplyMessage(input: {
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

async function buildTextAttachmentPreview(
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

async function resolveOutgoingMessageBody(input: {
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
 * Background migration: re-encrypt the vault (both the AES-GCM wrapper and
 * the inner PGP private key) using the server-derived key material so future
 * sign-ins are fully automatic.
 */
async function migrateVaultToKeyMaterial(input: {
  unlockedVault: UserKeyVault;
  oldPassphrase: string;
  newPassphrase: string;
  email: string;
  vaultVersion: number;
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
    });
  } catch (err) {
    log.error("Background vault migration to server key material failed.", err);
  }
}

function mergeMailboxes(
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

function mergeMessagesForMailbox(
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

function mergeConversationSourceMessages(
  ...messageSets: JmapEmailMessage[][]
): JmapEmailMessage[] {
  const byId = new Map<string, JmapEmailMessage>();

  for (const messageSet of messageSets) {
    for (const message of messageSet) {
      byId.set(message.id, message);
    }
  }

  return sortMessagesByReceivedAt([...byId.values()]);
}

function resolveConversationReplyRecipients(input: {
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

function messagesLikelyMatch(
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

export function useMailApp() {
  const { data: session, isPending: isSessionPending } = useSession();
  const router = useSmoothRouter();
  const queryClient = useQueryClient();
  const { recordUsage } = useRecentContacts();

  const [isBusy, setIsBusy] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [totalMessages, setTotalMessages] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loginPassword, setLoginPassword] = useState("");
  const [activeMailbox, setActiveMailbox] = useState<ActiveMailboxState | null>(
    null,
  );
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(
    null,
  );
  const [selectedConversationMessageId, setSelectedConversationMessageId] =
    useState<string | null>(null);
  const [relatedConversationMessages, setRelatedConversationMessages] =
    useState<JmapEmailMessage[]>([]);
  const [listThreadRelatedMessages, setListThreadRelatedMessages] =
    useState<JmapEmailMessage[]>([]);
  const threadPrefetchedMailboxRef = useRef<string | null>(null);
  const [optimisticConversationMessages, setOptimisticConversationMessages] =
    useState<JmapEmailMessage[]>([]);
  const [isConversationLoading, setIsConversationLoading] = useState(false);
  const [isMessageBodyLoading, setIsMessageBodyLoading] = useState(false);
  const [selectedMessagePlaintext, setSelectedMessagePlaintext] = useState<
    string | null
  >(null);
  const [
    selectedMessageSignatureVerificationState,
    setSelectedMessageSignatureVerificationState,
  ] = useState<MailSignatureVerificationState>("not_signed");
  const [selectedMessageDecryptError, setSelectedMessageDecryptError] =
    useState<string | null>(null);
  const [selectedMessageIsDecrypting, setSelectedMessageIsDecrypting] =
    useState(false);
  const [selectedMessageDecryptedHtml, setSelectedMessageDecryptedHtml] =
    useState<string | null>(null);
  const [
    selectedMessageDecryptedAttachments,
    setSelectedMessageDecryptedAttachments,
  ] = useState<MailAttachment[] | null>(null);
  const [attachmentPreview, setAttachmentPreview] =
    useState<MailAttachmentPreviewState | null>(null);
  const attachmentPreviewUrlRef = useRef<string | null>(null);
  const attachmentHoverPreviewCacheRef = useRef<
    Map<string, MailAttachmentHoverPreview>
  >(new Map());
  const attachmentHoverPreviewUrlsRef = useRef<Set<string>>(new Set());
  const activeMailboxRef = useRef<ActiveMailboxState | null>(null);
  /** Message the user explicitly marked unread while it remains open. */
  const manualUnreadWhileOpenRef = useRef<string | null>(null);
  /** Bumped to cancel pending/in-flight auto-read for a message. */
  const autoReadNonceRef = useRef<Map<string, number>>(new Map());
  const bumpAutoReadNonce = useCallback((messageId: string) => {
    const next = (autoReadNonceRef.current.get(messageId) ?? 0) + 1;
    autoReadNonceRef.current.set(messageId, next);
    return next;
  }, []);
  const hasAttemptedAutoOpenRef = useRef(false);
  const recordedContactMessageRef = useRef<string | null>(null);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [cachedAuthPassword, setCachedAuthPassword] = useState<string | null>(
    () => (typeof window !== "undefined" ? peekCachedAuthPassword() : null),
  );
  const accountEmail = session?.user?.email?.trim().toLowerCase() ?? "";
  const accountDisplayName = session?.user?.name?.trim() ?? "";
  const accountUserId = session?.user?.id?.trim() ?? "";

  const { data: config = null, error: configError } = useQuery({
    queryKey: mailQueryKeys.config(),
    queryFn: () => mailDemoApiService.getConfig(),
    staleTime: 10 * 60 * 1000,
  });

  const accountStatusEnabled = Boolean(accountEmail && accountUserId);
  const {
    data: mailboxStatus = null,
    isLoading: isMailboxStatusLoadingQuery,
    error: mailboxStatusError,
  } = useQuery({
    queryKey: mailQueryKeys.accountStatus(accountUserId || "anon"),
    queryFn: () => mailDemoApiService.getAccountStatus(),
    enabled: accountStatusEnabled,
    staleTime: 60 * 1000,
  });
  const isMailboxStatusLoading =
    isMailboxStatusLoadingQuery && accountStatusEnabled;

  const mailboxEmail = mailboxStatus?.email ?? accountEmail;

  useEffect(() => {
    activeMailboxRef.current = activeMailbox;
  }, [activeMailbox]);

  // Init password from encrypted cookie (cross-tab / post-refresh)
  useEffect(() => {
    void initEncPasswordFromCookie().then(() => {
      const pw = peekCachedAuthPassword();
      if (pw) setCachedAuthPassword(pw);
    });
  }, []);

  // Auth redirect
  useEffect(() => {
    if (!isSessionPending && !session?.user) {
      const currentPath =
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}`
          : "/mail";
      router.startRouteTransition({
        messageContext: "AUTH_FLOW",
      });
      completeAuthNavigation(`/login?next=${encodeURIComponent(currentPath)}`);
    }
  }, [isSessionPending, session?.user, router]);

  // ⌘K shortcut
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (configError) {
      log.error("Failed to load mail config", configError);
      toast.error("Could not load the mail configuration.");
    }
  }, [configError]);

  useEffect(() => {
    if (mailboxStatusError) {
      log.error("Failed to load mailbox status", mailboxStatusError);
      toast.error(
        mailboxStatusError instanceof Error
          ? mailboxStatusError.message
          : "Could not load mailbox status.",
      );
    }
  }, [mailboxStatusError]);

  useEffect(() => {
    if (!accountStatusEnabled) {
      queueMicrotask(() => setActiveMailbox(null));
    }
  }, [accountStatusEnabled]);

  useEffect(() => {
    hasAttemptedAutoOpenRef.current = false;
  }, [accountUserId, mailboxStatus?.provisioned]);

  useEffect(() => {
    if (cachedAuthPassword && !activeMailbox && !loginPassword) {
      hasAttemptedAutoOpenRef.current = false;
    }
  }, [activeMailbox, cachedAuthPassword, loginPassword]);

  // Decrypt selected message
  const selectedMailboxMessage = useMemo(() => {
    if (!selectedMessageId) {
      return null;
    }

    return (
      activeMailbox?.messages.find((m) => m.id === selectedMessageId) ??
      listThreadRelatedMessages.find((m) => m.id === selectedMessageId) ??
      findCachedMailMessage(queryClient, selectedMessageId) ??
      null
    );
  }, [
    activeMailbox?.messages,
    listThreadRelatedMessages,
    queryClient,
    selectedMessageId,
  ]);
  const conversationSourceMessages = useMemo(() => {
    const serverMessages = mergeConversationSourceMessages(
      activeMailbox?.messages ?? [],
      relatedConversationMessages,
    );
    const unmatchedOptimisticMessages = optimisticConversationMessages.filter(
      (optimisticMessage) =>
        !serverMessages.some((serverMessage) =>
          messagesLikelyMatch(serverMessage, optimisticMessage),
        ),
    );
    return mergeConversationSourceMessages(
      serverMessages,
      unmatchedOptimisticMessages,
    );
  }, [
    activeMailbox?.messages,
    relatedConversationMessages,
    optimisticConversationMessages,
  ]);
  const selectedConversationMessages = useMemo(() => {
    const anchorMessageId = selectedConversationMessageId ?? selectedMessageId;
    const conversation = getConversationForMessage(
      conversationSourceMessages,
      anchorMessageId,
    );
    if (conversation.length > 0) {
      return conversation;
    }
    return selectedMailboxMessage ? [selectedMailboxMessage] : [];
  }, [
    conversationSourceMessages,
    selectedConversationMessageId,
    selectedMailboxMessage,
    selectedMessageId,
  ]);
  const selectedConversationMessage =
    selectedConversationMessages.find(
      (message) => message.id === selectedConversationMessageId,
    ) ?? null;
  const selectedMessage =
    selectedConversationMessage ?? selectedMailboxMessage ?? null;
  const selectedMessageBodyLoaded = selectedMessage
    ? messageHasLoadedBody(selectedMessage)
    : false;

  useEffect(() => {
    const mailbox = activeMailboxRef.current;
    const sender = selectedMessage?.from?.[0];
    if (!mailbox || !selectedMessage || !sender?.email) {
      return;
    }
    if (isCurrentUserMailAddress(sender.email, mailbox.email)) {
      return;
    }

    const recordKey = `${selectedMessage.id}:${sender.email}`;
    if (recordedContactMessageRef.current === recordKey) {
      return;
    }
    recordedContactMessageRef.current = recordKey;
    recordUsage(
      [{ email: sender.email, displayName: sender.name }],
      "mail",
    );
  }, [recordUsage, selectedMessage]);

  const handleSelectMessageId = useCallback((messageId: string | null) => {
    setSelectedMessageId(messageId);
    setSelectedConversationMessageId(null);
  }, []);

  const openMessageById = useCallback(async (
    messageId: string,
    hint?: JmapEmailMessage,
  ) => {
    const mb = activeMailboxRef.current;
    if (!mb) return;

    if (mb.messages.some((message) => message.id === messageId)) {
      handleSelectMessageId(messageId);
      return;
    }

    const cached =
      hint ??
      findCachedMailMessage(queryClient, messageId) ??
      mb.messages.find((message) => message.id === messageId);
    if (cached) {
      setActiveMailbox((current) =>
        current
          ? {
              ...current,
              messages: sortMessages(
                mergeConversationSourceMessages(current.messages, [cached]),
              ),
            }
          : current,
      );
      handleSelectMessageId(cached.id);
      return;
    }

    try {
      const message = await fetchMailMessageById(queryClient, {
        client: mb.client,
        session: mb.session,
        messageId,
      });

      mergeMessageIntoMailboxCaches(queryClient, message);
      setActiveMailbox((current) =>
        current
          ? {
              ...current,
              messages: sortMessages(
                mergeConversationSourceMessages(current.messages, [message]),
              ),
            }
          : current,
      );
      handleSelectMessageId(message.id);
    } catch (error) {
      log.error("Failed to open message by id", error);
      toast.error(getErrorMessage(error, "Could not open that message."));
    }
  }, [handleSelectMessageId, queryClient]);

  const handleSelectConversationMessageId = useCallback((messageId: string) => {
    setSelectedConversationMessageId(messageId);
  }, []);

  const appendConversationMessage = useCallback((message: JmapEmailMessage) => {
    setOptimisticConversationMessages((current) =>
      mergeConversationSourceMessages(current, [message]),
    );
  }, []);

  const loadConversationThread = useCallback(async (threadId: string) => {
    const mb = activeMailboxRef.current;
    if (!mb) {
      setRelatedConversationMessages([]);
      setIsConversationLoading(false);
      return;
    }

    setIsConversationLoading(true);
    try {
      const messages = await mb.client.getThreadMessages(mb.session, threadId);
      setRelatedConversationMessages(messages);
    } catch (error) {
      log.warn("Failed to load thread messages", error);
      setRelatedConversationMessages([]);
    } finally {
      setIsConversationLoading(false);
    }
  }, []);

  const clearConversationThread = useCallback(() => {
    setRelatedConversationMessages([]);
    setIsConversationLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setSelectedConversationMessageId(null);
      setOptimisticConversationMessages([]);
      setRelatedConversationMessages([]);
      setIsConversationLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedMessageId]);

  useEffect(() => {
    if (
      selectedConversationMessageId &&
      !selectedConversationMessages.some(
        (message) => message.id === selectedConversationMessageId,
      )
    ) {
      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) {
          setSelectedConversationMessageId(null);
        }
      });
      return () => {
        cancelled = true;
      };
    }
  }, [selectedConversationMessageId, selectedConversationMessages]);

  useEffect(() => {
    if (!selectedMessageId || !activeMailboxRef.current) {
      clearConversationThread();
      return;
    }

    // Use the ref so keyword/flag updates to activeMailbox don't re-trigger
    // a full thread re-fetch (threadId never changes for a given message).
    const selectedMsg =
      activeMailboxRef.current.messages.find(
        (m) => m.id === selectedMessageId,
      ) ?? findCachedMailMessage(queryClient, selectedMessageId);
    const threadId = selectedMsg?.threadId;

    if (threadId) {
      void loadConversationThread(threadId);
    } else {
      clearConversationThread();
    }
  }, [selectedMessageId, loadConversationThread, clearConversationThread, queryClient]);

  const applyLoadedMessage = useCallback(
    (message: JmapEmailMessage) => {
      mergeMessageIntoMailboxCaches(queryClient, message);
      setActiveMailbox((current) => {
        if (!current) {
          return current;
        }

        const exists = current.messages.some((entry) => entry.id === message.id);
        return {
          ...current,
          messages: exists
            ? current.messages.map((entry) =>
                entry.id === message.id
                  ? mergeMailMessage(entry, message)
                  : entry,
              )
            : sortMessages(
                mergeConversationSourceMessages(current.messages, [message]),
              ),
        };
      });
      setRelatedConversationMessages((current) =>
        current.map((entry) =>
          entry.id === message.id ? mergeMailMessage(entry, message) : entry,
        ),
      );
      setListThreadRelatedMessages((current) =>
        current.map((entry) =>
          entry.id === message.id ? mergeMailMessage(entry, message) : entry,
        ),
      );
    },
    [queryClient],
  );

  useEffect(() => {
    const mailbox = activeMailboxRef.current;
    const bodyTargetMessageId =
      selectedConversationMessageId ?? selectedMessageId;
    if (!bodyTargetMessageId || !mailbox) {
      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) {
          setIsMessageBodyLoading(false);
        }
      });
      return () => {
        cancelled = true;
      };
    }

    const cached =
      selectedConversationMessages.find(
        (message) => message.id === bodyTargetMessageId,
      ) ??
      mailbox.messages.find((message) => message.id === bodyTargetMessageId) ??
      findCachedMailMessage(queryClient, bodyTargetMessageId);

    if (cached && messageHasLoadedBody(cached)) {
      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) {
          setIsMessageBodyLoading(false);
        }
      });
      return () => {
        cancelled = true;
      };
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setIsMessageBodyLoading(true);
      }
    });

    void (async () => {
      try {
        const message = await fetchMailMessageById(queryClient, {
          client: mailbox.client,
          session: mailbox.session,
          messageId: bodyTargetMessageId,
          requireBody: true,
        });
        if (cancelled) return;
        applyLoadedMessage(message);
      } catch (error) {
        if (cancelled) return;
        log.error("Failed to load message body", error);
        toast.error(getErrorMessage(error, "Could not load message content."));
      } finally {
        if (!cancelled) {
          setIsMessageBodyLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    applyLoadedMessage,
    queryClient,
    selectedConversationMessageId,
    selectedConversationMessages,
    selectedMessageId,
  ]);

  useEffect(() => {
    const mailbox = activeMailboxRef.current;
    if (!selectedMessageId || !mailbox) {
      return;
    }

    const index = mailbox.messages.findIndex(
      (message) => message.id === selectedMessageId,
    );
    if (index < 0) {
      return;
    }

    const neighborIds = [mailbox.messages[index - 1], mailbox.messages[index + 1]]
      .filter((message): message is JmapEmailMessage => Boolean(message))
      .map((message) => message.id);

    if (neighborIds.length === 0) {
      return;
    }

    let cancelled = false;
    void prefetchMailMessageBodies(queryClient, {
      client: mailbox.client,
      session: mailbox.session,
      messageIds: neighborIds,
    }).then(() => {
      if (cancelled) return;
      for (const messageId of neighborIds) {
        const loaded = findCachedMailMessage(queryClient, messageId);
        if (loaded && messageHasLoadedBody(loaded)) {
          applyLoadedMessage(loaded);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [applyLoadedMessage, queryClient, selectedMessageId]);

  // Thread list prefetch: when a mailbox is loaded, fetch sent messages
  // for thread grouping in the list (rate-limit safe — only once per mailbox).
  useEffect(() => {
    const mailbox = activeMailboxRef.current;
    if (!mailbox || !mailbox.selectedMailboxId) {
      setListThreadRelatedMessages([]);
      return;
    }

    // Only prefetch once per mailbox switch
    if (threadPrefetchedMailboxRef.current === mailbox.selectedMailboxId) return;
    threadPrefetchedMailboxRef.current = mailbox.selectedMailboxId;

    // Don't prefetch if we're already viewing sent (no need for self-reference)
    const currentMailbox = mailbox.mailboxes.find(
      (m) => m.id === mailbox.selectedMailboxId,
    );
    if (currentMailbox?.role?.toLowerCase() === "sent") {
      setListThreadRelatedMessages([]);
      return;
    }

    let cancelled = false;
    const sentMailbox = mailbox.mailboxes.find(
      (m) => m.role?.toLowerCase() === "sent",
    );
    if (!sentMailbox) {
      setListThreadRelatedMessages([]);
      return;
    }

    // Fetch first page of sent messages for thread augmentation
    void mailbox.client
      .getMailboxMessages(mailbox.session, sentMailbox.id, {
        limit: 50,
      })
      .then(({ messages: sentMessages }) => {
        if (cancelled) return;
        setListThreadRelatedMessages(sentMessages);
      })
      .catch((error) => {
        // Non-critical — thread grouping still works with mailbox-only messages
        log.warn("Failed to prefetch sent messages for thread grouping", error);
      });

    return () => {
      cancelled = true;
    };
  }, [activeMailbox?.selectedMailboxId]);

  useEffect(() => {
    const mailbox = activeMailboxRef.current;
    if (!selectedMessage || !mailbox) {
      let cancelled = false;
      queueMicrotask(() => {
        if (cancelled) return;
        setSelectedMessagePlaintext(null);
        setSelectedMessageDecryptedHtml(null);
        setSelectedMessageDecryptedAttachments(null);
        setSelectedMessageSignatureVerificationState("not_signed");
        setSelectedMessageDecryptError(null);
        setSelectedMessageIsDecrypting(false);
      });
      return () => {
        cancelled = true;
      };
    }
    if (!selectedMessageBodyLoaded) {
      return;
    }
    const encState = classifyMessageEncryption(selectedMessage);
    if (encState !== "inline_pgp" && encState !== "pgp_mime") {
      let cancelled = false;
      queueMicrotask(() => {
        if (cancelled) return;
        setSelectedMessagePlaintext(null);
        setSelectedMessageDecryptedHtml(null);
        setSelectedMessageDecryptedAttachments(null);
        setSelectedMessageSignatureVerificationState("not_signed");
        setSelectedMessageDecryptError(null);
        setSelectedMessageIsDecrypting(false);
      });
      return () => {
        cancelled = true;
      };
    }
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setSelectedMessageIsDecrypting(true);
      setSelectedMessageDecryptError(null);
      setSelectedMessageDecryptedAttachments(
        encState === "pgp_mime" ? [] : null,
      );
    });
    void (async () => {
      try {
        let armoredMessage: string;
        if (encState === "inline_pgp") {
          armoredMessage = await resolveInlinePgpArmoredCiphertext({
            message: selectedMessage,
            fetchBlob: (blobId) =>
              mailbox.client.getBlobAsText(mailbox.session, blobId),
          });
        } else {
          // pgp_mime: download the ciphertext blob
          const blobId = extractPgpMimeCiphertextBlobId(
            selectedMessage.bodyStructure,
          );
          if (!blobId) {
            setSelectedMessageDecryptError(
              "Could not locate PGP/MIME ciphertext blob.",
            );
            setSelectedMessageIsDecrypting(false);
            return;
          }
          armoredMessage = await mailbox.client.getBlobAsText(
            mailbox.session,
            blobId,
          );
        }
        if (cancelled) return;
        const senderEmail = selectedMessage.from?.[0]?.email;
        let senderPublicKeyArmored: string | undefined;
        if (
          senderEmail &&
          config &&
          senderEmail.endsWith(`@${config.defaultDomain}`)
        ) {
          try {
            const senderKey =
              await mailDemoApiService.getRecipientKey(senderEmail);
            senderPublicKeyArmored = senderKey.publicKeyArmored;
          } catch {
            /* best-effort */
          }
        }
        const decrypted = await mailCryptoWorkerClient.decryptMessage({
          armoredMessage,
          senderPublicKeyArmored,
        });
        if (cancelled) return;
        let parsed;
        try {
          parsed = await parseDecryptedMailContent(decrypted.plaintext);
        } catch (parseError) {
          log.warn("Failed to parse decrypted MIME", parseError);
          setSelectedMessagePlaintext(decrypted.plaintext);
          setSelectedMessageDecryptedHtml(null);
          setSelectedMessageDecryptedAttachments(
            encState === "pgp_mime" ? [] : null,
          );
          setSelectedMessageSignatureVerificationState(
            resolveSignatureVerificationState(decrypted),
          );
          setSelectedMessageDecryptError(null);
          setSelectedMessageIsDecrypting(false);
          return;
        }
        setSelectedMessageDecryptedHtml(parsed.html ?? null);
        setSelectedMessagePlaintext(parsed.text ?? decrypted.plaintext);
        if (encState === "pgp_mime") {
          setSelectedMessageDecryptedAttachments(
            parsed.attachments.flatMap((attachment) =>
              attachment.disposition === "attachment" && !attachment.related
                ? [toParsedMailAttachment(attachment)]
                : [],
            ),
          );
        } else {
          setSelectedMessageDecryptedAttachments(null);
        }
        setSelectedMessageSignatureVerificationState(
          resolveSignatureVerificationState(decrypted),
        );
        setSelectedMessageDecryptError(null);
        setSelectedMessageIsDecrypting(false);
      } catch (error) {
        if (cancelled) return;
        log.warn("Failed to decrypt message", error);
        setSelectedMessagePlaintext(null);
        setSelectedMessageDecryptedHtml(null);
        setSelectedMessageDecryptedAttachments(
          encState === "pgp_mime" ? [] : null,
        );
        setSelectedMessageSignatureVerificationState("not_signed");
        setSelectedMessageDecryptError(
          "Could not decrypt this message on this device.",
        );
        setSelectedMessageIsDecrypting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Only re-decrypt when the message identity or E2EE config changes.
    // Keyword-only updates (flag/read) do not change encryption state, so we
    // exclude activeMailbox and use activeMailboxRef.current inside the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMessage?.id, selectedMessageBodyLoaded, config]);

  useEffect(() => {
    const mailbox = activeMailboxRef.current;
    if (!selectedMessage || !mailbox || !selectedMessageBodyLoaded) {
      return;
    }

    const encState = classifyMessageEncryption(selectedMessage);
    if (encState !== "plain") {
      return;
    }

    const candidates = listCalendarAttachmentCandidates(selectedMessage);
    if (candidates.length === 0) {
      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) {
          setSelectedMessageDecryptedAttachments(null);
        }
      });
      return () => {
        cancelled = true;
      };
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setSelectedMessageDecryptedAttachments([]);
      }
    });

    void (async () => {
      try {
        const loaded = await Promise.all(
          candidates.map(async (candidate) => {
            const content = await mailbox.client.getBlobAsText(
              mailbox.session,
              candidate.blobId,
            );
            return {
              blobId: candidate.blobId,
              name: candidate.name ?? "invite.ics",
              type: candidate.type ?? "text/calendar",
              content,
            } satisfies MailAttachment;
          }),
        );
        if (!cancelled) {
          setSelectedMessageDecryptedAttachments(loaded);
        }
      } catch (error) {
        if (!cancelled) {
          log.warn("Failed to load calendar invite attachment", error);
          setSelectedMessageDecryptedAttachments(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMessage?.id, selectedMessageBodyLoaded]);

  // Auto-mark read when a message is opened (with configurable delay)
  useEffect(() => {
    if (!selectedMessageId) return;
    manualUnreadWhileOpenRef.current = null;

    const mailbox = activeMailboxRef.current;
    if (!mailbox) return;
    const msg = mailbox.messages.find((m) => m.id === selectedMessageId);
    if (!msg || msg.keywords?.["$seen"]) return;

    const listSettings = readMailListSettings();
    if (listSettings.markAsReadDelay === "never") return;

    const messageId = selectedMessageId;
    const nonce = bumpAutoReadNonce(messageId);
    const delayMs =
      listSettings.markAsReadDelay === "delayed" ? MARK_AS_READ_DELAY_MS : 0;

    const timer = setTimeout(() => {
      if (autoReadNonceRef.current.get(messageId) !== nonce) return;
      if (manualUnreadWhileOpenRef.current === messageId) return;

      const currentMailbox = activeMailboxRef.current;
      if (!currentMailbox) return;
      const currentMsg = currentMailbox.messages.find((m) => m.id === messageId);
      if (!currentMsg || currentMsg.keywords?.["$seen"]) return;

      setActiveMailbox((cur) =>
        cur
          ? {
              ...cur,
              messages: cur.messages.map((m) =>
                m.id === messageId
                  ? { ...m, keywords: { ...(m.keywords ?? {}), $seen: true } }
                  : m,
              ),
            }
          : cur,
      );

      void currentMailbox.client
        .markAsRead(currentMailbox.session, messageId)
        .then(() => {
          if (autoReadNonceRef.current.get(messageId) !== nonce) {
            return currentMailbox.client.markAsUnread(
              currentMailbox.session,
              messageId,
            );
          }
          return undefined;
        })
        .catch((err) => {
          log.error("Failed to mark message as read", err);
        });
    }, delayMs);

    return () => {
      clearTimeout(timer);
      bumpAutoReadNonce(messageId);
    };
  }, [bumpAutoReadNonce, selectedMessageId]);

  const refreshMailboxMessages = useCallback(
    async (mailboxId: string) => {
      if (!activeMailbox) return;
      setIsBusy(true);
      try {
        const pageSize = resolveMailboxMessagesPageSize(
          activeMailbox.mailServerPolicy,
          MAILBOX_MESSAGES_PAGE_SIZE,
        );
        const { messages, total } =
          await activeMailbox.client.getMailboxMessages(
            activeMailbox.session,
            mailboxId,
            { limit: pageSize, position: 0 },
          );
        setTotalMessages(total);
        seedMailMessageCache(queryClient, mailboxId, messages, total);
        setActiveMailbox((cur) =>
          cur ? { ...cur, selectedMailboxId: mailboxId, messages } : cur,
        );
        setSelectedMessageId((curId) => {
          if (!curId) return null;
          if (messages.some((message) => message.id === curId)) return curId;
          if (findCachedMailMessage(queryClient, curId)) return curId;
          return null;
        });
      } catch (error) {
        log.error("Failed to load mailbox messages", error);
        toast.error(
          getErrorMessage(error, "Could not load messages."),
        );
      } finally {
        setIsBusy(false);
      }
    },
    [activeMailbox, queryClient],
  );

  const loadMoreMessages = useCallback(async () => {
    if (!activeMailbox?.selectedMailboxId || isLoadingMore) return;
    const position = activeMailbox.messages.length;
    const pageSize = resolveMailboxMessagesPageSize(
      activeMailbox.mailServerPolicy,
      MAILBOX_MESSAGES_PAGE_SIZE,
    );
    if (!hasMoreMailboxMessages(position, totalMessages, pageSize)) return;
    setIsLoadingMore(true);
    try {
      const { messages: more, total } = await activeMailbox.client.getMailboxMessages(
        activeMailbox.session,
        activeMailbox.selectedMailboxId,
        { limit: pageSize, position },
      );
      if (total > 0) {
        setTotalMessages(total);
      }
      const uniqueMore = appendMailboxMessages(activeMailbox.messages, more);
      if (uniqueMore.length === 0) {
        setTotalMessages(activeMailbox.messages.length);
        return;
      }
      const mailboxId = activeMailbox.selectedMailboxId;
      const nextMessages = sortMessages([
        ...activeMailbox.messages,
        ...uniqueMore,
      ]);
      if (total > 0) {
        setTotalMessages(total);
      } else if (uniqueMore.length < pageSize) {
        setTotalMessages(nextMessages.length);
      }
      seedMailMessageCache(
        queryClient,
        mailboxId,
        nextMessages,
        total > 0 ? total : nextMessages.length,
      );
      setActiveMailbox((cur) =>
        cur ? { ...cur, messages: nextMessages } : cur,
      );
    } catch (error) {
      log.error("Failed to load more messages", error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [activeMailbox, isLoadingMore, queryClient, totalMessages]);

  const handleSignIn = useCallback(
    async (passwordOverride?: string) => {
      if (!config || !mailboxStatus || !mailboxEmail) return;
      setIsBusy(true);
      try {
        let email = mailboxEmail.trim().toLowerCase();

        const tokenManager = createMailOAuthTokenManager(config.oauth);
        const client = new StalwartJmapClient({
          baseUrl: config.discoveryBaseUrl,
          getAccessToken: () => tokenManager.getAccessToken(),
          onUnauthorized: async () => {
            tokenManager.clear();
            try {
              await tokenManager.getAccessToken();
            } catch (error) {
              log.warn("Could not refresh mail token after unauthorized response", {
                error,
              });
            }
          },
        });

        let vaultKey: string | null = null;
        let jmapSession: JmapSession;
        let backup: MailVaultBackupRecord | null = null;
        let hadRemoteBackup = false;

        if (!mailboxStatus.provisioned) {
          // New user: fetch key material first (needed for bootstrap passphrase)
          vaultKey = await mailDemoApiService
            .getVaultKeyMaterial(config.vaultKeyMaterialEndpoint)
            .then((r) => r.keyMaterial)
            .catch(() => null);
          const vaultPassphrase =
            vaultKey ?? passwordOverride ?? cachedAuthPassword ?? loginPassword;
          if (!vaultPassphrase) {
            throw new Error(MAILBOX_REAUTH_REQUIRED_MESSAGE);
          }
          await bootstrapMailboxForAccount({
            email: accountEmail,
            password: vaultPassphrase,
            displayName: accountDisplayName,
            userId: accountUserId,
            kdfOverrides: vaultKey ? KEY_MATERIAL_KDF : undefined,
          }).then((provisioned) => {
            email = provisioned.email.trim().toLowerCase();
            queryClient.setQueryData(
              mailQueryKeys.accountStatus(accountUserId),
              {
                email: provisioned.email,
                displayName: provisioned.displayName,
                provisioned: true,
              },
            );
          });
          // After bootstrap, fetch JMAP + vault backup in parallel
          const [session, remoteBackup, localBackup] = await Promise.all([
            client.discoverSession(),
            mailDemoApiService.getAccountVaultBackup().catch(() => null),
            getStoredMailVault(email),
          ]);
          jmapSession = session;
          hadRemoteBackup = remoteBackup !== null;
          backup = remoteBackup ?? localBackup;
        } else {
          // Provisioned: fetch key material + JMAP session + backup all in parallel
          const [keyResult, session, remoteBackup, localBackup] =
            await Promise.all([
              mailDemoApiService
                .getVaultKeyMaterial(config.vaultKeyMaterialEndpoint)
                .then((r) => r.keyMaterial)
                .catch(() => null),
              client.discoverSession(),
              mailDemoApiService.getAccountVaultBackup().catch(() => null),
              getStoredMailVault(email),
            ]);
          vaultKey = keyResult;
          jmapSession = session;
          hadRemoteBackup = remoteBackup !== null;
          backup = remoteBackup ?? localBackup;
        }

        if (!backup)
          throw new Error("No encrypted vault backup found for this mailbox.");
        if (hadRemoteBackup) await putStoredMailVault(backup);

        // Unlock vault: try key material first; fall back to password for migration
        let unlockedVault: UserKeyVault;
        let effectivePassphrase: string;

        if (vaultKey) {
          try {
            unlockedVault = await unlockEncryptedMailVault(
              backup.encryptedVaultB64,
              vaultKey,
              backup.kdfParams,
            );
            effectivePassphrase = vaultKey;
          } catch {
            // Vault was encrypted with old password — one-time migration required
            const migrationPassword =
              passwordOverride ?? cachedAuthPassword ?? loginPassword;
            if (!migrationPassword) {
              throw new Error(MAILBOX_REAUTH_REQUIRED_MESSAGE);
            }
            try {
              unlockedVault = await unlockEncryptedMailVault(
                backup.encryptedVaultB64,
                migrationPassword,
                backup.kdfParams,
              );
              effectivePassphrase = migrationPassword;
            } catch {
              throw new Error(MAILBOX_REAUTH_REQUIRED_MESSAGE);
            }
          }
        } else {
          const password =
            passwordOverride ?? cachedAuthPassword ?? loginPassword;
          if (!password) {
            throw new Error(MAILBOX_REAUTH_REQUIRED_MESSAGE);
          }
          unlockedVault = await unlockEncryptedMailVault(
            backup.encryptedVaultB64,
            password,
            backup.kdfParams,
          );
          effectivePassphrase = password;
        }

        // Worker load (CPU) + JMAP metadata + initial inbox (network) all in parallel
        const [, [accountSettings, stalwartPolicy, mailboxes, identities, initialInboxResult]] =
          await Promise.all([
          mailCryptoWorkerClient.loadVault({
            privateKeyArmored: unlockedVault.encryptedPrivateKeyArmored,
            privateKeyPassphrase: effectivePassphrase,
            publicKeyArmored: unlockedVault.publicKeyArmored,
          }),
          Promise.all([
            client.getAccountSettings(jmapSession),
            client.getStalwartPolicySingletons(jmapSession),
            client.getMailboxes(jmapSession),
            client.getIdentities(jmapSession),
            // Pre-fetch inbox in parallel — we don't know the inbox id yet,
            // but getMailboxMessages needs it. We'll resolve it after mailboxes load.
            Promise.resolve(null as { messages: JmapEmailMessage[]; total: number } | null),
          ]),
        ]);

        await client
          .ensureEncryptOnAppendDisabled(jmapSession)
          .catch((error) => {
            log.warn("Failed to disable Stalwart encryptOnAppend on sign-in", error);
          });

        // Background migration if unlocked with old password
        if (vaultKey && effectivePassphrase !== vaultKey) {
          void migrateVaultToKeyMaterial({
            unlockedVault,
            oldPassphrase: effectivePassphrase,
            newPassphrase: vaultKey,
            email,
            vaultVersion: backup.vaultVersion,
          });
        }

        const mailServerPolicy = resolveMailServerPolicy({
          session: jmapSession,
          emailSettings: stalwartPolicy.emailSettings,
          jmapSettings: stalwartPolicy.jmapSettings,
          configPolicy: config?.serverLimits ?? null,
        });
        client.setMailServerPolicy(mailServerPolicy, config?.serverLimits ?? null);
        const mailboxPageSize = resolveMailboxMessagesPageSize(
          mailServerPolicy,
          MAILBOX_MESSAGES_PAGE_SIZE,
        );

        const initialMailboxId = getPrimaryMailboxId(mailboxes, "inbox");
        // Fetch the first inbox page now that we know the mailbox id
        const { messages, total: initialTotal } = initialMailboxId
          ? await client.getMailboxMessages(jmapSession, initialMailboxId, {
              limit: mailboxPageSize,
            })
          : { messages: [], total: 0 };
        setTotalMessages(initialTotal);
        if (initialMailboxId) {
          seedMailMessageCache(
            queryClient,
            initialMailboxId,
            messages,
            initialTotal,
          );
        }
        setActiveMailbox({
          client,
          session: jmapSession,
          mailboxes,
          identities,
          pickerIdentities: capIdentitiesForPicker(identities, mailServerPolicy),
          messages,
          unlockedVault,
          accountEncryptedAtRest:
            (
              accountSettings.encryptionAtRest as
                | { "@type"?: string }
                | undefined
            )?.["@type"] === "Aes256",
          email,
          selectedMailboxId: initialMailboxId,
          mailServerPolicy,
        });
        setSelectedMessageId(null);
        setLoginPassword(effectivePassphrase);
      } catch (error) {
        log.error("Mail sign-in failed", error);
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not open the mailbox.",
        );
      } finally {
        setIsBusy(false);
      }
    },
    [
      accountDisplayName,
      accountEmail,
      accountUserId,
      cachedAuthPassword,
      config,
      loginPassword,
      mailboxEmail,
      mailboxStatus,
      queryClient,
    ],
  );

  // Trigger sign-in automatically once mailbox status and session are ready.
  useEffect(() => {
    if (
      !config ||
      !session?.user ||
      isSessionPending ||
      isMailboxStatusLoading ||
      isBusy ||
      activeMailbox ||
      !mailboxStatus ||
      hasAttemptedAutoOpenRef.current
    )
      return;
    hasAttemptedAutoOpenRef.current = true;
    void handleSignIn();
  }, [
    activeMailbox,
    config,
    isBusy,
    isMailboxStatusLoading,
    isSessionPending,
    mailboxStatus,
    session?.user,
    handleSignIn,
  ]);

  const refreshActiveMailboxPolicy = useCallback(
    async (
      mailbox: ActiveMailboxState,
      options?: { force?: boolean },
    ): Promise<ActiveMailboxState> => {
      const mailServerPolicy =
        (await mailbox.client.syncMailServerPolicy(mailbox.session, options)) ??
        mailbox.mailServerPolicy;
      const pickerIdentities = capIdentitiesForPicker(
        mailbox.identities,
        mailServerPolicy,
      );

      setActiveMailbox((current) =>
        current && current.session === mailbox.session
          ? {
              ...current,
              mailServerPolicy,
              pickerIdentities,
            }
          : current,
      );

      return {
        ...mailbox,
        mailServerPolicy,
        pickerIdentities,
      };
    },
    [],
  );

  const handleComposeImageUpload = useCallback(
    async (file: File): Promise<InlineImageUpload | null> => {
      if (!activeMailbox) return null;
      try {
        const contentType = file.type || "application/octet-stream";
        const [uploaded, dataUrl, content] = await Promise.all([
          activeMailbox.client.uploadBlob(
            activeMailbox.session,
            file,
            contentType,
          ),
          new Promise<string | null>((resolve) => {
            const reader = new FileReader();
            reader.onload = (event) =>
              resolve((event.target?.result as string) ?? null);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
          }),
          file.arrayBuffer().then((buffer) => new Uint8Array(buffer)),
        ]);
        if (!dataUrl) {
          throw new Error("Failed to read image preview");
        }
        const cid = `${crypto.randomUUID()}@solace`;
        registerComposeInlineImage({
          cid,
          blobId: uploaded.blobId,
          type: contentType,
          name: file.name,
          size: file.size,
          dataUrl,
          content,
        });
        return { src: dataUrl, cid };
      } catch (error) {
        log.error("Inline image upload failed", error);
        toast.error(`Failed to upload ${file.name}`);
        return null;
      }
    },
    [activeMailbox],
  );

  const handleSendMessage = useCallback(async (options?: { skipAttachmentCheck?: boolean }) => {
    if (!activeMailbox) return;
    const draft = getMailComposeBridge()?.getDraft();
    if (!draft) {
      toast.error("Compose is not available.");
      return;
    }
    const {
      to: composeTo,
      cc: composeCc,
      bcc: composeBcc,
      subject: composeSubject,
      body: composeBody,
      htmlBody: composeHtmlBody,
      attachments: composeAttachments,
      replyContext: composeReplyContext,
      identityId: composeIdentityId,
      fromEmailOverride: composeFromEmailOverride,
      draftId: composeDraftId,
      composeMode,
      signatureAlreadyEmbedded,
    } = draft;
    const composeSettings = readMailComposeSettings();
    const plainTextMode = composeSettings.plainTextMode;
    if (!composeTo.trim()) {
      toast.error("Enter a recipient email address.");
      return;
    }
    if (!composeSubject.trim()) {
      toast.error("Enter a subject line.");
      return;
    }

    const recipientValidation = validateComposeRecipients({
      to: composeTo,
      cc: composeCc,
      bcc: composeBcc,
      subject: composeSubject,
    });
    const recipientError =
      recipientValidation.errors.to ??
      recipientValidation.errors.recipients ??
      recipientValidation.errors.subject;
    if (recipientError) {
      toast.error(recipientError);
      return;
    }

    setIsBusy(true);
    try {
      const mailbox = await refreshActiveMailboxPolicy(activeMailbox, {
        force: true,
      });
      const recipients = parsedAddressesToEmails(recipientValidation.to);
      const ccRecipients = recipientValidation.cc.length
        ? parsedAddressesToEmails(recipientValidation.cc)
        : undefined;
      const bccRecipients = recipientValidation.bcc.length
        ? parsedAddressesToEmails(recipientValidation.bcc)
        : undefined;
      const allRecipients = [
        ...recipients,
        ...(ccRecipients ?? []),
        ...(bccRecipients ?? []),
      ];

      const draftsMailboxId = getPrimaryMailboxId(
        mailbox.mailboxes,
        "drafts",
      );
      const sentMailboxId = getPrimaryMailboxId(
        mailbox.mailboxes,
        "sent",
      );
      const identity =
        mailbox.identities.find(
          (entry) => entry.id === composeIdentityId,
        ) ?? mailbox.identities[0];
      const identityId = identity?.id;
      if (!draftsMailboxId || !identityId) {
        throw new Error(
          "This mailbox is missing a draft mailbox or sending identity.",
        );
      }
      const fromEmail = composeFromEmailOverride ?? identity.email;
      const fromName = identity.name ?? null;
      if (!plainTextMode) {
        await waitForQuotedInlineImageHydration();
        if (htmlHasUnhydratedInlinePlaceholders(composeHtmlBody)) {
          toast.error("Inline images are still loading. Try again in a moment.");
          return;
        }
      }
      const { textBody: bodyWithSignature, htmlBody: htmlWithSignature } =
        plainTextMode
          ? {
              textBody: signatureAlreadyEmbedded
                ? composeBody
                : resolveOutgoingComposeBodies({
                    body: composeBody,
                    htmlBody: "",
                    signature: identity,
                  }).textBody,
              htmlBody: undefined,
            }
          : resolveOutgoingComposeBodies({
              body: composeBody,
              htmlBody: composeHtmlBody,
              signature: identity,
              signatureAlreadyEmbedded,
            });
      const internalDomain = resolveEncryptionInternalDomain(
        config?.defaultDomain,
      );
      const willEncrypt = shouldEncryptOutgoingMail(
        allRecipients,
        internalDomain,
      );
      const preparedAttachments = await prepareOutgoingAttachments(
        composeAttachments,
        { maxBytes: mailbox.mailServerPolicy.limits.maxOutgoingAttachmentBytes },
      );
      const hasFileAttachments = preparedAttachments.length > 0;
      const hasInlineComposeImages = getComposeInlineImages().length > 0;
      const embedInlineImagesInEncryptedHtml =
        willEncrypt && hasInlineComposeImages && !hasFileAttachments;

      const rewritten =
        !plainTextMode && htmlWithSignature
          ? embedInlineImagesInEncryptedHtml
            ? { html: htmlWithSignature, attachments: [] as const }
            : rewriteComposeInlineImages(htmlWithSignature)
          : { html: htmlWithSignature, attachments: [] as const };
      const htmlForSend = plainTextMode ? undefined : (rewritten.html ?? htmlWithSignature);
      const inlineJmapAttachments: JmapAttachmentInput[] =
        embedInlineImagesInEncryptedHtml
          ? []
          : rewritten.attachments.map((attachment) => ({
              blobId: attachment.blobId,
              name: attachment.name,
              type: attachment.type,
              size: attachment.size,
              disposition: "inline" as const,
              cid: attachment.cid,
            }));
      const inlineMimeAttachments: OutgoingMimeAttachment[] =
        embedInlineImagesInEncryptedHtml
          ? []
          : getComposeInlineImages()
              .filter((image) =>
                rewritten.attachments.some(
                  (attachment) => attachment.cid === image.cid,
                ),
              )
              .map((image) => ({
                filename: image.name,
                contentType: image.type,
                content: image.content,
                cid: image.cid,
                disposition: "inline" as const,
              }));
      const fileMimeAttachments: OutgoingMimeAttachment[] =
        preparedAttachments.map(({ filename, contentType, content }) => ({
          filename,
          contentType,
          content,
        }));
      const mimeAttachments =
        inlineMimeAttachments.length > 0 || fileMimeAttachments.length > 0
          ? [...inlineMimeAttachments, ...fileMimeAttachments]
          : undefined;
      const { textBody, encrypted, pgpMimeCiphertext } =
        await resolveOutgoingMessageBody({
          activeMailbox: mailbox,
          recipients: allRecipients,
          plaintext: bodyWithSignature,
          html: htmlForSend,
          internalDomain,
          mimeAttachments:
            plainTextMode && fileMimeAttachments.length > 0
              ? fileMimeAttachments
              : mimeAttachments,
        });
      const htmlBody = encrypted || plainTextMode ? undefined : htmlForSend;

      if (!shouldEncryptOutgoingMail(allRecipients, internalDomain)) {
        await mailbox.client.ensureEncryptOnAppendDisabled(mailbox.session);
      }

      let uploadedAttachments: JmapAttachmentInput[] | undefined;
      if (!pgpMimeCiphertext) {
        const fileUploads =
          preparedAttachments.length > 0
            ? await mailbox.client.uploadPreparedAttachments(
                mailbox.session,
                preparedAttachments,
              )
            : [];
        uploadedAttachments = [...inlineJmapAttachments, ...fileUploads];
        if (uploadedAttachments.length > 0) {
          validateUploadedAttachmentSet(
            [
              ...rewritten.attachments.map((attachment) => ({
                filename: attachment.name,
                size: attachment.size,
              })),
              ...preparedAttachments.map((attachment) => ({
                filename: attachment.filename,
                size: attachment.size,
              })),
            ],
            uploadedAttachments,
          );
        } else {
          uploadedAttachments = undefined;
        }
      }

      const flushedDraftId = await flushComposeDraftSave();
      const previousDraftId =
        flushedDraftId ??
        getMailComposeBridge()?.getDraft().draftId ??
        composeDraftId ??
        undefined;

      const sendResult = await mailbox.client.sendMessage(
        mailbox.session,
        {
          draftsMailboxId,
          sentMailboxId,
          fromEmail,
          fromName,
          to: recipients,
          cc: ccRecipients,
          bcc: bccRecipients,
          subject: composeSubject.trim(),
          textBody,
          htmlBody,
          identityId,
          attachments: uploadedAttachments,
          pgpMimeCiphertext,
          inReplyTo: composeReplyContext?.inReplyTo,
          references: composeReplyContext?.references,
          previousDraftId,
        },
      );
      const effectiveThreadId =
        sendResult?.threadId ?? composeReplyContext?.threadId ?? null;
      if (composeReplyContext) {
        appendConversationMessage(
          createOptimisticReplyMessage({
            fromEmail: mailbox.email,
            to: recipients,
            subject: composeSubject.trim(),
            textBody: bodyWithSignature,
            sentMailboxId,
            threadId: effectiveThreadId,
            inReplyTo: composeReplyContext.inReplyTo,
            references: composeReplyContext.references,
          }),
        );
      }
      if (previousDraftId) {
        setActiveMailbox((cur) => {
          if (!cur) return cur;
          const remaining = cur.messages.filter(
            (message) => message.id !== previousDraftId,
          );
          if (remaining.length === cur.messages.length) return cur;
          return { ...cur, messages: remaining };
        });
        setSelectedMessageId((cur) =>
          cur === previousDraftId ? null : cur,
        );
      }
      getMailComposeBridge()?.resetDraft();
      const recentEntries = [
        ...recipientValidation.to,
        ...recipientValidation.cc,
        ...recipientValidation.bcc,
      ]
        .filter(
          (address) =>
            !isCurrentUserMailAddress(address.email, mailbox.email),
        )
        .map((address) => ({
          email: address.email,
          displayName: address.name,
        }));
      if (recentEntries.length > 0) {
        recordUsage(recentEntries, "mail");
      }
      toast(encrypted ? "Encrypted message sent." : "Message sent.");
      // Only reload the conversation thread for replies; let realtime sync
      // update the inbox list so the sent draft never briefly flashes there.
      if (effectiveThreadId) {
        void loadConversationThread(effectiveThreadId);
      }
    } catch (error) {
      log.error("Failed to send mail", {
        error,
        statusCode:
          error &&
          typeof error === "object" &&
          "statusCode" in error &&
          typeof (error as { statusCode?: unknown }).statusCode === "number"
            ? (error as { statusCode: number }).statusCode
            : undefined,
        to: composeTo,
        cc: composeCc,
        bcc: composeBcc,
        attachmentCount: composeAttachments.length,
        hasHtmlBody: hasComposeHtmlBody(composeHtmlBody),
        isReply: Boolean(composeReplyContext),
      });
      toast.error(
        getErrorMessage(error, "Could not send the message."),
      );
    } finally {
      setIsBusy(false);
    }
  }, [
    appendConversationMessage,
    activeMailbox,
    config,
    loadConversationThread,
    refreshActiveMailboxPolicy,
    recordUsage,
  ]);

  const handleDeleteMessage = useCallback(
    async (messageId?: string) => {
      const targetId = messageId ?? selectedMessageId;
      if (!activeMailbox || !targetId) return;
      const trashMailbox = activeMailbox.mailboxes.find(
        (m) => m.role === "trash",
      );
      const isInTrash = activeMailbox.selectedMailboxId === trashMailbox?.id;

      // For permanent deletes (already in trash), no undo
      if (isInTrash) {
        const remaining = activeMailbox.messages.filter((m) => m.id !== targetId);
        setIsBusy(true);
        try {
          await activeMailbox.client.moveToTrash(
            activeMailbox.session,
            targetId,
            null,
          );
          setActiveMailbox((cur) =>
            cur ? { ...cur, messages: remaining } : cur,
          );
          setSelectedMessageId((cur) =>
            cur === targetId ? (remaining[0]?.id ?? null) : cur,
          );
          toast("Message deleted.");
        } catch (error) {
          log.error("Failed to delete message", error);
          toast.error(
            error instanceof Error
              ? error.message
              : "Could not delete the message.",
          );
        } finally {
          setIsBusy(false);
        }
        return;
      }

      // For move-to-trash, show undo toast
      const targetMessage = activeMailbox.messages.find((m) => m.id === targetId);
      const originalMailboxId = targetMessage?.mailboxIds
        ? Object.entries(targetMessage.mailboxIds).find(([_, v]) => v)?.[0]
        : activeMailbox.selectedMailboxId;
      const remaining = activeMailbox.messages.filter((m) => m.id !== targetId);

      // Optimistic removal
      setActiveMailbox((cur) =>
        cur ? { ...cur, messages: remaining } : cur,
      );
      setSelectedMessageId((cur) =>
        cur === targetId ? (remaining[0]?.id ?? null) : cur,
      );

      const listSettings = readMailListSettings();
      const undoMs = listSettings.undoToastDurationMs;

      let undone = false;
      toast("Moved to trash.", {
        duration: undoMs,
        action: {
          label: "Undo",
          onClick: () => {
            undone = true;
            // Restore the message to the list
            if (targetMessage) {
              setActiveMailbox((cur) => {
                if (!cur) return cur;
                const restored = [...cur.messages];
                // Insert at the original position (or at the start as fallback)
                const insertIndex = Math.min(
                  remaining.findIndex((m) =>
                    m.receivedAt &&
                    targetMessage.receivedAt &&
                    Date.parse(m.receivedAt) < Date.parse(targetMessage.receivedAt)
                  ),
                  restored.length,
                );
                restored.splice(insertIndex < 0 ? 0 : insertIndex, 0, targetMessage);
                return { ...cur, messages: restored };
              });
              setSelectedMessageId(targetId);
            }
          },
        },
      });

      // After undo window, perform the actual JMAP move
      setTimeout(() => {
        if (undone) return;
        void activeMailbox.client
          .moveToTrash(activeMailbox.session, targetId, trashMailbox?.id ?? null)
          .catch((err) => {
            log.error("Failed to move message to trash", err);
          });
      }, undoMs);
    },
    [activeMailbox, selectedMessageId],
  );

  const handleReply = useCallback(() => {
    if (!selectedMessage) return;
    getMailComposeBridge()?.seedReply(
      selectedMessage,
      selectedMessagePlaintext,
    );
  }, [selectedMessage, selectedMessagePlaintext]);

  const handleForward = useCallback(() => {
    if (!selectedMessage) return;
    getMailComposeBridge()?.seedForward(
      selectedMessage,
      selectedMessagePlaintext,
    );
  }, [selectedMessage, selectedMessagePlaintext]);

  const handleQuickReply = useCallback(
    async (replyText: string, files: File[] = []) => {
      if (!selectedMessage || !activeMailbox) return;
      if (!replyText.trim()) {
        toast.error("Enter a reply message.");
        return;
      }
      const sender = selectedMessage.from?.[0]?.email ?? "";
      const subject = selectedMessage.subject ?? "";
      const { text } = extractMessageBodies(selectedMessage);
      const body = selectedMessagePlaintext ?? text ?? "";
      const date = selectedMessage.receivedAt
        ? new Date(selectedMessage.receivedAt).toLocaleString()
        : "";
      setIsBusy(true);
      try {
        const mailbox = await refreshActiveMailboxPolicy(activeMailbox, {
          force: true,
        });
        let recipients = resolveReplyRecipients({
          from: selectedMessage.from,
          to: selectedMessage.to,
          cc: selectedMessage.cc,
          currentUserEmail: mailbox.email,
        });
        if (recipients.length === 0) {
          recipients = resolveConversationReplyRecipients({
            messages: selectedConversationMessages,
            currentUserEmail: mailbox.email,
          });
        }
        if (recipients.length === 0 && sender.trim()) {
          recipients = [normalizeEmailAddress(sender)];
        }
        const draftsMailboxId = getPrimaryMailboxId(
          mailbox.mailboxes,
          "drafts",
        );
        const sentMailboxId = getPrimaryMailboxId(
          mailbox.mailboxes,
          "sent",
        );
        const identityId = mailbox.identities[0]?.id;
        if (!draftsMailboxId || !identityId) {
          throw new Error("Missing draft mailbox or sending identity.");
        }
        const internalDomain = resolveEncryptionInternalDomain(
          config?.defaultDomain,
        );
        const quotedBody = date
          ? `\n\n---\nOn ${date}, ${sender} wrote:\n${body}`
          : "";
        const preparedAttachments = await prepareOutgoingAttachments(files, {
          maxBytes: mailbox.mailServerPolicy.limits.maxOutgoingAttachmentBytes,
        });
        const mimeAttachments =
          preparedAttachments.length > 0
            ? preparedAttachments.map(({ filename, contentType, content }) => ({
                filename,
                contentType,
                content,
              }))
            : undefined;
        const { textBody, encrypted, pgpMimeCiphertext } =
          await resolveOutgoingMessageBody({
            activeMailbox: mailbox,
            recipients,
            plaintext: `${replyText}${quotedBody}`,
            internalDomain,
            mimeAttachments,
          });

        if (!shouldEncryptOutgoingMail(recipients, internalDomain)) {
          await mailbox.client.ensureEncryptOnAppendDisabled(mailbox.session);
        }

        let attachments: JmapAttachmentInput[] | undefined;
        if (!pgpMimeCiphertext && preparedAttachments.length > 0) {
          attachments = await mailbox.client.uploadPreparedAttachments(
            mailbox.session,
            preparedAttachments,
          );
          validateUploadedAttachmentSet(
            preparedAttachments.map((attachment) => ({
              filename: attachment.filename,
              size: attachment.size,
            })),
            attachments,
          );
        }

        const replyContext = buildReplyContext(selectedMessage);
        const sendResult = await mailbox.client.sendMessage(
          mailbox.session,
          {
            draftsMailboxId,
            sentMailboxId,
            fromEmail: mailbox.email,
            to: recipients,
            subject: subject.startsWith("Re: ") ? subject : `Re: ${subject}`,
            textBody,
            identityId,
            attachments,
            pgpMimeCiphertext,
            inReplyTo: replyContext.inReplyTo,
            references: replyContext.references,
          },
        );
        const effectiveThreadId =
          sendResult?.threadId ?? replyContext.threadId ?? null;
        appendConversationMessage(
          createOptimisticReplyMessage({
            fromEmail: mailbox.email,
            to: recipients,
            subject: subject.startsWith("Re: ") ? subject : `Re: ${subject}`,
            textBody: `${replyText}${quotedBody}`,
            sentMailboxId,
            threadId: effectiveThreadId,
            inReplyTo: replyContext.inReplyTo,
            references: replyContext.references,
            attachments,
          }),
        );
        if (effectiveThreadId) {
          void loadConversationThread(effectiveThreadId);
        }
        toast(encrypted ? "Encrypted reply sent." : "Reply sent.");
      } catch (error) {
        log.error("Failed to send quick reply", {
          error,
          statusCode:
            error &&
            typeof error === "object" &&
            "statusCode" in error &&
            typeof (error as { statusCode?: unknown }).statusCode === "number"
              ? (error as { statusCode: number }).statusCode
              : undefined,
          attachmentCount: files.length,
          replyLength: replyText.length,
          recipient: sender,
        });
        toast.error(
          getErrorMessage(error, "Could not send reply."),
        );
      } finally {
        setIsBusy(false);
      }
    },
    [
      appendConversationMessage,
      selectedMessage,
      selectedConversationMessages,
      selectedMessagePlaintext,
      activeMailbox,
      config,
      loadConversationThread,
      refreshActiveMailboxPolicy,
    ],
  );

  const handleDownloadAttachment = useCallback(
    async (attachment: MailAttachment) => {
      try {
        const { blob, filename } = await resolveAttachmentBlob({
          attachment,
          activeMailbox,
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // Delay revoke so the browser has time to start the download
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } catch (error) {
        log.error("Failed to download attachment", error);
        toast.error("Could not download the attachment.");
      }
    },
    [activeMailbox],
  );

  const handlePreviewAttachment = useCallback(
    async (attachment: MailAttachment) => {
      try {
        const previewKind = resolveAttachmentPreviewKind(attachment);
        if (!previewKind) {
          throw new Error("Preview is not available for this attachment.");
        }
        const { blob, filename } = await resolveAttachmentBlob({
          attachment,
          activeMailbox: activeMailboxRef.current,
        });
        const normalizedType =
          blob.type || attachment.type || "application/octet-stream";

        if (previewKind === "text") {
          const text = (await blob.text()).slice(0, 200000);
          setAttachmentPreview((current) => {
            if (current?.kind !== "text") {
              if (current && "url" in current) {
                URL.revokeObjectURL(current.url);
              }
              attachmentPreviewUrlRef.current = null;
            }
            return {
              kind: "text",
              name: filename,
              type: normalizedType,
              text,
            };
          });
          return;
        }

        const url = URL.createObjectURL(blob);
        setAttachmentPreview((current) => {
          if (current && "url" in current) {
            URL.revokeObjectURL(current.url);
          }
          attachmentPreviewUrlRef.current = url;
          return {
            kind: previewKind,
            name: filename,
            type: normalizedType,
            url,
          };
        });
      } catch (error) {
        log.error("Failed to preview attachment", error);
        toast.error("Could not preview the attachment.");
      }
    },
    [],
  );

  const loadAttachmentHoverPreview = useCallback(
    async (
      attachment: MailAttachment,
    ): Promise<MailAttachmentHoverPreview | null> => {
      const previewKind = resolveAttachmentPreviewKind(attachment);
      if (!previewKind) {
        return null;
      }

      const cacheKey = buildAttachmentPreviewCacheKey(attachment);
      const cached = attachmentHoverPreviewCacheRef.current.get(cacheKey);
      if (cached) {
        return cached;
      }

      const { blob } = await resolveAttachmentBlob({
        attachment,
        activeMailbox: activeMailboxRef.current,
      });
      const normalizedType =
        blob.type || attachment.type || "application/octet-stream";

      let preview: MailAttachmentHoverPreview;
      if (previewKind === "text") {
        preview = await buildTextAttachmentPreview(blob, normalizedType);
      } else {
        const url = URL.createObjectURL(blob);
        attachmentHoverPreviewUrlsRef.current.add(url);
        preview = {
          kind: previewKind,
          url,
          type: normalizedType,
        };
      }

      attachmentHoverPreviewCacheRef.current.set(cacheKey, preview);
      return preview;
    },
    [],
  );

  const closeAttachmentPreview = useCallback(() => {
    setAttachmentPreview((current) => {
      if (current && "url" in current) {
        URL.revokeObjectURL(current.url);
      }
      attachmentPreviewUrlRef.current = null;
      return null;
    });
  }, []);

  useEffect(() => {
    const hoverPreviewUrls = attachmentHoverPreviewUrlsRef.current;
    const hoverPreviewCache = attachmentHoverPreviewCacheRef.current;
    return () => {
      if (attachmentPreviewUrlRef.current) {
        URL.revokeObjectURL(attachmentPreviewUrlRef.current);
        attachmentPreviewUrlRef.current = null;
      }
      for (const url of hoverPreviewUrls) {
        URL.revokeObjectURL(url);
      }
      hoverPreviewUrls.clear();
      hoverPreviewCache.clear();
    };
  }, []);

  const handleMoveMessage = useCallback(
    async (targetMailboxId: string, messageId?: string) => {
      const targetId = messageId ?? selectedMessageId;
      if (!activeMailbox || !targetId) return;
      const targetMessage = activeMailbox.messages.find((m) => m.id === targetId);
      const originalMailboxId = targetMessage?.mailboxIds
        ? Object.entries(targetMessage.mailboxIds).find(([_, v]) => v)?.[0]
        : activeMailbox.selectedMailboxId;
      const targetMailbox = activeMailbox.mailboxes.find(
        (m) => m.id === targetMailboxId,
      );
      const remaining = activeMailbox.messages.filter((m) => m.id !== targetId);

      // Optimistic removal
      setActiveMailbox((cur) =>
        cur ? { ...cur, messages: remaining } : cur,
      );
      setSelectedMessageId((cur) =>
        cur === targetId ? (remaining[0]?.id ?? null) : cur,
      );

      const listSettings = readMailListSettings();
      const undoMs = listSettings.undoToastDurationMs;

      let undone = false;
      toast(`Moved to ${targetMailbox?.name ?? "mailbox"}.`, {
        duration: undoMs,
        action: {
          label: "Undo",
          onClick: () => {
            undone = true;
            if (targetMessage) {
              setActiveMailbox((cur) => {
                if (!cur) return cur;
                const restored = [...cur.messages];
                const insertIndex = remaining.findIndex((m) =>
                  m.receivedAt &&
                  targetMessage.receivedAt &&
                  Date.parse(m.receivedAt) < Date.parse(targetMessage.receivedAt),
                );
                restored.splice(insertIndex < 0 ? 0 : insertIndex, 0, targetMessage);
                return { ...cur, messages: restored };
              });
              setSelectedMessageId(targetId);
            }
          },
        },
      });

      // After undo window, perform the actual JMAP move
      setTimeout(() => {
        if (undone) return;
        void activeMailbox.client
          .moveToMailbox(activeMailbox.session, targetId, targetMailboxId)
          .catch((err) => {
            log.error("Failed to move message", err);
            // On failure, try to restore the message
            if (targetMessage) {
              setActiveMailbox((cur) => {
                if (!cur) return cur;
                const exists = cur.messages.some((m) => m.id === targetId);
                if (exists) return cur;
                return { ...cur, messages: [...cur.messages, targetMessage] };
              });
              toast.error("Failed to move message. Restored to list.");
            }
          });
      }, undoMs);
    },
    [activeMailbox, selectedMessageId],
  );

  const handleUntrash = useCallback(
    async (messageId?: string) => {
      if (!activeMailbox) return;
      const inboxMailbox = findInboxMailbox(activeMailbox.mailboxes);
      if (!inboxMailbox) {
        toast.error("Inbox mailbox not found.");
        return;
      }
      await handleMoveMessage(inboxMailbox.id, messageId);
    },
    [activeMailbox, handleMoveMessage],
  );

  const handleReportSpam = useCallback(
    async (messageId?: string) => {
      const targetId = messageId ?? selectedMessageId;
      if (!activeMailbox || !targetId) return;
      const spamMailbox = findSpamMailbox(activeMailbox.mailboxes);
      if (!spamMailbox) {
        toast.error("Spam folder not found.");
        return;
      }
      const currentRole = activeMailbox.mailboxes.find(
        (m) => m.id === activeMailbox.selectedMailboxId,
      )?.role;
      if (isSpamMailboxRole(currentRole)) {
        return;
      }
      await handleMoveMessage(spamMailbox.id, targetId);
    },
    [activeMailbox, selectedMessageId, handleMoveMessage],
  );

  const handleNotSpam = useCallback(
    async (messageId?: string) => {
      await handleUntrash(messageId);
    },
    [handleUntrash],
  );

  const handleEmptyMailbox = useCallback(async () => {
    if (!activeMailbox?.selectedMailboxId) return;
    const mailbox = activeMailbox.mailboxes.find(
      (m) => m.id === activeMailbox.selectedMailboxId,
    );
    const role = mailbox?.role;
    if (!isTrashMailboxRole(role) && !isSpamMailboxRole(role)) {
      return;
    }

    setIsBusy(true);
    try {
      const destroyed = await activeMailbox.client.emptyMailbox(
        activeMailbox.session,
        activeMailbox.selectedMailboxId,
      );
      setActiveMailbox((cur) =>
        cur ? { ...cur, messages: [] } : cur,
      );
      setSelectedMessageId(null);
      toast(
        destroyed > 0
          ? `Permanently deleted ${destroyed} ${destroyed === 1 ? "message" : "messages"}.`
          : "Folder is already empty.",
      );
    } catch (error) {
      log.error("Failed to empty mailbox", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not empty the folder.",
      );
    } finally {
      setIsBusy(false);
    }
  }, [activeMailbox]);

  const handleReorderMailboxes = useCallback(
    async (reordered: JmapMailbox[]) => {
      if (!activeMailbox) return;
      // Stamp each mailbox with its new sortOrder so the sidebar sort stays stable
      const withOrder = reordered.map((m, i) => ({ ...m, sortOrder: i }));
      setActiveMailbox((cur) => (cur ? { ...cur, mailboxes: withOrder } : cur));
      const updates = withOrder.map((m) => ({
        id: m.id,
        sortOrder: m.sortOrder!,
      }));
      try {
        await activeMailbox.client.updateMailboxSortOrders(
          activeMailbox.session,
          updates,
        );
      } catch (error) {
        log.error("Failed to save mailbox order", error);
      }
    },
    [activeMailbox],
  );

  const handleRenameMailbox = useCallback(
    async (mailboxId: string, name: string) => {
      if (!activeMailbox || !name.trim()) return;
      const mailbox = activeMailbox.mailboxes.find((m) => m.id === mailboxId);
      if (!mailbox || PROTECTED_ROLES.has(mailbox.role?.toLowerCase() ?? ""))
        return;
      const trimmed = name.trim();
      const validationError = validateMailboxName(
        trimmed,
        activeMailbox.mailServerPolicy,
      );
      if (validationError) {
        toast.error(validationError);
        return;
      }
      setActiveMailbox((cur) =>
        cur
          ? {
              ...cur,
              mailboxes: cur.mailboxes.map((m) =>
                m.id === mailboxId ? { ...m, name: trimmed } : m,
              ),
            }
          : cur,
      );
      try {
        await activeMailbox.client.renameMailbox(
          activeMailbox.session,
          mailboxId,
          trimmed,
        );
      } catch (error) {
        log.error("Failed to rename mailbox", error);
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not rename the mailbox.",
        );
        setActiveMailbox((cur) =>
          cur
            ? {
                ...cur,
                mailboxes: cur.mailboxes.map((m) =>
                  m.id === mailboxId ? { ...m, name: mailbox.name } : m,
                ),
              }
            : cur,
        );
      }
    },
    [activeMailbox],
  );

  const handleCreateMailbox = useCallback(
    async (name: string) => {
      if (!activeMailbox || !name.trim()) return;
      const mailbox = await refreshActiveMailboxPolicy(activeMailbox, {
        force: true,
      });
      const validationError = validateMailboxCreate(
        {
          name: name.trim(),
          existingMailboxCount: mailbox.mailboxes.length,
        },
        mailbox.mailServerPolicy,
      );
      if (validationError) {
        toast.error(validationError);
        return;
      }
      setIsBusy(true);
      try {
        const created = await mailbox.client.createMailbox(
          mailbox.session,
          name.trim(),
        );
        setActiveMailbox((cur) =>
          cur ? { ...cur, mailboxes: [...cur.mailboxes, created] } : cur,
        );
        toast(`Mailbox "${name.trim()}" created.`);
      } catch (error) {
        log.error("Failed to create mailbox", error);
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not create the mailbox.",
        );
      } finally {
        setIsBusy(false);
      }
    },
    [activeMailbox, refreshActiveMailboxPolicy],
  );

  const handleDeleteMailbox = useCallback(
    async (mailboxId: string) => {
      if (!activeMailbox) return;
      const mailbox = activeMailbox.mailboxes.find((m) => m.id === mailboxId);
      if (!mailbox || PROTECTED_ROLES.has(mailbox.role?.toLowerCase() ?? ""))
        return;
      setIsBusy(true);
      try {
        await activeMailbox.client.deleteMailbox(
          activeMailbox.session,
          mailboxId,
        );
        const remaining = activeMailbox.mailboxes.filter(
          (m) => m.id !== mailboxId,
        );
        const newSelectedId =
          activeMailbox.selectedMailboxId === mailboxId
            ? (remaining.find((m) => m.role === "inbox")?.id ??
              remaining[0]?.id ??
              null)
            : activeMailbox.selectedMailboxId;
        setActiveMailbox((cur) =>
          cur
            ? { ...cur, mailboxes: remaining, selectedMailboxId: newSelectedId }
            : cur,
        );
        if (activeMailbox.selectedMailboxId === mailboxId && newSelectedId) {
          await refreshMailboxMessages(newSelectedId);
        }
        toast(`Mailbox "${mailbox.name}" deleted.`);
      } catch (error) {
        log.error("Failed to delete mailbox", error);
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not delete the mailbox.",
        );
      } finally {
        setIsBusy(false);
      }
    },
    [activeMailbox, refreshMailboxMessages],
  );

  const handleBulkDelete = useCallback(
    async (messageIds: string[]) => {
      if (!activeMailbox || messageIds.length === 0) return;
      const trashMailbox = activeMailbox.mailboxes.find(
        (m) => m.role === "trash",
      );
      const isInTrash = activeMailbox.selectedMailboxId === trashMailbox?.id;
      const idSet = new Set(messageIds);
      const remaining = activeMailbox.messages.filter((m) => !idSet.has(m.id));
      setIsBusy(true);
      try {
        await activeMailbox.client.bulkMoveToTrash(
          activeMailbox.session,
          messageIds,
          isInTrash ? null : (trashMailbox?.id ?? null),
        );
        setActiveMailbox((cur) =>
          cur ? { ...cur, messages: remaining } : cur,
        );
        setSelectedMessageId((cur) =>
          cur && idSet.has(cur) ? (remaining[0]?.id ?? null) : cur,
        );
        toast(
          isInTrash
            ? `Deleted ${messageIds.length} messages.`
            : `Moved ${messageIds.length} to trash.`,
        );
      } catch (error) {
        log.error("Failed to bulk delete messages", error);
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not delete the messages.",
        );
      } finally {
        setIsBusy(false);
      }
    },
    [activeMailbox],
  );

  const handleBulkMove = useCallback(
    async (messageIds: string[], targetMailboxId: string) => {
      if (!activeMailbox || messageIds.length === 0) return;
      const idSet = new Set(messageIds);
      const remaining = activeMailbox.messages.filter((m) => !idSet.has(m.id));
      setIsBusy(true);
      try {
        await activeMailbox.client.bulkMoveToMailbox(
          activeMailbox.session,
          messageIds,
          targetMailboxId,
        );
        setActiveMailbox((cur) =>
          cur ? { ...cur, messages: remaining } : cur,
        );
        setSelectedMessageId((cur) =>
          cur && idSet.has(cur) ? (remaining[0]?.id ?? null) : cur,
        );
        const targetMailbox = activeMailbox.mailboxes.find(
          (m) => m.id === targetMailboxId,
        );
        toast(
          `Moved ${messageIds.length} to ${targetMailbox?.name ?? "mailbox"}.`,
        );
      } catch (error) {
        log.error("Failed to bulk move messages", error);
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not move the messages.",
        );
      } finally {
        setIsBusy(false);
      }
    },
    [activeMailbox],
  );

  const handleBulkMarkAsUnread = useCallback(
    async (messageIds: string[]) => {
      if (!activeMailbox || messageIds.length === 0) return;
      const idSet = new Set(messageIds);
      setActiveMailbox((cur) =>
        cur
          ? {
              ...cur,
              messages: cur.messages.map((m) => {
                if (!idSet.has(m.id)) return m;
                const keywords = { ...(m.keywords ?? {}) };
                delete keywords["$seen"];
                return { ...m, keywords };
              }),
            }
          : cur,
      );
      try {
        await activeMailbox.client.bulkMarkAsUnread(
          activeMailbox.session,
          messageIds,
        );
      } catch (error) {
        log.error("Failed to bulk mark as unread", error);
      }
    },
    [activeMailbox],
  );

  const handleBulkMarkAsRead = useCallback(
    async (messageIds: string[]) => {
      if (!activeMailbox || messageIds.length === 0) return;
      const idSet = new Set(messageIds);
      setActiveMailbox((cur) =>
        cur
          ? {
              ...cur,
              messages: cur.messages.map((m) =>
                idSet.has(m.id)
                  ? { ...m, keywords: { ...(m.keywords ?? {}), $seen: true } }
                  : m,
              ),
            }
          : cur,
      );
      try {
        await activeMailbox.client.bulkMarkAsRead(
          activeMailbox.session,
          messageIds,
        );
      } catch (error) {
        log.error("Failed to bulk mark as read", error);
      }
    },
    [activeMailbox],
  );

  const handleBulkReportSpam = useCallback(
    async (messageIds: string[]) => {
      if (!activeMailbox || messageIds.length === 0) return;
      const spamMailbox = findSpamMailbox(activeMailbox.mailboxes);
      if (!spamMailbox) {
        toast.error("Spam folder not found.");
        return;
      }
      await handleBulkMove(messageIds, spamMailbox.id);
    },
    [activeMailbox, handleBulkMove],
  );

  const handleMarkAsUnread = useCallback(
    async (messageId?: string) => {
      const targetId = messageId ?? selectedMessageId;
      if (!activeMailbox || !targetId) return;
      if (targetId === selectedMessageId) {
        manualUnreadWhileOpenRef.current = targetId;
        bumpAutoReadNonce(targetId);
      }
      const markUnread = (message: JmapEmailMessage): JmapEmailMessage => {
        const keywords = { ...(message.keywords ?? {}) };
        delete keywords["$seen"];
        return { ...message, keywords };
      };
      setActiveMailbox((cur) =>
        cur
          ? {
              ...cur,
              messages: cur.messages.map((m) =>
                m.id === targetId ? markUnread(m) : m,
              ),
            }
          : cur,
      );
      setRelatedConversationMessages((current) =>
        current.map((m) => (m.id === targetId ? markUnread(m) : m)),
      );
      try {
        await activeMailbox.client.markAsUnread(
          activeMailbox.session,
          targetId,
        );
      } catch (error) {
        log.error("Failed to mark message as unread", error);
      }
    },
    [activeMailbox, bumpAutoReadNonce, selectedMessageId],
  );

  const handleMarkAsRead = useCallback(
    async (messageId?: string) => {
      const targetId = messageId ?? selectedMessageId;
      if (!activeMailbox || !targetId) return;
      const msg = activeMailbox.messages.find((m) => m.id === targetId);
      if (!msg || msg.keywords?.["$seen"]) return;
      if (targetId === selectedMessageId) {
        manualUnreadWhileOpenRef.current = null;
        bumpAutoReadNonce(targetId);
      }
      setActiveMailbox((cur) =>
        cur
          ? {
              ...cur,
              messages: cur.messages.map((m) =>
                m.id === targetId
                  ? { ...m, keywords: { ...(m.keywords ?? {}), $seen: true } }
                  : m,
              ),
            }
          : cur,
      );
      try {
        await activeMailbox.client.markAsRead(activeMailbox.session, targetId);
      } catch (error) {
        log.error("Failed to mark message as read", error);
      }
    },
    [activeMailbox, bumpAutoReadNonce, selectedMessageId],
  );

  const handleRealtimeSync = useCallback(
    (result: MailSyncResponse) => {
      let resolvedSelectedMessageId: string | null | undefined;
      const calendarImport = result.calendarImport;

      setActiveMailbox((current) => {
        if (!current) {
          return current;
        }

        const currentAccountId = getPrimaryMailAccountId(current.session);
        if (currentAccountId !== result.accountId) {
          return current;
        }

        const nextMailboxes = mergeMailboxes(current.mailboxes, result.mailbox);
        const selectedMailboxDestroyed = Boolean(
          current.selectedMailboxId &&
          result.mailbox.destroyed.includes(current.selectedMailboxId),
        );
        const nextSelectedMailboxId = selectedMailboxDestroyed
          ? null
          : current.selectedMailboxId;
        const nextMessages = nextSelectedMailboxId
          ? mergeMessagesForMailbox(
              current.messages,
              nextSelectedMailboxId,
              result.email,
            )
          : [];

        resolvedSelectedMessageId =
          selectedMessageId &&
          nextMessages.some((message) => message.id === selectedMessageId)
            ? selectedMessageId
            : null;

        return {
          ...current,
          mailboxes: nextMailboxes,
          selectedMailboxId: nextSelectedMailboxId,
          messages: nextMessages,
        };
      });

      if (resolvedSelectedMessageId !== undefined) {
        setSelectedMessageId(resolvedSelectedMessageId);
      }

      const importedCount =
        (calendarImport?.eventsCreated ?? 0) +
        (calendarImport?.eventsUpdated ?? 0) +
        (calendarImport?.eventsDeleted ?? 0);
      if (importedCount > 0) {
        toast.success(
          importedCount === 1
            ? "Calendar updated from an email invite."
            : `Calendar updated from ${importedCount} email invite changes.`,
        );
      }
    },
    [selectedMessageId],
  );

  const handleManualRefresh = useCallback(async () => {
    if (!activeMailbox?.selectedMailboxId || isRefreshing) return;
    const mailbox = await refreshActiveMailboxPolicy(activeMailbox, {
      force: true,
    });
    const mailboxId = mailbox.selectedMailboxId;
    if (!mailboxId) {
      return;
    }
    setIsRefreshing(true);
    try {
      const previousTotal = totalMessages;
      const pageSize = resolveMailboxMessagesPageSize(
        mailbox.mailServerPolicy,
        MAILBOX_MESSAGES_PAGE_SIZE,
      );
      const { messages: refreshed, total } =
        await mailbox.client.getMailboxMessages(
          mailbox.session,
          mailboxId,
          { limit: pageSize, position: 0 },
        );
      setTotalMessages(total);
      const merged = mergeRefreshedMailboxMessages(
        mailbox.messages,
        refreshed,
        previousTotal,
        total,
      );
      seedMailMessageCache(queryClient, mailboxId, merged, total);
      setActiveMailbox((cur) =>
        cur ? { ...cur, messages: merged, selectedMailboxId: mailboxId } : cur,
      );

      const accountId = getPrimaryMailAccountId(mailbox.session);
      if (accountId) {
        const result = await mailDemoApiService.syncAccount(accountId);
        handleRealtimeSync(result);
      }
    } catch (error) {
      log.error("Manual refresh failed", error);
      toast.error(getErrorMessage(error, "Could not refresh mail."));
    } finally {
      setIsRefreshing(false);
    }
  }, [
    activeMailbox,
    handleRealtimeSync,
    isRefreshing,
    queryClient,
    refreshActiveMailboxPolicy,
    totalMessages,
  ]);

  const realtimeAccountId = activeMailbox
    ? getPrimaryMailAccountId(activeMailbox.session)
    : null;

  useMailRealtime({
    accountId: realtimeAccountId,
    enabled: Boolean(activeMailbox && session?.user),
    onSync: handleRealtimeSync,
  });

  const handleDisconnect = useCallback(async () => {
    try {
      await mailCryptoWorkerClient.clear();
    } catch {
      /* best-effort */
    }
    setActiveMailbox(null);
    setSelectedMessageId(null);
    setSelectedMessagePlaintext(null);
    setSelectedMessageDecryptedHtml(null);
    setSelectedMessageSignatureVerificationState("not_signed");
    setSelectedMessageDecryptError(null);
    setSelectedMessageIsDecrypting(false);
  }, []);

  const handleSignOut = useCallback(async () => {
    await handleDisconnect();
    clearEncPasswordCookie();
    try {
      await signOut();
    } finally {
      completeAuthNavigation("/");
    }
  }, [handleDisconnect]);

  const handleToggleFlagged = useCallback(
    async (messageId?: string) => {
      const targetId = messageId ?? selectedMessageId;
      if (!activeMailbox || !targetId) return;
      const msg = activeMailbox.messages.find((m) => m.id === targetId);
      if (!msg) return;
      const isFlagged = msg.keywords?.["$flagged"] === true;
      const next = !isFlagged;
      setActiveMailbox((cur) =>
        cur
          ? {
              ...cur,
              messages: cur.messages.map((m) => {
                if (m.id !== targetId) return m;
                const keywords = { ...(m.keywords ?? {}) };
                if (next) keywords["$flagged"] = true;
                else delete keywords["$flagged"];
                return { ...m, keywords };
              }),
            }
          : cur,
      );
      try {
        await activeMailbox.client.toggleFlagged(
          activeMailbox.session,
          targetId,
          next,
        );
      } catch (error) {
        log.error("Failed to toggle flag", error);
      }
    },
    [activeMailbox, selectedMessageId],
  );

  const handleSetMessageLabel = useCallback(
    async (messageId: string, labelId: string, assigned: boolean) => {
      if (!activeMailbox) return;
      const keywordKey = `label:${labelId}`;
      setActiveMailbox((cur) =>
        cur
          ? {
              ...cur,
              messages: cur.messages.map((m) => {
                if (m.id !== messageId) return m;
                const keywords = { ...(m.keywords ?? {}) };
                if (assigned) keywords[keywordKey] = true;
                else delete keywords[keywordKey];
                return { ...m, keywords };
              }),
            }
          : cur,
      );
      try {
        await activeMailbox.client.setMessageLabel(
          activeMailbox.session,
          messageId,
          labelId,
          assigned,
        );
      } catch (error) {
        log.error("Failed to set message label", error);
      }
    },
    [activeMailbox],
  );

  const saveLabelsToVault = useCallback(
    async (updatedLabels: LabelDef[]) => {
      if (!activeMailbox || !loginPassword) return;
      const updatedVault: UserKeyVault = {
        ...activeMailbox.unlockedVault,
        labels: updatedLabels,
      };
      const encrypted = await createEncryptedMailVault(
        updatedVault,
        loginPassword,
      );
      setActiveMailbox((cur) =>
        cur ? { ...cur, unlockedVault: updatedVault } : cur,
      );
      await putStoredMailVault({
        email: activeMailbox.email,
        vaultVersion: updatedVault.vaultVersion,
        ...encrypted,
      });
      await mailDemoApiService.upsertAccountVaultBackup({
        vaultVersion: updatedVault.vaultVersion,
        ...encrypted,
      });
    },
    [activeMailbox, loginPassword],
  );

  const handleCreateLabel = useCallback(
    async (name: string, color: string): Promise<LabelDef | null> => {
      if (!activeMailbox) return null;
      const newLabel: LabelDef = { id: crypto.randomUUID(), name, color };
      const updatedLabels = [
        ...(activeMailbox.unlockedVault.labels ?? []),
        newLabel,
      ];
      try {
        await saveLabelsToVault(updatedLabels);
        return newLabel;
      } catch (error) {
        log.error("Failed to create label", error);
        toast.error("Could not save the label.");
        return null;
      }
    },
    [activeMailbox, saveLabelsToVault],
  );

  const handleDeleteLabel = useCallback(
    async (labelId: string) => {
      if (!activeMailbox) return;
      const updatedLabels = (activeMailbox.unlockedVault.labels ?? []).filter(
        (l) => l.id !== labelId,
      );
      try {
        await saveLabelsToVault(updatedLabels);
      } catch (error) {
        log.error("Failed to delete label", error);
        toast.error("Could not delete the label.");
      }
    },
    [activeMailbox, saveLabelsToVault],
  );

  const handleUpdateLabel = useCallback(
    async (
      labelId: string,
      updates: { name: string; color: string },
    ): Promise<void> => {
      if (!activeMailbox) return;
      const updatedLabels = (activeMailbox.unlockedVault.labels ?? []).map(
        (label) =>
          label.id === labelId
            ? { ...label, name: updates.name, color: updates.color }
            : label,
      );
      try {
        await saveLabelsToVault(updatedLabels);
      } catch (error) {
        log.error("Failed to update label", error);
        toast.error("Could not update the label.");
        throw error;
      }
    },
    [activeMailbox, saveLabelsToVault],
  );

  const composeMailPolicy = useMemo(
    () =>
      activeMailbox?.mailServerPolicy ??
      resolveMailServerPolicy({ configPolicy: config?.serverLimits ?? null }),
    [activeMailbox?.mailServerPolicy, config?.serverLimits],
  );

  const user = session?.user
    ? {
        name: session.user.name ?? "User",
        email: session.user.email ?? "",
        avatar: session.user.image ?? undefined,
      }
    : null;

  return {
    session,
    isSessionPending,
    config,
    isBusy,
    mailboxStatus,
    isMailboxStatusLoading,
    activeMailbox,
    composeMailPolicy,
    listThreadRelatedMessages,
    selectedMessage,
    selectedMessageId,
    setSelectedMessageId: handleSelectMessageId,
    openMessageById,
    selectedConversationMessages,
    isConversationLoading,
    isMessageBodyLoading,
    loadConversationThread,
    setSelectedConversationMessageId: handleSelectConversationMessageId,
    selectedMessagePlaintext,
    selectedMessageDecryptedHtml,
    selectedMessageDecryptedAttachments,
    attachmentPreview,
    selectedMessageSignatureVerificationState,
    selectedMessageDecryptError,
    selectedMessageIsDecrypting,
    isPaletteOpen,
    setIsPaletteOpen,
    refreshMailboxMessages,
    loadMoreMessages,
    hasMoreMessages: activeMailbox
      ? hasMoreMailboxMessages(
          activeMailbox.messages.length,
          totalMessages,
          resolveMailboxMessagesPageSize(
            activeMailbox.mailServerPolicy,
            MAILBOX_MESSAGES_PAGE_SIZE,
          ),
        )
      : false,
    isLoadingMore,
    handleManualRefresh,
    isRefreshing,
    handleSignIn,
    handleSendMessage,
    handleComposeImageUpload,
    handleDeleteMessage,
    handleReply,
    handleForward,
    handleQuickReply,
    handlePreviewAttachment,
    loadAttachmentHoverPreview,
    handleDownloadAttachment,
    closeAttachmentPreview,
    handleUntrash,
    handleReportSpam,
    handleNotSpam,
    handleBulkReportSpam,
    handleEmptyMailbox,
    handleMoveMessage,
    handleCreateMailbox,
    handleDeleteMailbox,
    handleRenameMailbox,
    handleReorderMailboxes,
    handleMarkAsUnread,
    handleMarkAsRead,
    handleBulkDelete,
    handleBulkMove,
    handleBulkMarkAsUnread,
    handleBulkMarkAsRead,
    handleToggleFlagged,
    handleSetMessageLabel,
    handleCreateLabel,
    handleDeleteLabel,
    handleUpdateLabel,
    labels: activeMailbox?.unlockedVault.labels ?? [],
    handleDisconnect,
    handleSignOut,
    user,
    mailboxEmail,
    accountEmail,
    accountDisplayName,
    conversationSourceMessages,
  };
}
