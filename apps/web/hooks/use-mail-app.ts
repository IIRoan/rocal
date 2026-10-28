"use client";

import {
  useEffect,
  useEffectEvent,
  useState,
  useRef,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getErrorMessage,
  normalizeEmailAddress,
  parsedAddressesToEmails,
  capIdentitiesForPicker,
  resolveMailServerPolicy,
  resolveMessageReplyFrom,
  resolveMessageReplyRecipients,
  validateComposeRecipients,
  prepareOutgoingAttachments,
  validateUploadedAttachmentSet,
  validateMailboxCreate,
  validateMailboxName,
  resolveMailboxMessagesPageSize,
  isAutomatedMailAddress,
  isCurrentUserMailAddress,
  resolveEncryptionInternalDomain,
  shouldEncryptOutgoingMail,
  type OutgoingMimeAttachment,
  resolveAttachmentPreviewKind,
  appendMailboxMessages,
  hasMoreMailboxMessages,
  formatQuotedMailDate,
  type QuotedDateOptions,
} from "@workspace/calendar-core";
import { useSettings } from "@/hooks/use-settings";
import { useUserTimeFormat } from "@/hooks/use-user-time-format";
import { toast } from "sonner";
import { createLogger } from "@workspace/logger";
import { useSession, signOut } from "@/lib/auth-client";
import {
  beginAuthNavigation,
  completeAuthNavigation,
  isAuthNavigationPending,
} from "@/lib/auth-navigation";
import { useSmoothRouter } from "@/hooks/use-smooth-router";
import { useMailRealtime } from "@/hooks/use-mail-realtime";
import { useRecentContacts } from "@/hooks/use-recent-contacts";
import { useSimpleLoginAliasAction } from "@/hooks/use-simplelogin-alias-action";
import { peekCachedAuthPassword } from "@/lib/e2ee-password-cache";
import { resolveAvatarUrl } from "@/lib/profile-picture";
import { clearEncPasswordCookie, initEncPasswordFromCookie } from "@/lib/enc-password-cookie";
import { bootstrapMailboxForAccount } from "@/lib/mail/account-bootstrap";
import { mailDemoApiService } from "@/lib/mail/api-service";
import { createMailOAuthTokenManager } from "@/lib/mail/oauth-client";
import { clearMailOpenPrefetch, ensureMailOpenPrefetch } from "@/lib/mail/mail-open-prefetch";
import {
  deleteStoredDerivedVaultKey,
  getStoredDerivedVaultKey,
  putStoredDerivedVaultKey,
} from "@/lib/mail/derived-vault-key-storage";
import { unwrapVaultSecret } from "@/lib/mail/vault-secret";
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
import { mergeMailMessagePreservingKeywords, messageHasLoadedBody } from "@/lib/mail/mail-message-body";
import {
  findInboxMailbox,
  findSpamMailbox,
  isSpamMailboxRole,
  isTrashMailboxRole,
} from "@/lib/mail/mail-mailbox-roles";
import { mailQueryKeys } from "@/lib/mail/mail-query-keys";
import { getMailComposeBridge, flushComposeDraftSave } from "@/components/mail/mail-compose-bridge";
import { decryptMessageForCompose } from "@/lib/mail/decrypt-message-for-compose";
import { useConversationDecryptedPreviews } from "@/hooks/use-conversation-decrypted-previews";
import { replaceSavedDraftInMailboxList } from "@/lib/mail/compose-draft-cache";
import { getDraftsMailboxId } from "@/lib/mail/draft-utils";
import { parseDecryptedMailContent } from "@/lib/mail/decrypted-mail-content";
import { hasComposeHtmlBody, resolveOutgoingComposeBodies } from "@/lib/mail/signature-utils";
import { mergeRefreshedMailboxMessages } from "@/lib/mail/mail-list-merge";
import { readMailListSettings, MARK_AS_READ_DELAY_MS } from "@/lib/mail/mail-list-settings";
import { rewriteComposeInlineImages, htmlHasUnhydratedInlinePlaceholders } from "@/lib/mail/compose-editor-utils";
import {
  getComposeInlineImages,
  readBlobAsDataUrl,
  registerComposeInlineImage,
  waitForQuotedInlineImageHydration,
} from "@/lib/mail/compose-inline-images";
import type { InlineImageUpload } from "@/components/mail/rich-text-editor";
import { readMailComposeSettings } from "@/lib/mail/compose-settings";
import { MAILBOX_MESSAGES_PAGE_SIZE } from "@/lib/mail/mail-pagination";
import {
  classifyMessageEncryption,
  extractMessageBodies,
  extractPgpMimeCiphertextBlobId,
  resolveInlinePgpArmoredCiphertext,
} from "@/lib/mail/message-security";
import { listCalendarAttachmentCandidates } from "@/lib/mail/calendar-invite";
import {
  unlockEncryptedMailVault,
  unlockEncryptedMailVaultWithDerivedKey,
  createEncryptedMailVault,
} from "@/lib/mail/vault-crypto";
import { getStoredMailVault, putStoredMailVault } from "@/lib/mail/vault-storage";
import { mailCryptoWorkerClient } from "@/lib/mail/worker-client";
import type {
  JmapEmailMessage,
  JmapMailbox,
  JmapSession,
  LabelDef,
  MailAttachment,
  MailSignatureVerificationState,
  MailSyncResponse,
  MailVaultBackupRecord,
  UserKeyVault,
} from "@/lib/mail/types";
import {
  resolveAttachmentBlob,
  buildTextAttachmentPreview,
  resolveOutgoingMessageBody,
  resolveSignatureVerificationState,
  getPrimaryMailboxId,
  messageBelongsToMailbox,
  sortMessages,
  toParsedMailAttachment,
  buildAttachmentPreviewCacheKey,
  buildReplyContext,
  createOptimisticReplyMessage,
  mergeMailboxes,
  mergeMessagesForMailbox,
  mergeConversationSourceMessages,
  withMessageKeywords,
  patchMessagesKeywords,
  resolveConversationReplyRecipients,
  messagesLikelyMatch,
  type ActiveMailboxState,
  type MailAttachmentPreviewState,
  type MailAttachmentHoverPreview,
} from "@/lib/mail/mail-app-helpers";

export type { ActiveMailboxState } from "@/lib/mail/mail-app-helpers";

const log = createLogger("mail-app");

