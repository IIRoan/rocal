"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import PostalMime, { type Attachment as ParsedMailAttachment } from "postal-mime";
import { createLogger } from "@workspace/logger";
import { useSession, signOut } from "@/lib/auth-client";
import { completeAuthNavigation } from "@/lib/auth-navigation";
import { useSmoothRouter } from "@/hooks/use-smooth-router";
import { useMailRealtime } from "@/hooks/use-mail-realtime";
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
  classifyMessageEncryption,
  extractMessageBodies,
  extractPgpMimeCiphertextBlobId,
} from "@/lib/mail/message-security";
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
  messages: JmapEmailMessage[];
  unlockedVault: UserKeyVault;
  accountEncryptedAtRest: boolean;
  email: string;
  selectedMailboxId: string | null;
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

function normalizeEmailAddress(value: string): string {
  return value.trim().toLowerCase();
}

function getAttachmentSize(
  content: MailAttachment["content"],
): number | null {
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
    mailboxIds: input.sentMailboxId ? { [input.sentMailboxId]: true } : undefined,
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

function getEmailDomain(value: string): string | null {
  const normalized = normalizeEmailAddress(value);
  const atIndex = normalized.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === normalized.length - 1) {
    return null;
  }

  return normalized.slice(atIndex + 1);
}