/** The account's vault backup, preferring the server copy and caching it on this device. */
async function loadMailVaultBackup(
  email: string,
): Promise<MailVaultBackupRecord> {
  const [remoteBackup, localBackup] = await Promise.all([
    mailDemoApiService.getAccountVaultBackup().catch(() => null),
    getStoredMailVault(email),
  ]);
  if (remoteBackup) {
    await putStoredMailVault(remoteBackup);
    return remoteBackup;
  }
  if (!localBackup) {
    throw new Error("No encrypted vault backup found for this mailbox.");
  }
  return localBackup;
}

/** Opens the vault with the passphrase sealed to the user's E2EE account key, so only their signed-in device can. */
async function unlockMailVaultBackup(
  backup: MailVaultBackupRecord,
  accountUserId: string | null | undefined,
): Promise<{ unlockedVault: UserKeyVault; effectivePassphrase: string }> {
  if (!backup.wrappedSecret) {
    throw new Error(
      "This mail vault is not sealed to your encryption key and cannot be opened.",
    );
  }
  const sealedSecret = await unwrapVaultSecret(backup.wrappedSecret);
  if (!sealedSecret) {
    throw new Error(
      "Your encryption keys are not unlocked on this device. Sign in with your email password, then try again.",
    );
  }

  const cachedDerivedKey = accountUserId
    ? await getStoredDerivedVaultKey(accountUserId).catch(() => null)
    : null;
  const cachedVault = cachedDerivedKey
    ? await unlockEncryptedMailVaultWithDerivedKey(
        backup.encryptedVaultB64,
        cachedDerivedKey,
      ).catch(() => null)
    : null;
  const unlockedVault =
    cachedVault ??
    (await unlockEncryptedMailVault(
      backup.encryptedVaultB64,
      sealedSecret,
      backup.kdfParams,
      (keyB64) => {
        if (!accountUserId) return;
        void Promise.resolve(
          putStoredDerivedVaultKey(accountUserId, keyB64),
        ).catch(() => undefined);
      },
    ));
  if (!unlockedVault) {
    throw new Error("Failed to unlock mail vault.");
  }
  return { unlockedVault, effectivePassphrase: sealedSecret };
}

function bumpAutoReadNonce(
  nonces: Map<string, number>,
  messageId: string,
): number {
  const next = (nonces.get(messageId) ?? 0) + 1;
  nonces.set(messageId, next);
  return next;
}

/** The open conversation, or just the selected message while it has no loaded thread. */
function conversationOrMessage(
  conversation: JmapEmailMessage[],
  message: JmapEmailMessage | null,
): JmapEmailMessage[] {
  return conversation.length > 0 || !message ? conversation : [message];
}

const PROTECTED_ROLES = new Set([
  "inbox",
  "sent",
  "drafts",
  "trash",
  "junk",
  "spam",
]);

export function useMailApp() {
  const { data: session, isPending: isSessionPending } = useSession();
  const router = useSmoothRouter();
  const queryClient = useQueryClient();
  const { recordUsage } = useRecentContacts();
  const { settings } = useSettings();
  const timeFormat = useUserTimeFormat();
  const quoteDateOptions: QuotedDateOptions = { timeFormat, timezone: settings?.timezone };

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
  const hasAttemptedAutoOpenRef = useRef(false);
  const [attemptedMailboxOpenEpoch, setAttemptedMailboxOpenEpoch] = useState<
    string | null
  >(null);
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
  const mailboxOpenEpoch = `${accountUserId}:${mailboxStatus?.provisioned ? "1" : "0"}:${cachedAuthPassword ? "1" : "0"}`;
  const hasAttemptedMailboxOpen =
    attemptedMailboxOpenEpoch === mailboxOpenEpoch;

  useEffect(() => {
    activeMailboxRef.current = activeMailbox;
  }, [activeMailbox]);

  // Init password from encrypted cookie (cross-tab / post-refresh)
  useEffect(() => {
    void initEncPasswordFromCookie()
      .then(() => {
        const pw = peekCachedAuthPassword();
        if (pw) setCachedAuthPassword(pw);
      })
      .catch((error) => {
        log.warn("Failed to restore the encrypted password cookie", error);
      });
  }, []);

  const hasSession = Boolean(session?.user);
  const redirectToLogin = useEffectEvent(() => {
    if (isAuthNavigationPending()) return;
    const currentPath =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : "/mail";
    router.startRouteTransition({ messageContext: "AUTH_FLOW" });
    completeAuthNavigation(`/login?next=${encodeURIComponent(currentPath)}`);
  });

  useEffect(() => {
    if (!isSessionPending && !hasSession) {
      redirectToLogin();
    }
  }, [isSessionPending, hasSession]);

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

  // Warm mail token + JMAP discovery + vault key as soon as session/config exist.
  useEffect(() => {
    if (isSessionPending || !session?.user?.id || !config) {
      return;
    }
    ensureMailOpenPrefetch({
      userId: session.user.id,
      config,
    });
  }, [config, isSessionPending, session?.user?.id]);

  const selectedMailboxMessage = selectedMessageId
    ? (activeMailbox?.messages.find((m) => m.id === selectedMessageId) ??
      listThreadRelatedMessages.find((m) => m.id === selectedMessageId) ??
      findCachedMailMessage(queryClient, selectedMessageId) ??
      null)
    : null;
  const serverConversationMessages = mergeConversationSourceMessages(
    activeMailbox?.messages ?? [],
    relatedConversationMessages,
  );
  const conversationSourceMessages = mergeConversationSourceMessages(
    serverConversationMessages,
    optimisticConversationMessages.filter(
      (optimisticMessage) =>
        !serverConversationMessages.some((serverMessage) =>
          messagesLikelyMatch(serverMessage, optimisticMessage),
        ),
    ),
  );
  const anchoredConversation = getConversationForMessage(
    conversationSourceMessages,
    selectedConversationMessageId ?? selectedMessageId,
  );
  const selectedConversationMessages = conversationOrMessage(
    anchoredConversation,
    selectedMailboxMessage,
  );
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
    if (
      isCurrentUserMailAddress(sender.email, mailbox.email) ||
      isAutomatedMailAddress(sender.email)
    ) {
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

  const handleSelectMessageId = (messageId: string | null) => {
    setSelectedMessageId(messageId);
    setSelectedConversationMessageId(null);
  };

  const openMessageById = async (
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
      setActiveMailbox((current) => {
        if (!current) return current;
        if (current.messages.some((message) => message.id === cached.id)) {
          return current;
        }
        if (!messageBelongsToMailbox(cached, current.selectedMailboxId)) {
          return current;
        }
        return {
          ...current,
          messages: sortMessages(
            mergeConversationSourceMessages(current.messages, [cached]),
          ),
        };
      });
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
      setActiveMailbox((current) => {
        if (!current) return current;
        if (current.messages.some((entry) => entry.id === message.id)) {
          return current;
        }
        if (!messageBelongsToMailbox(message, current.selectedMailboxId)) {
          return current;
        }
        return {
          ...current,
          messages: sortMessages(
            mergeConversationSourceMessages(current.messages, [message]),
          ),
        };
      });
      handleSelectMessageId(message.id);
    } catch (error) {
      log.error("Failed to open message by id", error);
      toast.error(getErrorMessage(error, "Could not open that message."));
    }
  };

  const handleSelectConversationMessageId = (messageId: string) => {
    setSelectedConversationMessageId(messageId);
  };

  const appendConversationMessage = (message: JmapEmailMessage) => {
    setOptimisticConversationMessages((current) =>
      mergeConversationSourceMessages(current, [message]),
    );
  };

  const loadConversationThread = async (threadId: string) => {
    const mb = activeMailboxRef.current;
    if (!mb) {
      setRelatedConversationMessages([]);
      setIsConversationLoading(false);
      return;
    }

    setIsConversationLoading(true);
    const fetchThread = async () => {
      const messages = await mb.client.getThreadMessages(mb.session, threadId);
      // Prefer local keywords so optimistic $seen isn't wiped by the thread fetch.
      const localById = new Map(
        (activeMailboxRef.current?.messages ?? []).map((message) => [
          message.id,
          message,
        ]),
      );
      setRelatedConversationMessages(
        messages.map((message) => {
          const local = localById.get(message.id);
          return local
            ? mergeMailMessagePreservingKeywords(local, message)
            : message;
        }),
      );
    };
    await fetchThread().catch((error: unknown) => {
      log.warn("Failed to load thread messages", error);
      setRelatedConversationMessages([]);
    });
    setIsConversationLoading(false);
  };

  const clearConversationThread = () => {
    setRelatedConversationMessages([]);
    setIsConversationLoading(false);
  };

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

  const syncConversationThread = useEffectEvent((messageId: string | null) => {
    if (!messageId || !activeMailboxRef.current) {
      clearConversationThread();
      return;
    }

    // Read activeMailbox via ref so keyword/flag updates don't refetch the thread (threadId is stable per message).
    const selectedMsg =
      activeMailboxRef.current.messages.find((m) => m.id === messageId) ??
      findCachedMailMessage(queryClient, messageId);
    const threadId = selectedMsg?.threadId;

    if (threadId) {
      void loadConversationThread(threadId);
    } else {
      clearConversationThread();
    }
  });

  useEffect(() => {
    syncConversationThread(selectedMessageId);
  }, [selectedMessageId]);

  const applyLoadedMessage = useEffectEvent((message: JmapEmailMessage) => {
    const mergeBody = (
      existing: JmapEmailMessage,
      incoming: JmapEmailMessage,
    ) => mergeMailMessagePreservingKeywords(existing, incoming);

    const existingCached = findCachedMailMessage(queryClient, message.id);
    const forCache = existingCached
      ? mergeBody(existingCached, message)
      : message;
    mergeMessageIntoMailboxCaches(queryClient, forCache);

    setActiveMailbox((current) => {
      if (!current) {
        return current;
      }

      const exists = current.messages.some((entry) => entry.id === message.id);
      if (exists) {
        return {
          ...current,
          messages: current.messages.map((entry) =>
            entry.id === message.id ? mergeBody(entry, message) : entry,
          ),
        };
      }
      if (!messageBelongsToMailbox(forCache, current.selectedMailboxId)) {
        return current;
      }
      return {
        ...current,
        messages: sortMessages(
          mergeConversationSourceMessages(current.messages, [forCache]),
        ),
      };
    });
    setRelatedConversationMessages((current) =>
      current.map((entry) =>
        entry.id === message.id ? mergeBody(entry, message) : entry,
      ),
    );
    setListThreadRelatedMessages((current) =>
      current.map((entry) =>
        entry.id === message.id ? mergeBody(entry, message) : entry,
      ),
    );
  });

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

    void fetchMailMessageById(queryClient, {
      client: mailbox.client,
      session: mailbox.session,
      messageId: bodyTargetMessageId,
      requireBody: true,
    })
      .then((message) => {
        if (!cancelled) applyLoadedMessage(message);
      })
      .catch((error) => {
        if (cancelled) return;
        log.error("Failed to load message body", error);
        toast.error(getErrorMessage(error, "Could not load message content."));
      })
      .finally(() => {
        if (!cancelled) {
          setIsMessageBodyLoading(false);
        }
      })
      .catch((error) => {
        log.error("Failed to load message body", error);
      });

    return () => {
      cancelled = true;
    };
  }, [
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
    })
      .then(() => {
        if (cancelled) return;
        for (const messageId of neighborIds) {
          const loaded = findCachedMailMessage(queryClient, messageId);
          if (loaded && messageHasLoadedBody(loaded)) {
            applyLoadedMessage(loaded);
          }
        }
      })
      .catch((error) => {
        log.warn("Failed to prefetch message bodies", error);
      });

    return () => {
      cancelled = true;
    };
  }, [queryClient, selectedMessageId]);

  // Fetch sent messages once per mailbox to augment thread grouping without hitting rate limits.
  useEffect(() => {
    const mailbox = activeMailboxRef.current;
    if (!mailbox || !mailbox.selectedMailboxId) {
      setListThreadRelatedMessages([]);
      return;
    }

    if (threadPrefetchedMailboxRef.current === mailbox.selectedMailboxId) return;
    threadPrefetchedMailboxRef.current = mailbox.selectedMailboxId;

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

  // Only re-decrypt on message identity or E2EE config changes; keyword updates never change encryption state.
  const syncSelectedMessageDecryption = useEffectEvent(
    (isCancelled: () => boolean) => {
      const mailbox = activeMailboxRef.current;
      if (!selectedMessage || !mailbox) {
        queueMicrotask(() => {
          if (isCancelled()) return;
          setSelectedMessagePlaintext(null);
          setSelectedMessageDecryptedHtml(null);
          setSelectedMessageDecryptedAttachments(null);
          setSelectedMessageSignatureVerificationState("not_signed");
          setSelectedMessageDecryptError(null);
          setSelectedMessageIsDecrypting(false);
        });
        return;
      }
      if (!selectedMessageBodyLoaded) {
        return;
      }
      const encState = classifyMessageEncryption(selectedMessage);
      if (encState !== "inline_pgp" && encState !== "pgp_mime") {
        queueMicrotask(() => {
          if (isCancelled()) return;
          setSelectedMessagePlaintext(null);
          setSelectedMessageDecryptedHtml(null);
          setSelectedMessageDecryptedAttachments(null);
          setSelectedMessageSignatureVerificationState("not_signed");
          setSelectedMessageDecryptError(null);
          setSelectedMessageIsDecrypting(false);
        });
        return;
      }
      queueMicrotask(() => {
        if (isCancelled()) return;
        setSelectedMessageIsDecrypting(true);
        setSelectedMessageDecryptError(null);
        setSelectedMessageDecryptedAttachments(
          encState === "pgp_mime" ? [] : null,
        );
      });
      void (async () => {
        let armoredMessage: string;
        if (encState === "inline_pgp") {
          armoredMessage = await resolveInlinePgpArmoredCiphertext({
            message: selectedMessage,
            fetchBlob: (blobId) =>
              mailbox.client.getBlobAsText(mailbox.session, blobId),
          });
        } else {
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
        if (isCancelled()) return;
        const senderEmail = selectedMessage.from?.[0]?.email;
        let senderPublicKeyArmored: string | undefined;
        if (
          senderEmail &&
          config &&
          senderEmail.endsWith(`@${config.defaultDomain}`)
        ) {
          const senderKey = await mailDemoApiService
            .getRecipientKey(senderEmail)
            .catch(() => null);
          senderPublicKeyArmored = senderKey?.publicKeyArmored;
        }
        const decrypted = await mailCryptoWorkerClient.decryptMessage({
          armoredMessage,
          senderPublicKeyArmored,
        });
        if (isCancelled()) return;
        const parsed = await parseDecryptedMailContent(
          decrypted.plaintext,
        ).catch((parseError: unknown) => {
          log.warn("Failed to parse decrypted MIME", parseError);
          return null;
        });
        if (!parsed) {
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
      })().catch((error: unknown) => {
        if (isCancelled()) return;
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
      });
    },
  );

  useEffect(() => {
    let cancelled = false;
    syncSelectedMessageDecryption(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [selectedMessage?.id, selectedMessageBodyLoaded, config]);

  const selectedDecryptedPreview = selectedMessagePlaintext || selectedMessageDecryptedHtml
    ? {
      text: selectedMessagePlaintext,
      html: selectedMessageDecryptedHtml,
    }
    : null;

  const conversationDecryptedPreviews = useConversationDecryptedPreviews({
    messages: selectedConversationMessages,
    client: activeMailbox?.client,
    session: activeMailbox?.session,
    config,
    selectedMessageId: selectedMessage?.id ?? null,
    selectedDecrypted: selectedDecryptedPreview,
  });

  const loadSelectedCalendarAttachments = useEffectEvent(
    (isCancelled: () => boolean) => {
      const mailbox = activeMailboxRef.current;
      if (!selectedMessage || !mailbox || !selectedMessageBodyLoaded) {
        return;
      }

      const encState = classifyMessageEncryption(selectedMessage);
      if (encState !== "plain") {
        return;
      }

      const candidates = listCalendarAttachmentCandidates(selectedMessage);
      queueMicrotask(() => {
        if (!isCancelled()) {
          setSelectedMessageDecryptedAttachments(
            candidates.length > 0 ? [] : null,
          );
        }
      });
      if (candidates.length === 0) {
        return;
      }
      void Promise.all(
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
      )
        .then((loaded) => {
          if (!isCancelled()) {
            setSelectedMessageDecryptedAttachments(loaded);
          }
        })
        .catch((error: unknown) => {
          if (!isCancelled()) {
            log.warn("Failed to load calendar invite attachment", error);
            setSelectedMessageDecryptedAttachments(null);
          }
        });
    },
  );

  useEffect(() => {
    let cancelled = false;
    loadSelectedCalendarAttachments(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [selectedMessage?.id, selectedMessageBodyLoaded]);

  useEffect(() => {
    if (!selectedMessageId) return;
    manualUnreadWhileOpenRef.current = null;

    const mailbox = activeMailboxRef.current;
    if (!mailbox) return;
    const msg =
      mailbox.messages.find((m) => m.id === selectedMessageId) ??
      findCachedMailMessage(queryClient, selectedMessageId);
    if (!msg || msg.keywords?.["$seen"]) return;

    const listSettings = readMailListSettings();
    if (listSettings.markAsReadDelay === "never") return;

    const messageId = selectedMessageId;
    const nonces = autoReadNonceRef.current;
    const nonce = bumpAutoReadNonce(nonces, messageId);
    const delayMs =
      listSettings.markAsReadDelay === "delayed" ? MARK_AS_READ_DELAY_MS : 0;

    const applyOptimisticRead = () => {
      const markRead = (keywords: Record<string, boolean>) => ({
        ...keywords,
        $seen: true,
      });
      setActiveMailbox((cur) =>
        cur
          ? {
            ...cur,
            messages: patchMessagesKeywords(cur.messages, messageId, markRead),
          }
          : cur,
      );
      setRelatedConversationMessages((cur) =>
        patchMessagesKeywords(cur, messageId, markRead),
      );
      setListThreadRelatedMessages((cur) =>
        patchMessagesKeywords(cur, messageId, markRead),
      );
      const cached =
        activeMailboxRef.current?.messages.find((m) => m.id === messageId) ??
        findCachedMailMessage(queryClient, messageId) ??
        msg;
      mergeMessageIntoMailboxCaches(
        queryClient,
        withMessageKeywords(cached, markRead),
      );
    };

    const timer = setTimeout(() => {
      if (autoReadNonceRef.current.get(messageId) !== nonce) return;
      if (manualUnreadWhileOpenRef.current === messageId) return;

      const currentMailbox = activeMailboxRef.current;
      if (!currentMailbox) return;
      const currentMsg =
        currentMailbox.messages.find((m) => m.id === messageId) ??
        findCachedMailMessage(queryClient, messageId);
      if (!currentMsg || currentMsg.keywords?.["$seen"]) return;

      applyOptimisticRead();

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
      bumpAutoReadNonce(nonces, messageId);
    };
  }, [queryClient, selectedMessageId]);

  const refreshMailboxMessages = async (mailboxId: string) => {
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
    }
    setIsBusy(false);
  };

  const loadMoreMessages = async () => {
    if (!activeMailbox?.selectedMailboxId || isLoadingMore) return;
    const position = activeMailbox.messages.length;
    const pageSize = resolveMailboxMessagesPageSize(
      activeMailbox.mailServerPolicy,
      MAILBOX_MESSAGES_PAGE_SIZE,
    );
    if (!hasMoreMailboxMessages(position, totalMessages, pageSize)) return;
    setIsLoadingMore(true);
    const fetchNextPage = async () => {
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
      } else {
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
      }
    };
    await fetchNextPage().catch((error: unknown) => {
      log.error("Failed to load more messages", error);
    });
    setIsLoadingMore(false);
  };

  const handleSignIn = async (passwordOverride?: string) => {
    if (!config || !mailboxStatus || !mailboxEmail) return;
    setIsBusy(true);
    const openMailbox = async () => {
      let email = mailboxEmail.trim().toLowerCase();

      const prefetch = accountUserId
        ? ensureMailOpenPrefetch({
            userId: accountUserId,
            config,
          })
        : null;
      const tokenManager =
        prefetch?.tokenManager ?? createMailOAuthTokenManager(config.oauth);
      const client =
        prefetch?.client ??
        new StalwartJmapClient({
          baseUrl: config.discoveryBaseUrl,
          getAccessToken: () => tokenManager.getAccessToken(),
          onUnauthorized: async () => {
            tokenManager.clear();
            client.clearCachedSession();
            try {
              await tokenManager.getAccessToken();
            } catch (error) {
              log.warn("Could not refresh mail token after unauthorized response", {
                error,
              });
            }
          },
        });

      if (!mailboxStatus.provisioned) {
        // Provisioning mints and seals the vault secret itself, so the server can never read a new mailbox.
        const provisioned = await bootstrapMailboxForAccount({
          email: accountEmail,
          displayName: accountDisplayName,
          userId: accountUserId,
        });
        email = provisioned.mailbox.email.trim().toLowerCase();
        queryClient.setQueryData(
          mailQueryKeys.accountStatus(accountUserId),
          {
            email: provisioned.mailbox.email,
            displayName: provisioned.mailbox.displayName,
            provisioned: true,
          },
        );
        // Fresh vault KDF params invalidate any pre-provision derived key.
        if (accountUserId) {
          await deleteStoredDerivedVaultKey(accountUserId).catch(() => undefined);
        }
      }

      const [jmapSession, backup] = await Promise.all([
        (prefetch?.discoveryPromise ?? Promise.reject()).catch(() =>
          client.discoverSession(),
        ),
        loadMailVaultBackup(email),
      ]);

      // JMAP bootstrap only needs the session, so overlap it with vault unlock to keep argon2/AES off the critical path.
      const bootstrapPromise = client.bootstrapMailboxState(jmapSession);

      const { unlockedVault, effectivePassphrase } =
        await unlockMailVaultBackup(backup, accountUserId);

      const bootstrap = await bootstrapPromise;
      const {
        accountSettings,
        emailSettings,
        jmapSettings,
        mailboxes,
        identities,
      } = bootstrap;
      const stalwartPolicy = { emailSettings, jmapSettings };

      // Not on the critical path for showing inbox.
      void client.ensureEncryptOnAppendDisabled(jmapSession).catch((error) => {
        log.warn("Failed to disable Stalwart encryptOnAppend on sign-in", error);
      });

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
      const [, inboxResult] = await Promise.all([
        mailCryptoWorkerClient.loadVault({
          privateKeyArmored: unlockedVault.encryptedPrivateKeyArmored,
          privateKeyPassphrase: effectivePassphrase,
          publicKeyArmored: unlockedVault.publicKeyArmored,
        }),
        initialMailboxId
          ? client.getMailboxMessages(jmapSession, initialMailboxId, {
              limit: mailboxPageSize,
            })
          : Promise.resolve({
              messages: [] as JmapEmailMessage[],
              total: 0,
            }),
      ]);
      const { messages, total: initialTotal } = inboxResult;
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
    };
    await openMailbox().catch((error: unknown) => {
      log.error("Mail sign-in failed", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not open the mailbox.",
      );
    });
    setIsBusy(false);
  };

  const autoOpenMailbox = useEffectEvent(() => handleSignIn());

  useEffect(() => {
    if (!session?.user || isSessionPending || isMailboxStatusLoading) {
      return;
    }
    if (!config) {
      return;
    }
    if (isBusy || activeMailbox || hasAttemptedAutoOpenRef.current) {
      return;
    }

    hasAttemptedAutoOpenRef.current = true;
    queueMicrotask(() => {
      setAttemptedMailboxOpenEpoch(mailboxOpenEpoch);
      if (mailboxStatus) {
        void autoOpenMailbox().catch((error) => {
          log.error("Mail sign-in failed", error);
        });
      }
    });
  }, [
    activeMailbox,
    config,
    isBusy,
    isMailboxStatusLoading,
    isSessionPending,
    mailboxStatus,
    mailboxOpenEpoch,
    session?.user,
  ]);

  const refreshActiveMailboxPolicy = async (
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
  };

  const handleComposeImageUpload = async (file: File): Promise<InlineImageUpload | null> => {
    if (!activeMailbox) return null;
    const uploadImage = async () => {
      const contentType = file.type || "application/octet-stream";
      const [uploaded, dataUrl, content] = await Promise.all([
        activeMailbox.client.uploadBlob(
          activeMailbox.session,
          file,
          contentType,
        ),
        readBlobAsDataUrl(file),
        file.arrayBuffer().then((buffer) => new Uint8Array(buffer)),
      ]);
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
    };
    return uploadImage().catch((error: unknown) => {
      log.error("Inline image upload failed", error);
      toast.error(`Failed to upload ${file.name}`);
      return null;
    });
  };

  const handleSendMessage = async (options?: { skipAttachmentCheck?: boolean }) => {
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

    const draftsMailboxId = getPrimaryMailboxId(
      activeMailbox.mailboxes,
      "drafts",
    );
    const sentMailboxId = getPrimaryMailboxId(
      activeMailbox.mailboxes,
      "sent",
    );
    const identity =
      activeMailbox.identities.find(
        (entry) => entry.id === composeIdentityId,
      ) ?? activeMailbox.identities[0];
    const identityId = identity?.id;
    if (!draftsMailboxId || !identityId) {
      toast.error("This mailbox is missing a draft mailbox or sending identity.");
      return;
    }

    setIsBusy(true);
    if (!plainTextMode) {
      await waitForQuotedInlineImageHydration();
      if (htmlHasUnhydratedInlinePlaceholders(composeHtmlBody)) {
        toast.error("Inline images are still loading. Try again in a moment.");
        setIsBusy(false);
        return;
      }
    }
    const send = async () => {
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

      const fromEmail = identity.email;
      const fromName = identity.name ?? null;
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
      // Reload only the thread; realtime sync updates the inbox so the sent draft never flashes there.
      if (effectiveThreadId) {
        void loadConversationThread(effectiveThreadId);
      }
    };
    await send().catch((error: unknown) => {
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
    });
    setIsBusy(false);
  };

  const handleDeleteMessage = async (messageId?: string) => {
    const targetId = messageId ?? selectedMessageId;
    if (!activeMailbox || !targetId) return;
    const trashMailbox = activeMailbox.mailboxes.find(
      (m) => m.role === "trash",
    );
    const isInTrash = activeMailbox.selectedMailboxId === trashMailbox?.id;

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
      }
      setIsBusy(false);
      return;
    }

    const targetMessage = activeMailbox.messages.find((m) => m.id === targetId);
    const originalMailboxId = targetMessage?.mailboxIds
      ? Object.entries(targetMessage.mailboxIds).find(([_, v]) => v)?.[0]
      : activeMailbox.selectedMailboxId;
    const remaining = activeMailbox.messages.filter((m) => m.id !== targetId);

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
          if (targetMessage) {
            setActiveMailbox((cur) => {
              if (!cur) return cur;
              const restored = [...cur.messages];
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

    setTimeout(() => {
      if (undone) return;
      void activeMailbox.client
        .moveToTrash(activeMailbox.session, targetId, trashMailbox?.id ?? null)
        .catch((err) => {
          log.error("Failed to move message to trash", err);
        });
    }, undoMs);
  };

  // Seeds quote the body once, so a reply started before it loads would lose the original.
  const selectedMessageBodyPending =
    isMessageBodyLoading && !selectedMessageBodyLoaded;

  const handleReply = () => {
    if (!selectedMessage || selectedMessageBodyPending) return;
    getMailComposeBridge()?.seedReply(
      selectedMessage,
      selectedMessagePlaintext,
    );
  };

  const handleForward = () => {
    if (!selectedMessage || selectedMessageBodyPending) return;
    getMailComposeBridge()?.seedForward(
      selectedMessage,
      selectedMessagePlaintext,
    );
  };

  const handleDraftSaved = (input: {
    savedDraftId: string;
    previousDraftId: string | null;
    preview: JmapEmailMessage;
  }) => {
    if (!activeMailbox) return;
    const draftsMailboxId = getDraftsMailboxId(activeMailbox.mailboxes);
    if (!draftsMailboxId) return;

    replaceSavedDraftInMailboxList(queryClient, {
      draftsMailboxId,
      previousDraftId: input.previousDraftId,
      savedDraft: input.preview,
    });

    setActiveMailbox((current) => {
      if (!current) return current;
      if (current.selectedMailboxId !== draftsMailboxId) {
        return current;
      }
      const withoutPrevious = input.previousDraftId
        ? current.messages.filter((message) => message.id !== input.previousDraftId)
        : current.messages.filter((message) => message.id !== input.savedDraftId);
      const hasSaved = withoutPrevious.some(
        (message) => message.id === input.savedDraftId,
      );
      const messages = hasSaved
        ? withoutPrevious.map((message) =>
          message.id === input.savedDraftId ? input.preview : message,
        )
        : [input.preview, ...withoutPrevious];
      return { ...current, messages };
    });
  };

  const handleEditDraft = async (message: JmapEmailMessage) => {
    if (!activeMailbox) return;
    const bridge = getMailComposeBridge();
    if (!bridge) return;

    let draft = message;
    if (!messageHasLoadedBody(message)) {
      try {
        draft = await fetchMailMessageById(queryClient, {
          client: activeMailbox.client,
          session: activeMailbox.session,
          messageId: message.id,
        });
        mergeMessageIntoMailboxCaches(queryClient, draft);
      } catch (error) {
        log.error("Failed to load draft", error);
        toast.error(getErrorMessage(error, "Could not open this draft."));
        return;
      }
    }

    let overrides: { plaintext?: string | null; html?: string | null } | undefined;
    const encryption = classifyMessageEncryption(draft);
    if (encryption === "inline_pgp" || encryption === "pgp_mime") {
      try {
        const decrypted = await decryptMessageForCompose({
          client: activeMailbox.client,
          session: activeMailbox.session,
          message: draft,
          config,
        });
        overrides = {
          plaintext: decrypted.text,
          html: decrypted.html,
        };
      } catch (error) {
        log.error("Failed to decrypt draft", error);
        toast.error(getErrorMessage(error, "Could not decrypt this draft."));
        return;
      }
    }

    setSelectedMessageId(null);
    bridge.openDraftEditor(draft, overrides);
  };

  const handleDiscardDraft = async (draftId: string) => {
    if (!activeMailbox) return;
    try {
      await activeMailbox.client.moveToTrash(
        activeMailbox.session,
        draftId,
        null,
      );
      setActiveMailbox((current) => {
        if (!current) return current;
        return {
          ...current,
          messages: current.messages.filter((message) => message.id !== draftId),
        };
      });
      setSelectedMessageId((current) => (current === draftId ? null : current));
    } catch (error) {
      log.error("Failed to discard draft", error);
      toast.error(getErrorMessage(error, "Could not discard the draft."));
    }
  };

  const handleQuickReply = async (replyText: string, files: File[] = []) => {
    if (!selectedMessage || !activeMailbox) return;
    if (selectedMessageBodyPending) {
      throw new Error("Wait for the message to finish loading.");
    }
    if (!replyText.trim()) {
      toast.error("Enter a reply message.");
      return;
    }
    const sender = selectedMessage.from?.[0]?.email ?? "";
    const subject = selectedMessage.subject ?? "";
    const { text } = extractMessageBodies(selectedMessage);
    const body = selectedMessagePlaintext ?? text ?? "";
    const date = formatQuotedMailDate(
      selectedMessage.receivedAt,
      quoteDateOptions,
    );
    const replyFrom = resolveMessageReplyFrom(
      activeMailbox.identities,
      selectedMessage,
    );
    const identity =
      activeMailbox.identities.find(
        (entry) => entry.id === replyFrom?.identityId,
      ) ?? activeMailbox.identities[0];
    const draftsMailboxId = getPrimaryMailboxId(
      activeMailbox.mailboxes,
      "drafts",
    );
    const sentMailboxId = getPrimaryMailboxId(
      activeMailbox.mailboxes,
      "sent",
    );
    const identityId = identity?.id;
    if (!draftsMailboxId || !identityId) {
      toast.error("Missing draft mailbox or sending identity.");
      return;
    }
    setIsBusy(true);
    const sendReply = async () => {
      const mailbox = await refreshActiveMailboxPolicy(activeMailbox, {
        force: true,
      });
      const fromEmail = identity?.email ?? mailbox.email;
      let recipients = resolveMessageReplyRecipients(selectedMessage, {
        mode: "reply",
        fromEmail,
        identities: mailbox.identities,
      }).to;
      if (recipients.length === 0) {
        recipients = resolveConversationReplyRecipients({
          messages: selectedConversationMessages,
          currentUserEmail: mailbox.email,
        });
      }
      if (recipients.length === 0 && sender.trim()) {
        recipients = [normalizeEmailAddress(sender)];
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
          fromEmail,
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
          fromEmail,
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
    };
    await sendReply().catch((error: unknown) => {
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
    });
    setIsBusy(false);
  };

  const handleDownloadAttachment = async (attachment: MailAttachment) => {
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
  };

  const handlePreviewAttachment = async (attachment: MailAttachment) => {
    const previewKind = resolveAttachmentPreviewKind(attachment);
    if (!previewKind) {
      toast.error("Could not preview the attachment.");
      return;
    }
    const showPreview = async () => {
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
    };
    await showPreview().catch((error: unknown) => {
      log.error("Failed to preview attachment", error);
      toast.error("Could not preview the attachment.");
    });
  };

  const loadAttachmentHoverPreview = async (
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
  };

  const closeAttachmentPreview = () => {
    setAttachmentPreview((current) => {
      if (current && "url" in current) {
        URL.revokeObjectURL(current.url);
      }
      attachmentPreviewUrlRef.current = null;
      return null;
    });
  };

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

  const handleMoveMessage = async (targetMailboxId: string, messageId?: string) => {
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

    setTimeout(() => {
      if (undone) return;
      void activeMailbox.client
        .moveToMailbox(activeMailbox.session, targetId, targetMailboxId)
        .catch((err) => {
          log.error("Failed to move message", err);
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
  };

  const handleUntrash = async (messageId?: string) => {
    if (!activeMailbox) return;
    const inboxMailbox = findInboxMailbox(activeMailbox.mailboxes);
    if (!inboxMailbox) {
      toast.error("Inbox mailbox not found.");
      return;
    }
    await handleMoveMessage(inboxMailbox.id, messageId);
  };

  const handleReportSpam = async (messageId?: string) => {
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
  };

  const handleNotSpam = async (messageId?: string) => {
    await handleUntrash(messageId);
  };

  const handleEmptyMailbox = async () => {
    if (!activeMailbox?.selectedMailboxId) return;
    const mailbox = activeMailbox.mailboxes.find(
      (m) => m.id === activeMailbox.selectedMailboxId,
    );
    const role = mailbox?.role;
    if (!isTrashMailboxRole(role) && !isSpamMailboxRole(role)) {
      return;
    }

    setIsBusy(true);
    const emptyMailbox = async () => {
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
    };
    await emptyMailbox().catch((error: unknown) => {
      log.error("Failed to empty mailbox", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not empty the folder.",
      );
    });
    setIsBusy(false);
  };

  const handleReorderMailboxes = async (reordered: JmapMailbox[]) => {
    if (!activeMailbox) return;
    // Stamp each mailbox with its new sortOrder so the sidebar sort stays stable
    const withOrder = reordered.map((m, i) => ({ ...m, sortOrder: i }));
    setActiveMailbox((cur) => (cur ? { ...cur, mailboxes: withOrder } : cur));
    const updates = withOrder.map((m) => ({
      id: m.id,
      sortOrder: m.sortOrder ?? 0,
    }));
    try {
      await activeMailbox.client.updateMailboxSortOrders(
        activeMailbox.session,
        updates,
      );
    } catch (error) {
      log.error("Failed to save mailbox order", error);
    }
  };

  const handleRenameMailbox = async (mailboxId: string, name: string) => {
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
  };

  const handleCreateMailbox = async (name: string) => {
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
    }
    setIsBusy(false);
  };

  const handleDeleteMailbox = async (mailboxId: string) => {
    if (!activeMailbox) return;
    const mailbox = activeMailbox.mailboxes.find((m) => m.id === mailboxId);
    if (!mailbox || PROTECTED_ROLES.has(mailbox.role?.toLowerCase() ?? ""))
      return;
    setIsBusy(true);
    const deleteMailbox = async () => {
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
    };
    await deleteMailbox().catch((error: unknown) => {
      log.error("Failed to delete mailbox", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not delete the mailbox.",
      );
    });
    setIsBusy(false);
  };

  const handleBulkDelete = async (messageIds: string[]) => {
    if (!activeMailbox || messageIds.length === 0) return;
    const trashMailbox = activeMailbox.mailboxes.find(
      (m) => m.role === "trash",
    );
    const isInTrash = activeMailbox.selectedMailboxId === trashMailbox?.id;
    const idSet = new Set(messageIds);
    const remaining = activeMailbox.messages.filter((m) => !idSet.has(m.id));
    setIsBusy(true);
    const deleteMessages = async () => {
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
    };
    await deleteMessages().catch((error: unknown) => {
      log.error("Failed to bulk delete messages", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not delete the messages.",
      );
    });
    setIsBusy(false);
  };

  const handleBulkMove = async (messageIds: string[], targetMailboxId: string) => {
    if (!activeMailbox || messageIds.length === 0) return;
    const idSet = new Set(messageIds);
    const remaining = activeMailbox.messages.filter((m) => !idSet.has(m.id));
    setIsBusy(true);
    const moveMessages = async () => {
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
    };
    await moveMessages().catch((error: unknown) => {
      log.error("Failed to bulk move messages", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not move the messages.",
      );
    });
    setIsBusy(false);
  };

  const handleBulkMarkAsUnread = async (messageIds: string[]) => {
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
  };

  const handleBulkMarkAsRead = async (messageIds: string[]) => {
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
  };

  const handleBulkReportSpam = async (messageIds: string[]) => {
    if (!activeMailbox || messageIds.length === 0) return;
    const spamMailbox = findSpamMailbox(activeMailbox.mailboxes);
    if (!spamMailbox) {
      toast.error("Spam folder not found.");
      return;
    }
    await handleBulkMove(messageIds, spamMailbox.id);
  };

  const handleMarkAsUnread = async (messageId?: string) => {
    const targetId = messageId ?? selectedMessageId;
    if (!activeMailbox || !targetId) return;
    if (targetId === selectedMessageId) {
      manualUnreadWhileOpenRef.current = targetId;
      bumpAutoReadNonce(autoReadNonceRef.current, targetId);
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
  };

  const handleMarkAsRead = async (messageId?: string) => {
    const targetId = messageId ?? selectedMessageId;
    if (!activeMailbox || !targetId) return;
    const msg = activeMailbox.messages.find((m) => m.id === targetId);
    if (!msg || msg.keywords?.["$seen"]) return;
    if (targetId === selectedMessageId) {
      manualUnreadWhileOpenRef.current = null;
      bumpAutoReadNonce(autoReadNonceRef.current, targetId);
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
  };

  const handleRealtimeSync = (result: MailSyncResponse) => {
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
  };

  const handleManualRefresh = async () => {
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
    }
    setIsRefreshing(false);
  };

  const realtimeAccountId = activeMailbox
    ? getPrimaryMailAccountId(activeMailbox.session)
    : null;

  useMailRealtime({
    accountId: realtimeAccountId,
    enabled: Boolean(activeMailbox && session?.user),
    onSync: handleRealtimeSync,
  });

  const handleDisconnect = async () => {
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
    clearMailOpenPrefetch();
  };

  const handleSignOut = async () => {
    const finishNavigation = beginAuthNavigation("/");
    if (!finishNavigation) return;
    await handleDisconnect()
      .then(() => {
        clearEncPasswordCookie();
        return signOut();
      })
      .finally(finishNavigation);
  };

  const patchMessageKeyword = (msg: JmapEmailMessage, keyword: string, enabled: boolean) => {
    const update = (keywords: Record<string, boolean>) => {
      if (enabled) keywords[keyword] = true;
      else delete keywords[keyword];
      return keywords;
    };
    setActiveMailbox((cur) =>
      cur
        ? {
          ...cur,
          messages: patchMessagesKeywords(cur.messages, msg.id, update),
        }
        : cur,
    );
    setRelatedConversationMessages((cur) =>
      patchMessagesKeywords(cur, msg.id, update),
    );
    setListThreadRelatedMessages((cur) =>
      patchMessagesKeywords(cur, msg.id, update),
    );
    mergeMessageIntoMailboxCaches(
      queryClient,
      withMessageKeywords(msg, update),
    );
  };

  const handleSimpleLoginAction = useSimpleLoginAliasAction({
    activeMailbox,
    patchMessageKeyword,
  });

  const handleToggleFlagged = async (messageId?: string) => {
    const targetId = messageId ?? selectedMessageId;
    if (!activeMailbox || !targetId) return;
    const msg =
      activeMailbox.messages.find((m) => m.id === targetId) ??
      listThreadRelatedMessages.find((m) => m.id === targetId) ??
      relatedConversationMessages.find((m) => m.id === targetId) ??
      findCachedMailMessage(queryClient, targetId);
    if (!msg) return;
    const next = !(msg.keywords?.["$flagged"] === true);

    patchMessageKeyword(msg, "$flagged", next);
    try {
      await activeMailbox.client.toggleFlagged(
        activeMailbox.session,
        targetId,
        next,
      );
    } catch (error) {
      log.error("Failed to toggle flag", error);
      toast.error(getErrorMessage(error, "Could not update the star."));
      patchMessageKeyword(msg, "$flagged", !next);
    }
  };

  const handleSetMessageLabel = async (messageId: string, labelId: string, assigned: boolean) => {
    if (!activeMailbox) return;
    const keywordKey = `label:${labelId}`;
    const msg =
      activeMailbox.messages.find((m) => m.id === messageId) ??
      listThreadRelatedMessages.find((m) => m.id === messageId) ??
      relatedConversationMessages.find((m) => m.id === messageId) ??
      findCachedMailMessage(queryClient, messageId);
    if (!msg) return;

    patchMessageKeyword(msg, keywordKey, assigned);
    try {
      await activeMailbox.client.setMessageLabel(
        activeMailbox.session,
        messageId,
        labelId,
        assigned,
      );
    } catch (error) {
      log.error("Failed to set message label", error);
      toast.error(getErrorMessage(error, "Could not update the label."));
      patchMessageKeyword(msg, keywordKey, !assigned);
    }
  };

  const saveLabelsToVault = async (updatedLabels: LabelDef[]) => {
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
  };

  const handleCreateLabel = async (name: string, color: string): Promise<LabelDef | null> => {
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
  };

  const handleDeleteLabel = async (labelId: string) => {
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
  };

  const handleUpdateLabel = async (
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
  };

  const composeMailPolicy = activeMailbox?.mailServerPolicy ??
  resolveMailServerPolicy({ configPolicy: config?.serverLimits ?? null });

  const user = session?.user
    ? {
      name: session.user.name ?? "User",
      email: session.user.email ?? "",
      avatar: resolveAvatarUrl(session.user.image),
    }
    : null;

  return {
    session,
    isSessionPending,
    quoteDateOptions,
    config,
    isBusy,
    mailboxStatus,
    isMailboxStatusLoading,
    hasAttemptedMailboxOpen,
    activeMailbox,
    composeMailPolicy,
    listThreadRelatedMessages,
    selectedMessage,
    selectedMessageId,
    setSelectedMessageId: handleSelectMessageId,
    openMessageById,
    selectedConversationMessages,
    conversationDecryptedPreviews,
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
    handleEditDraft,
    handleDiscardDraft,
    handleDraftSaved,
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
    handleSimpleLoginAction,
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