async function resolveOutgoingMessageBody(input: {
  activeMailbox: ActiveMailboxState;
  recipients: string[];
  plaintext: string;
  internalDomain: string | null;
}): Promise<{ textBody: string; encrypted: boolean }> {
  if (!input.internalDomain) {
    return {
      textBody: input.plaintext,
      encrypted: false,
    };
  }

  const internalRecipients = input.recipients.filter(
    (recipient) => getEmailDomain(recipient) === input.internalDomain,
  );

  if (internalRecipients.length === 0) {
    return {
      textBody: input.plaintext,
      encrypted: false,
    };
  }

  if (internalRecipients.length !== input.recipients.length) {
    throw new Error(
      "Messages can only be end-to-end encrypted when every recipient is an internal Solace mailbox.",
    );
  }

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

  const { armoredMessage } = await mailCryptoWorkerClient.encryptForRecipients({
    plaintext: input.plaintext,
    recipientPublicKeysArmored: [...recipientPublicKeysArmored],
  });

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
    log.error(
      "Background vault migration to server key material failed.",
      err,
    );
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
      nextMessages.set(message.id, message);
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

  const [config, setConfig] = useState<MailDemoConfig | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [totalMessages, setTotalMessages] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [mailboxStatus, setMailboxStatus] = useState<MailAccountStatus | null>(
    null,
  );
  const [isMailboxStatusLoading, setIsMailboxStatusLoading] = useState(false);
  const [loginPassword, setLoginPassword] = useState("");
  const [hasAttemptedAutoOpen, setHasAttemptedAutoOpen] = useState(false);
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
  const [optimisticConversationMessages, setOptimisticConversationMessages] =
    useState<JmapEmailMessage[]>([]);
  const [isConversationLoading, setIsConversationLoading] = useState(false);
  const [selectedMessagePlaintext, setSelectedMessagePlaintext] = useState<
    string | null
  >(null);
  const [
    selectedMessageSignatureVerificationState,
    setSelectedMessageSignatureVerificationState,
  ] = useState<MailSignatureVerificationState>("not_signed");
  const [selectedMessageDecryptError, setSelectedMessageDecryptError] =
    useState<string | null>(null);
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
  const [composeTo, setComposeTo] = useState("");
  const [composeCc, setComposeCc] = useState("");
  const [composeBcc, setComposeBcc] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeAttachments, setComposeAttachments] = useState<File[]>([]);
  const [composeReplyContext, setComposeReplyContext] =
    useState<MailReplyContext | null>(null);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [isFullCompose, setIsFullCompose] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  // Initialised synchronously from sessionStorage; updated async once the
  // encrypted cookie is decrypted (cross-tab / post-refresh case).
  const [cachedAuthPassword, setCachedAuthPassword] = useState<string | null>(
    () => (typeof window !== "undefined" ? peekCachedAuthPassword() : null),
  );
  const [blockRemoteImages, setBlockRemoteImagesState] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("mail:blockRemoteImages") === "true";
  });
  const [blockTrackingPixels, setBlockTrackingPixelsState] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem("mail:blockTrackingPixels");
    return stored === null ? true : stored === "true";
  });

  const setBlockRemoteImages = useCallback((val: boolean) => {
    setBlockRemoteImagesState(val);
    localStorage.setItem("mail:blockRemoteImages", String(val));
  }, []);

  const setBlockTrackingPixels = useCallback((val: boolean) => {
    setBlockTrackingPixelsState(val);
    localStorage.setItem("mail:blockTrackingPixels", String(val));
  }, []);

  const accountEmail = session?.user?.email?.trim().toLowerCase() ?? "";
  const accountDisplayName = session?.user?.name?.trim() ?? "";
  const accountUserId = session?.user?.id?.trim() ?? "";
  const mailboxEmail = mailboxStatus?.email ?? accountEmail;

  // Keep the ref in sync on every render so stable callbacks always see the latest mailbox
  activeMailboxRef.current = activeMailbox;

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
      completeAuthNavigation(
        `/login?next=${encodeURIComponent(currentPath)}`,
      );
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

  // Load config
  useEffect(() => {
    let cancelled = false;
    void mailDemoApiService
      .getConfig()
      .then((nextConfig) => {
        if (!cancelled) setConfig(nextConfig);
      })
      .catch((error) => {
        if (!cancelled) {
          log.error("Failed to load mail config", error);
          toast.error("Could not load the mail configuration.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load mailbox status
  useEffect(() => {
    let cancelled = false;
    if (!accountEmail || !accountUserId) {
      setMailboxStatus(null);
      setActiveMailbox(null);
      return () => {
        cancelled = true;
      };
    }
    setIsMailboxStatusLoading(true);
    void mailDemoApiService
      .getAccountStatus()
      .then((status) => {
        if (cancelled) return;
        setMailboxStatus(status);
      })
      .catch((error) => {
        if (cancelled) return;
        log.error("Failed to load mailbox status", error);
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not load mailbox status.",
        );
      })
      .finally(() => {
        if (!cancelled) setIsMailboxStatusLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accountEmail, accountUserId]);

  useEffect(() => {
    setHasAttemptedAutoOpen(false);
  }, [accountUserId, mailboxStatus?.provisioned]);

  useEffect(() => {
    if (cachedAuthPassword && !activeMailbox && !loginPassword) {
      setHasAttemptedAutoOpen(false);
    }
  }, [activeMailbox, cachedAuthPassword, loginPassword]);

  // Decrypt selected message
  const selectedMailboxMessage =
    activeMailbox?.messages.find((m) => m.id === selectedMessageId) ?? null;
  const conversationSourceMessages = useMemo(
    () => {
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
    },
    [activeMailbox?.messages, relatedConversationMessages, optimisticConversationMessages],
  );
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

  const handleSelectMessageId = useCallback((messageId: string | null) => {
    setSelectedMessageId(messageId);
    setSelectedConversationMessageId(null);
  }, []);

  const handleSelectConversationMessageId = useCallback((messageId: string) => {
    setSelectedConversationMessageId(messageId);
  }, []);

  const appendConversationMessage = useCallback(
    (message: JmapEmailMessage) => {
      setOptimisticConversationMessages((current) =>
        mergeConversationSourceMessages(current, [message]),
      );
    },
    [],
  );

  const loadConversationThread = useCallback(
    async (threadId: string) => {
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
    },
    [],
  );

  const clearConversationThread = useCallback(() => {
    setRelatedConversationMessages([]);
    setIsConversationLoading(false);
  }, []);

  useEffect(() => {
    setSelectedConversationMessageId(null);
    setOptimisticConversationMessages([]);
    setRelatedConversationMessages([]);
    setIsConversationLoading(false);
  }, [selectedMessageId]);

  useEffect(() => {
    if (
      selectedConversationMessageId &&
      !selectedConversationMessages.some(
        (message) => message.id === selectedConversationMessageId,
      )
    ) {
      setSelectedConversationMessageId(null);
    }
  }, [selectedConversationMessageId, selectedConversationMessages]);

  useEffect(() => {
    if (!selectedMessageId || !activeMailboxRef.current) {
      clearConversationThread();
      return;
    }

    // Use the ref so keyword/flag updates to activeMailbox don't re-trigger
    // a full thread re-fetch (threadId never changes for a given message).
    const selectedMsg = activeMailboxRef.current.messages.find(
      (m) => m.id === selectedMessageId,
    );
    const threadId = selectedMsg?.threadId;

    if (threadId) {
      void loadConversationThread(threadId);
    } else {
      clearConversationThread();
    }
  }, [selectedMessageId, loadConversationThread, clearConversationThread]);

  useEffect(() => {
    const mailbox = activeMailboxRef.current;
    if (!selectedMessage || !mailbox) {
      setSelectedMessagePlaintext(null);
      setSelectedMessageDecryptedHtml(null);
      setSelectedMessageDecryptedAttachments(null);
      setSelectedMessageSignatureVerificationState("not_signed");
      setSelectedMessageDecryptError(null);
      return;
    }
    const encState = classifyMessageEncryption(selectedMessage);
    if (encState !== "inline_pgp" && encState !== "pgp_mime") {
      setSelectedMessagePlaintext(null);
      setSelectedMessageDecryptedHtml(null);
      setSelectedMessageDecryptedAttachments(null);
      setSelectedMessageSignatureVerificationState("not_signed");
      setSelectedMessageDecryptError(null);
      return;
    }
    if (encState === "pgp_mime") {
      setSelectedMessageDecryptedAttachments([]);
    } else {
      setSelectedMessageDecryptedAttachments(null);
    }
    let cancelled = false;
    void (async () => {
      try {
        let armoredMessage: string;
        if (encState === "inline_pgp") {
          const { text } = extractMessageBodies(selectedMessage);
          if (!text) {
            setSelectedMessageDecryptError(
              "No armored PGP body found in this message.",
            );
            return;
          }
          armoredMessage = text;
        } else {
          // pgp_mime: download the ciphertext blob
          const blobId = extractPgpMimeCiphertextBlobId(
            selectedMessage.bodyStructure,
          );
          if (!blobId) {
            setSelectedMessageDecryptError(
              "Could not locate PGP/MIME ciphertext blob.",
            );
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
        if (encState === "pgp_mime") {
          const parsed = await PostalMime.parse(decrypted.plaintext, {
            attachmentEncoding: "arraybuffer",
          });
          setSelectedMessageDecryptedHtml(parsed.html ?? null);
          setSelectedMessagePlaintext(parsed.text ?? decrypted.plaintext);
          setSelectedMessageDecryptedAttachments(
            parsed.attachments.flatMap((attachment) =>
              attachment.disposition === "attachment" && !attachment.related
                ? [toParsedMailAttachment(attachment)]
                : [],
            ),
          );
        } else {
          setSelectedMessageDecryptedHtml(null);
          setSelectedMessagePlaintext(decrypted.plaintext);
          setSelectedMessageDecryptedAttachments(null);
        }
        setSelectedMessageSignatureVerificationState(
          resolveSignatureVerificationState(decrypted),
        );
        setSelectedMessageDecryptError(null);
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
      }
    })();
    return () => {
      cancelled = true;
    };
    // Only re-decrypt when the message identity or E2EE config changes.
    // Keyword-only updates (flag/read) do not change encryption state, so we
    // exclude activeMailbox and use activeMailboxRef.current inside the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMessage?.id, config]);

  // Auto-mark read when a message is opened
  useEffect(() => {
    if (!selectedMessageId || !activeMailbox) return;
    const msg = activeMailbox.messages.find((m) => m.id === selectedMessageId);
    if (!msg || msg.keywords?.["$seen"]) return;
    setActiveMailbox((cur) =>
      cur
        ? {
            ...cur,
            messages: cur.messages.map((m) =>
              m.id === selectedMessageId
                ? { ...m, keywords: { ...(m.keywords ?? {}), $seen: true } }
                : m,
            ),
          }
        : cur,
    );
    activeMailbox.client
      .markAsRead(activeMailbox.session, selectedMessageId)
      .catch((err) => {
        log.error("Failed to mark message as read", err);
      });
    // Only run when the selected message changes, not on every activeMailbox update
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMessageId]);

  const refreshMailboxMessages = useCallback(
    async (mailboxId: string) => {
      if (!activeMailbox) return;
      setIsBusy(true);
      try {
        const { messages, total } =
          await activeMailbox.client.getMailboxMessages(
            activeMailbox.session,
            mailboxId,
            { limit: 20, position: 0 },
          );
        setTotalMessages(total);
        setActiveMailbox((cur) =>
          cur ? { ...cur, selectedMailboxId: mailboxId, messages } : cur,
        );
        setSelectedMessageId((curId) => {
          if (curId && messages.some((m) => m.id === curId)) return curId;
          return messages[0]?.id ?? null;
        });
      } catch (error) {
        log.error("Failed to load mailbox messages", error);
        toast.error(
          error instanceof Error ? error.message : "Could not load messages.",
        );
      } finally {
        setIsBusy(false);
      }
    },
    [activeMailbox],
  );

  const loadMoreMessages = useCallback(async () => {
    if (!activeMailbox?.selectedMailboxId || isLoadingMore) return;
    const position = activeMailbox.messages.length;
    if (position >= totalMessages) return;
    setIsLoadingMore(true);
    try {
      const { messages: more } = await activeMailbox.client.getMailboxMessages(
        activeMailbox.session,
        activeMailbox.selectedMailboxId,
        { limit: 20, position },
      );
      if (more.length > 0) {
        setActiveMailbox((cur) =>
          cur
            ? { ...cur, messages: sortMessages([...cur.messages, ...more]) }
            : cur,
        );
      }
    } catch (error) {
      log.error("Failed to load more messages", error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [activeMailbox, isLoadingMore, totalMessages]);

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
            setMailboxStatus({
              email: provisioned.email,
              displayName: provisioned.displayName,
              provisioned: true,
            });
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

        // Worker load (CPU) + JMAP metadata (network) in parallel
        const [, [accountSettings, mailboxes, identities]] = await Promise.all([
          mailCryptoWorkerClient.loadVault({
            privateKeyArmored: unlockedVault.encryptedPrivateKeyArmored,
            privateKeyPassphrase: effectivePassphrase,
            publicKeyArmored: unlockedVault.publicKeyArmored,
          }),
          Promise.all([
            client.getAccountSettings(jmapSession),
            client.getMailboxes(jmapSession),
            client.getIdentities(jmapSession),
          ]),
        ]);

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

        const initialMailboxId = getPrimaryMailboxId(mailboxes, "inbox");
        const { messages, total: initialTotal } = initialMailboxId
          ? await client.getMailboxMessages(jmapSession, initialMailboxId, {
              limit: 20,
            })
          : { messages: [], total: 0 };
        setTotalMessages(initialTotal);
        setActiveMailbox({
          client,
          session: jmapSession,
          mailboxes,
          identities,
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
        });
        setSelectedMessageId(messages[0]?.id ?? null);
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
      hasAttemptedAutoOpen
    )
      return;
    setHasAttemptedAutoOpen(true);
    void handleSignIn();
  }, [
    activeMailbox,
    config,
    hasAttemptedAutoOpen,
    isBusy,
    isMailboxStatusLoading,
    isSessionPending,
    mailboxStatus,
    session?.user,
    handleSignIn,
  ]);

  const handleSendMessage = useCallback(async () => {
    if (!activeMailbox) return;
    if (!composeTo.trim()) {
      toast.error("Enter a recipient email address.");
      return;
    }
    if (!composeSubject.trim()) {
      toast.error("Enter a subject line.");
      return;
    }
    setIsBusy(true);
    try {
      const parseAddressList = (raw: string): string[] =>
        raw.split(/[,;]+/).flatMap((s) => {
          const normalized = normalizeEmailAddress(s);
          return normalized ? [normalized] : [];
        });

      const recipients = parseAddressList(composeTo);
      const ccRecipients = composeCc.trim() ? parseAddressList(composeCc) : undefined;
      const bccRecipients = composeBcc.trim() ? parseAddressList(composeBcc) : undefined;

      const draftsMailboxId = getPrimaryMailboxId(
        activeMailbox.mailboxes,
        "drafts",
      );
      const sentMailboxId = getPrimaryMailboxId(
        activeMailbox.mailboxes,
        "sent",
      );
      const identityId = activeMailbox.identities[0]?.id;
      if (!draftsMailboxId || !identityId) {
        throw new Error(
          "This mailbox is missing a draft mailbox or sending identity.",
        );
      }
      const internalDomain =
        config?.defaultDomain.trim().toLowerCase() ??
        getEmailDomain(activeMailbox.email);
      const { textBody, encrypted } = await resolveOutgoingMessageBody({
        activeMailbox,
        recipients,
        plaintext: composeBody,
        internalDomain,
      });

      // Upload any file attachments before sending
      let uploadedAttachments: import("@/lib/mail/jmap-client").JmapAttachmentInput[] | undefined;
      if (composeAttachments.length > 0) {
        uploadedAttachments = await Promise.all(
          composeAttachments.map((file) =>
            activeMailbox.client.uploadFile(activeMailbox.session, file),
          ),
        );
      }

      const sendResult = await activeMailbox.client.sendMessage(activeMailbox.session, {
        draftsMailboxId,
        sentMailboxId,
        fromEmail: activeMailbox.email,
        to: recipients,
        cc: ccRecipients,
        bcc: bccRecipients,
        subject: composeSubject.trim(),
        textBody,
        identityId,
        attachments: uploadedAttachments,
        inReplyTo: composeReplyContext?.inReplyTo,
        references: composeReplyContext?.references,
      });
      const effectiveThreadId =
        sendResult?.threadId ?? composeReplyContext?.threadId ?? null;
      if (composeReplyContext) {
        appendConversationMessage(
          createOptimisticReplyMessage({
            fromEmail: activeMailbox.email,
            to: recipients,
            subject: composeSubject.trim(),
            textBody: composeBody,
            sentMailboxId,
            threadId: effectiveThreadId,
            inReplyTo: composeReplyContext.inReplyTo,
            references: composeReplyContext.references,
          }),
        );
      }
      setComposeTo("");
      setComposeCc("");
      setComposeBcc("");
      setComposeSubject("");
      setComposeBody("");
      setComposeAttachments([]);
      setComposeReplyContext(null);
      setIsComposeOpen(false);
      toast(encrypted ? "Encrypted message sent." : "Message sent.");
      // Only reload the conversation thread for replies; let realtime sync
      // update the inbox list so the sent draft never briefly flashes there.
      if (effectiveThreadId) {
        void loadConversationThread(effectiveThreadId);
      }
    } catch (error) {
      log.error("Failed to send mail", error);
      toast.error(
        error instanceof Error ? error.message : "Could not send the message.",
      );
    } finally {
      setIsBusy(false);
    }
  }, [
    appendConversationMessage,
    activeMailbox,
    composeTo,
    composeCc,
    composeBcc,
    composeSubject,
    composeBody,
    composeAttachments,
    composeReplyContext,
    config,
    loadConversationThread,
  ]);

  const handleDeleteMessage = useCallback(
    async (messageId?: string) => {
      const targetId = messageId ?? selectedMessageId;
      if (!activeMailbox || !targetId) return;
      const trashMailbox = activeMailbox.mailboxes.find(
        (m) => m.role === "trash",
      );
      const isInTrash = activeMailbox.selectedMailboxId === trashMailbox?.id;
      const remaining = activeMailbox.messages.filter((m) => m.id !== targetId);
      setIsBusy(true);
      try {
        await activeMailbox.client.moveToTrash(
          activeMailbox.session,
          targetId,
          isInTrash ? null : (trashMailbox?.id ?? null),
        );
        setActiveMailbox((cur) =>
          cur ? { ...cur, messages: remaining } : cur,
        );
        setSelectedMessageId((cur) =>
          cur === targetId ? (remaining[0]?.id ?? null) : cur,
        );
        toast(isInTrash ? "Message deleted." : "Moved to trash.");
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
    },
    [activeMailbox, selectedMessageId],
  );

  const handleReply = useCallback(() => {
    if (!selectedMessage) return;
    const sender = selectedMessage.from?.[0]?.email ?? "";
    const subject = selectedMessage.subject ?? "";
    const { text } = extractMessageBodies(selectedMessage);
    const body = selectedMessagePlaintext ?? text ?? "";
    const date = selectedMessage.receivedAt
      ? new Date(selectedMessage.receivedAt).toLocaleString()
      : "";
    setComposeTo(sender);
    setComposeSubject(subject.startsWith("Re: ") ? subject : `Re: ${subject}`);
    setComposeBody(`\n\n---\nOn ${date}, ${sender} wrote:\n${body}`);
    setComposeReplyContext(buildReplyContext(selectedMessage));
    setIsComposeOpen(true);
  }, [selectedMessage, selectedMessagePlaintext]);

  const handleForward = useCallback(() => {
    if (!selectedMessage) return;
    const sender = selectedMessage.from?.[0]?.email ?? "";
    const subject = selectedMessage.subject ?? "";
    const { text } = extractMessageBodies(selectedMessage);
    const body = selectedMessagePlaintext ?? text ?? "";
    setComposeTo("");
    setComposeSubject(
      subject.startsWith("Fwd: ") ? subject : `Fwd: ${subject}`,
    );
    setComposeBody(`\n\n---\nForwarded message from ${sender}:\n${body}`);
    setComposeReplyContext(null);
    setIsComposeOpen(true);
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
        const recipients = [normalizeEmailAddress(sender)];
        const draftsMailboxId = getPrimaryMailboxId(
          activeMailbox.mailboxes,
          "drafts",
        );
        const sentMailboxId = getPrimaryMailboxId(
          activeMailbox.mailboxes,
          "sent",
        );
        const identityId = activeMailbox.identities[0]?.id;
        if (!draftsMailboxId || !identityId) {
          throw new Error("Missing draft mailbox or sending identity.");
        }
        const internalDomain =
          config?.defaultDomain.trim().toLowerCase() ??
          getEmailDomain(activeMailbox.email);
        const quotedBody = date
          ? `\n\n---\nOn ${date}, ${sender} wrote:\n${body}`
          : "";
        const { textBody, encrypted } = await resolveOutgoingMessageBody({
          activeMailbox,
          recipients,
          plaintext: `${replyText}${quotedBody}`,
          internalDomain,
        });

        // Upload any attached files and collect JMAP attachment inputs
        const attachments =
          files.length > 0
            ? await Promise.all(
                files.map((f) =>
                  activeMailbox.client.uploadFile(activeMailbox.session, f),
                ),
              )
            : undefined;

        const replyContext = buildReplyContext(selectedMessage);
        const sendResult = await activeMailbox.client.sendMessage(activeMailbox.session, {
          draftsMailboxId,
          sentMailboxId,
          fromEmail: activeMailbox.email,
          to: recipients,
          subject: subject.startsWith("Re: ") ? subject : `Re: ${subject}`,
          textBody,
          identityId,
          attachments,
          inReplyTo: replyContext.inReplyTo,
          references: replyContext.references,
        });
        const effectiveThreadId =
          sendResult?.threadId ?? replyContext.threadId ?? null;
        appendConversationMessage(
          createOptimisticReplyMessage({
            fromEmail: activeMailbox.email,
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
        log.error("Failed to send quick reply", error);
        toast.error(
          error instanceof Error ? error.message : "Could not send reply.",
        );
      } finally {
        setIsBusy(false);
      }
    },
    [
      appendConversationMessage,
      selectedMessage,
      selectedMessagePlaintext,
      activeMailbox,
      config,
      loadConversationThread,
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
    async (attachment: MailAttachment): Promise<MailAttachmentHoverPreview | null> => {
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
      const remaining = activeMailbox.messages.filter((m) => m.id !== targetId);
      setIsBusy(true);
      try {
        await activeMailbox.client.moveToMailbox(
          activeMailbox.session,
          targetId,
          targetMailboxId,
        );
        setActiveMailbox((cur) =>
          cur ? { ...cur, messages: remaining } : cur,
        );
        setSelectedMessageId((cur) =>
          cur === targetId ? (remaining[0]?.id ?? null) : cur,
        );
        const targetMailbox = activeMailbox.mailboxes.find(
          (m) => m.id === targetMailboxId,
        );
        toast(`Moved to ${targetMailbox?.name ?? "mailbox"}.`);
      } catch (error) {
        log.error("Failed to move message", error);
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not move the message.",
        );
      } finally {
        setIsBusy(false);
      }
    },
    [activeMailbox, selectedMessageId],
  );

  const handleUntrash = useCallback(async () => {
    if (!activeMailbox || !selectedMessageId) return;
    const inboxMailbox = activeMailbox.mailboxes.find(
      (m) => m.role === "inbox" || m.role === "all",
    );
    if (!inboxMailbox) {
      toast.error("Inbox mailbox not found.");
      return;
    }
    await handleMoveMessage(inboxMailbox.id);
  }, [activeMailbox, selectedMessageId, handleMoveMessage]);

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
      setIsBusy(true);
      try {
        const created = await activeMailbox.client.createMailbox(
          activeMailbox.session,
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
    [activeMailbox],
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

  const handleMarkAsUnread = useCallback(
    async (messageId?: string) => {
      const targetId = messageId ?? selectedMessageId;
      if (!activeMailbox || !targetId) return;
      setActiveMailbox((cur) =>
        cur
          ? {
              ...cur,
              messages: cur.messages.map((m) => {
                if (m.id !== targetId) return m;
                const keywords = { ...(m.keywords ?? {}) };
                delete keywords["$seen"];
                return { ...m, keywords };
              }),
            }
          : cur,
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
    [activeMailbox, selectedMessageId],
  );

  const handleMarkAsRead = useCallback(
    async (messageId?: string) => {
      const targetId = messageId ?? selectedMessageId;
      if (!activeMailbox || !targetId) return;
      const msg = activeMailbox.messages.find((m) => m.id === targetId);
      if (!msg || msg.keywords?.["$seen"]) return;
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
    [activeMailbox, selectedMessageId],
  );

  const handleRealtimeSync = useCallback(
    (result: MailSyncResponse) => {
      let resolvedSelectedMessageId: string | null | undefined;

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
            : (nextMessages[0]?.id ?? null);

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
    },
    [selectedMessageId],
  );

  const handleManualRefresh = useCallback(async () => {
    if (!activeMailbox || isRefreshing) return;
    const accountId = getPrimaryMailAccountId(activeMailbox.session);
    if (!accountId) return;
    setIsRefreshing(true);
    try {
      const result = await mailDemoApiService.syncAccount(accountId);
      handleRealtimeSync(result);
    } catch (error) {
      log.error("Manual refresh failed", error);
      toast.error(
        error instanceof Error ? error.message : "Could not refresh mail.",
      );
    } finally {
      setIsRefreshing(false);
    }
  }, [activeMailbox, isRefreshing, handleRealtimeSync]);

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
    selectedMessage,
    selectedMessageId,
    setSelectedMessageId: handleSelectMessageId,
    selectedConversationMessages,
    isConversationLoading,
    setSelectedConversationMessageId: handleSelectConversationMessageId,
    selectedMessagePlaintext,
    selectedMessageDecryptedHtml,
    selectedMessageDecryptedAttachments,
    attachmentPreview,
    selectedMessageSignatureVerificationState,
    selectedMessageDecryptError,
    composeTo,
    setComposeTo,
    composeCc,
    setComposeCc,
    composeBcc,
    setComposeBcc,
    composeAttachments,
    setComposeAttachments,
    composeSubject,
    setComposeSubject,
    composeBody,
    setComposeBody,
    isComposeOpen,
    setIsComposeOpen,
    isFullCompose,
    setIsFullCompose,
    isPaletteOpen,
    setIsPaletteOpen,
    blockRemoteImages,
    setBlockRemoteImages,
    blockTrackingPixels,
    setBlockTrackingPixels,
    refreshMailboxMessages,
    loadMoreMessages,
    hasMoreMessages: activeMailbox
      ? activeMailbox.messages.length < totalMessages
      : false,
    isLoadingMore,
    handleManualRefresh,
    isRefreshing,
    handleSignIn,
    handleSendMessage,
    handleDeleteMessage,
    handleReply,
    handleForward,
    handleQuickReply,
    handlePreviewAttachment,
    loadAttachmentHoverPreview,
    handleDownloadAttachment,
    closeAttachmentPreview,
    handleUntrash,
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
