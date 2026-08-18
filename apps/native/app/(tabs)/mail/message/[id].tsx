import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppScreen } from "../../../../src/components/layout";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { FontAwesome } from "@expo/vector-icons";
import {
  buildEventReminderMailView,
  enrichSelfMailRecipient,
  getErrorMessage,
  isCurrentUserMailAddress,
  isDecryptedEventReminderContent,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../../../src/providers/ThemeProvider";
import { useToast } from "../../../../src/providers/ToastProvider";
import { QUERY_KEYS } from "../../../../src/lib/query-keys";
import {
  releaseMarkAsReadSuppression,
  suppressMarkAsRead,
  useCachedMessage,
  useMailMutations,
  useMailRuntime,
} from "../../../../src/lib/mail/use-mail";
import {
  formatMessageDate,
  isDraftMessage,
} from "../../../../src/lib/mail/mail-helpers";
import {
  classifyMessageEncryption,
  extractMessageBodies,
  resolveDisplayAttachments,
  resolveInlinePgpArmoredCiphertext,
} from "../../../../src/lib/mail/message-security";
import {
  openCachedAttachment,
  shareCachedAttachment,
  writeAttachmentToCache,
} from "../../../../src/lib/mail/attachment-cache";
import { useConversationThread } from "../../../../src/lib/mail/use-conversation-thread";
import { useConversationDecryptedPreviews } from "../../../../src/lib/mail/use-conversation-decrypted-previews";
import {
  decryptMailMessage,
  decryptPgpMimeMessage,
  type MailDecryptResult,
} from "../../../../src/lib/mail/mail-crypto";
import { HtmlEmailView } from "../../../../src/components/mail/HtmlEmailView";
import { CenteredLoader } from "../../../../src/components/ui/loading";
import { AttachmentPreviewModal } from "../../../../src/components/mail/AttachmentPreviewModal";
import { ConversationThreadStrip } from "../../../../src/components/mail/ConversationThreadStrip";
import { useAuth } from "../../../../src/providers/AuthProvider";
import { useE2ee } from "../../../../src/providers/E2eeProvider";
import {
  BottomSheet,
  BottomSheetHeader,
  BottomSheetTitle,
} from "../../../../src/components/BottomSheet";
import { SheetNavButton, SheetRow } from "../../../../src/components/sheet";
import { MailSheetPanel } from "../../../../src/components/mail/MailSheetPanel";
import { MailSheetList } from "../../../../src/components/mail/MailSheetList";
import {
  MailBottomAction,
  MailBottomActionBar,
  MailBottomActionDivider,
} from "../../../../src/components/mail/MailBottomActionBar";
import { mailBottomBarTotalHeight } from "../../../../src/components/mail/mail-bottom-action-bar-layout";
import { MailReaderHeader } from "../../../../src/components/mail/MailReaderHeader";
import { MailIdentityBadge } from "../../../../src/components/mail/MailIdentityBadge";
import {
  RecipientLink,
  RecipientLinkList,
} from "../../../../src/components/mail/RecipientSheet";
import { mailSpacing } from "../../../../src/components/mail/mail-ui";
import { useRecentContacts } from "../../../../src/hooks/use-recent-contacts";
import {
  getMailboxDisplayName,
  getMailboxIcon,
  isSpamMailboxRole,
} from "../../../../src/lib/mail/mail-helpers";

import {
  resolveAttachmentPreviewKind,
  type MailAttachmentPreviewKind,
} from "../../../../src/lib/mail/attachment-preview";
import type {
  JmapAttachment,
  JmapEmailMessage,
  LabelDef,
} from "../../../../src/lib/mail/types";
import {
  useLabels,
  getAllMessageLabels,
} from "../../../../src/lib/mail/use-labels";
import { MailLabelsSheet } from "../../../../src/components/mail/MailLabelsSheet";
import { sheetBottomPadding } from "../../../../src/components/sheet/sheet-padding";
import { calendarApiService } from "../../../../src/lib/api";
import {
  extractLinkedCalendarEventId,
  extractReminderLeadMinutes,
  getCalendarEventLinkSource,
  isSolaceEventReminderEmail,
} from "../../../../src/lib/mail/calendar-event-link";
import { EventReminderBanner } from "../../../../src/components/mail/EventReminderBanner";
import { CalendarInviteBanner } from "../../../../src/components/mail/CalendarInviteBanner";
import { EventReminderMessageBody } from "../../../../src/components/mail/EventReminderMessageBody";
import { EventReminderMessageBodyLoading } from "../../../../src/components/mail/EventReminderMessageBodyLoading";
import { MessageDecryptingSkeleton } from "../../../../src/components/mail/MessageDecryptingLoader";
import { useMailCalendarInvitation } from "../../../../src/hooks/use-mail-calendar-invitation";

type MessageSheetView = "menu" | "move" | "label" | "html" | null;

export default function MailMessageScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const sheetPad = sheetBottomPadding(insets.bottom);
  const mailPad = mailSpacing(theme);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const scrollBottomPad =
    theme.spacing["6"] + mailBottomBarTotalHeight(insets.bottom);
  const { toast } = useToast();
  const { user } = useAuth();
  const { isReady: isE2eeReady } = useE2ee();
  const { id } = useLocalSearchParams<{ id: string }>();
  const messageId = typeof id === "string" ? id : "";

  const runtimeQuery = useMailRuntime(true);
  const runtime = runtimeQuery.data;
  const { labels, createLabel, deleteLabel, refreshLabels } = useLabels({
    runtime,
    enabled: Boolean(runtime),
  });
  const cached = useCachedMessage(messageId);

  const {
    data: messageData,
    isLoading: isMessageLoading,
    isError: isMessageError,
    error: messageError,
  } = useQuery<JmapEmailMessage | null>({
    queryKey: QUERY_KEYS.mailMessage(messageId),
    enabled: Boolean(messageId) && (Boolean(cached) || Boolean(runtime)),
    initialData: cached ?? undefined,
    queryFn: async () => {
      if (cached) return cached;
      const list = await runtime!.client.getMessagesByIds(runtime!.session, [
        messageId,
      ]);
      return list[0] ?? null;
    },
  });

  const message = messageData ?? null;
  const { recordUsage } = useRecentContacts();
  const recordedContactMessageRef = useRef<string | null>(null);

  useEffect(() => {
    const sender = message?.from?.[0];
    const accountEmail = runtime?.session?.username;
    if (!message || !sender?.email || !accountEmail) {
      return;
    }
    if (isCurrentUserMailAddress(sender.email, accountEmail)) {
      return;
    }

    const recordKey = `${message.id}:${sender.email}`;
    if (recordedContactMessageRef.current === recordKey) {
      return;
    }
    recordedContactMessageRef.current = recordKey;
    recordUsage(
      [{ email: sender.email, displayName: sender.name ?? undefined }],
      "mail",
    );
  }, [message, recordUsage, runtime?.session?.username]);

  useEffect(() => {
    if (!message || !runtime) return;
    if (isDraftMessage(message, null, runtime.mailboxes)) {
      router.replace(
        `/(tabs)/mail/compose?mode=draft&messageId=${message.id}` as never,
      );
    }
  }, [message, router, runtime]);

  const { conversationMessages, isLoading: isConversationLoading } =
    useConversationThread(runtime, message);
  const {
    markAsRead,
    markAsUnread,
    toggleFlagged,
    moveToTrash,
    deleteMessage,
    moveToMailbox,
    setMessageLabel,
  } = useMailMutations(runtime, null);
  const skipMarkReadRef = useRef(false);
  const bodies = message ? extractMessageBodies(message) : null;
  const encryption = message ? classifyMessageEncryption(message) : "plain";
  const isEncrypted = encryption !== "plain";

  const {
    data: decryptResult,
    isSuccess: isDecryptSuccess,
    isLoading: isDecryptLoading,
    isFetching: isDecryptFetching,
    error: decryptQueryError,
    refetch: refetchDecrypt,
  } = useQuery<MailDecryptResult>({
    queryKey: QUERY_KEYS.mailDecrypted(messageId),
    enabled: isEncrypted && Boolean(runtime) && Boolean(message),
    retry: 1,
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!runtime || !message)
        throw new Error("Runtime or message not available");
      if (encryption === "inline_pgp") {
        const armoredMessage = await resolveInlinePgpArmoredCiphertext({
          message,
          fetchBlob: (blobId) =>
            runtime.client.getBlobAsText(runtime.session, blobId),
        });
        return decryptMailMessage(runtime, messageId, armoredMessage);
      }
      if (encryption === "pgp_mime") {
        return decryptPgpMimeMessage(runtime, messageId, message.bodyStructure);
      }
      throw new Error(`Unsupported encryption type: ${encryption}`);
    },
  });

  const selectedDecryptedPreview = useMemo(
    () =>
      decryptResult
        ? { text: decryptResult.plaintext, html: decryptResult.html }
        : null,
    [decryptResult],
  );

  const conversationPreviews = useConversationDecryptedPreviews(
    runtime,
    conversationMessages,
    {
      messageId,
      decrypted: selectedDecryptedPreview,
    },
  );

  // After decrypt unlocks the vault, refresh label names/colors from the vault backup.
  useEffect(() => {
    if (isDecryptSuccess) {
      refreshLabels();
    }
  }, [isDecryptSuccess, refreshLabels]);

  // Mark unread messages as read once per visit (not when the user marks unread mid-session).
  useEffect(() => {
    if (!runtime || !messageId || skipMarkReadRef.current) return;
    if (message?.keywords?.["$seen"]) return;
    markAsRead.mutate(messageId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when opening this message
  }, [messageId, runtime]);

  useEffect(() => {
    skipMarkReadRef.current = false;
    return () => {
      releaseMarkAsReadSuppression(messageId);
    };
  }, [messageId]);

  const htmlContent: string | null =
    decryptResult?.html ?? (isEncrypted ? null : (bodies?.html ?? null));
  const plainContent: string | null =
    decryptResult?.plaintext ??
    (isEncrypted ? null : (bodies?.text ?? null));
  const calendarEventLinkSource = useMemo(
    () => (message ? getCalendarEventLinkSource(message, plainContent) : null),
    [message, plainContent],
  );
  const linkedCalendarEventId = useMemo(
    () => (message ? extractLinkedCalendarEventId(message, plainContent) : null),
    [message, plainContent],
  );
  const isHtmlEmail = Boolean(htmlContent);
  const isDecrypting =
    isEncrypted && (isDecryptLoading || isDecryptFetching);
  const decryptError = isEncrypted ? decryptQueryError : null;
  const rawHtmlSource = decryptResult?.html ?? bodies?.html ?? null;

  const displayAttachments = useMemo(
    () =>
      resolveDisplayAttachments({
        encryption,
        isDecrypting,
        decryptSucceeded: isDecryptSuccess,
        decryptedAttachments: decryptResult?.attachments,
        messageAttachments: message?.attachments,
      }),
    [
      encryption,
      isDecrypting,
      isDecryptSuccess,
      decryptResult?.attachments,
      message?.attachments,
    ],
  );

  const calendarInvitation = useMailCalendarInvitation({
    message,
    plaintext: plainContent,
    attachments: displayAttachments,
    runtime,
    userId: user?.id,
    enabled: Boolean(message) && !isDecrypting,
  });

  const isEventReminderEmail = useMemo(
    () => {
      if (calendarInvitation.hasCalendarInvitationHint) {
        return false;
      }
      if (
        calendarInvitation.mailCalendarInvite?.method === "REQUEST" ||
        calendarInvitation.mailCalendarInvite?.method === "CANCEL"
      ) {
        return false;
      }
      return calendarEventLinkSource
        ? isSolaceEventReminderEmail(calendarEventLinkSource)
        : false;
    },
    [
      calendarEventLinkSource,
      calendarInvitation.hasCalendarInvitationHint,
      calendarInvitation.mailCalendarInvite?.method,
    ],
  );

  const {
    data: linkedEvent,
    isLoading: isLinkedEventLoading,
    isFetching: isLinkedEventFetching,
    isError: isLinkedEventError,
    isSuccess: isLinkedEventSuccess,
    error: linkedEventError,
  } = useQuery({
    queryKey: QUERY_KEYS.eventDetail(linkedCalendarEventId ?? ""),
    enabled:
      Boolean(linkedCalendarEventId) && isEventReminderEmail && isE2eeReady,
    queryFn: () => calendarApiService.getEvent(linkedCalendarEventId!),
  });
  const { data: userSettings } = useQuery({
    queryKey: QUERY_KEYS.settings(),
    queryFn: () => calendarApiService.getUserSettings(),
    staleTime: 5 * 60_000,
  });
  const eventReminderView = useMemo(() => {
    if (!linkedEvent || !isDecryptedEventReminderContent(linkedEvent)) {
      return null;
    }

    return buildEventReminderMailView({
      event: linkedEvent,
      minutesBefore: calendarEventLinkSource
        ? extractReminderLeadMinutes(calendarEventLinkSource)
        : null,
      timezone: userSettings?.timezone,
      timeFormat: userSettings?.timeFormat,
    });
  }, [calendarEventLinkSource, linkedEvent, userSettings]);
  const isReminderEventLoading =
    isEventReminderEmail &&
    (!isE2eeReady || isLinkedEventLoading || isLinkedEventFetching);
  const shouldReplaceBodyWithEventReminder = Boolean(
    isEventReminderEmail && eventReminderView && isLinkedEventSuccess,
  );

  const formattedInviteStart = useMemo(() => {
    const start = calendarInvitation.mailCalendarInvite?.start;
    if (!start) return null;

    return start.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      hour12:
        userSettings?.timeFormat === "12h"
          ? true
          : userSettings?.timeFormat === "24h"
            ? false
            : undefined,
      timeZone: userSettings?.timezone ?? undefined,
    });
  }, [calendarInvitation.mailCalendarInvite?.start, userSettings]);

  const [downloadingBlobId, setDownloadingBlobId] = useState<string | null>(
    null,
  );
  const [preview, setPreview] = useState<{
    attachment: JmapAttachment;
    kind: MailAttachmentPreviewKind;
  } | null>(null);
  const [activeSheetView, setActiveSheetView] =
    useState<MessageSheetView>(null);

  const currentMailboxId = message
    ? (Object.keys(message.mailboxIds ?? {})[0] ?? null)
    : null;
  const currentMailbox = runtime?.mailboxes.find((mailbox) =>
    currentMailboxId ? mailbox.id === currentMailboxId : false,
  );
  const currentMailboxRole = currentMailbox?.role ?? null;
  const isFlagged = Boolean(message?.keywords?.["$flagged"]);
  const isSeen = Boolean(message?.keywords?.["$seen"]);
  const messageLabels = message ? getAllMessageLabels(message, labels) : [];
  const inboxMailboxId =
    runtime?.mailboxes.find((mailbox) => mailbox.role === "inbox")?.id ?? null;
  const archiveMailboxId =
    runtime?.mailboxes.find((mailbox) => mailbox.role === "archive")?.id ??
    null;
  const moveTargets = useMemo(() => {
    if (!runtime || !message) {
      return [];
    }

    const activeMailboxIds = new Set(Object.keys(message.mailboxIds ?? {}));
    return runtime.mailboxes.filter(
      (mailbox) => !activeMailboxIds.has(mailbox.id),
    );
  }, [message, runtime]);
  const isActionBusy =
    markAsUnread.isPending ||
    toggleFlagged.isPending ||
    moveToTrash.isPending ||
    deleteMessage.isPending ||
    moveToMailbox.isPending;
  const cacheAttachment = async (
    attachment: JmapAttachment,
    cacheKey: string,
  ) =>
    writeAttachmentToCache({
      attachment,
      cacheKey,
      runtime,
    });

  const handleOpenAttachment = async (
    attachment: JmapAttachment,
    cacheKey: string,
  ) => {
    const kind = resolveAttachmentPreviewKind({
      name: attachment.name,
      type: attachment.type,
    });

    if (kind) {
      setPreview({ attachment, kind });
      return;
    }

    // No inline preview available — download then share/open externally.
    setDownloadingBlobId(cacheKey);
    try {
      const cached = await cacheAttachment(attachment, cacheKey);
      await shareCachedAttachment(cached);
    } catch (err) {
      toast(getErrorMessage(err, "Could not download attachment."), "error");
    } finally {
      setDownloadingBlobId(null);
    }
  };

  const handleReply = () => {
    if (!messageId) return;
    router.push({
      pathname: "/(tabs)/mail/compose",
      params: { mode: "reply", messageId },
    });
  };

  const handleForward = () => {
    if (!messageId) return;
    setActiveSheetView(null);
    router.push({
      pathname: "/(tabs)/mail/compose",
      params: { mode: "forward", messageId },
    });
  };

  const handleToggleStar = () => {
    if (!message) return;
    toggleFlagged.mutate({
      messageId: message.id,
      flagged: !isFlagged,
    });
    toast(isFlagged ? "Unstarred" : "Starred");
    setActiveSheetView(null);
  };

  const handleMarkUnread = () => {
    if (!message) return;
    skipMarkReadRef.current = true;
    suppressMarkAsRead(message.id);
    setActiveSheetView(null);
    markAsUnread.mutate(message.id, {
      onSuccess: () => toast("Marked as unread"),
      onError: (error) =>
        toast(
          getErrorMessage(error, "Failed to mark message as unread."),
          "error",
        ),
    });
  };

  const handleMoveToTrash = () => {
    if (!message) return;
    setActiveSheetView(null);
    const mutation =
      currentMailboxRole === "trash" ? deleteMessage : moveToTrash;
    const successMessage =
      currentMailboxRole === "trash"
        ? "Message deleted"
        : "Message moved to trash";
    mutation.mutate(message.id, {
      onSuccess: () => {
        toast(successMessage);
        router.back();
      },
      onError: (error) =>
        toast(
          getErrorMessage(
            error,
            currentMailboxRole === "trash"
              ? "Failed to delete the message."
              : "Failed to move message to trash.",
          ),
          "error",
        ),
    });
  };

  const handleMoveToMailbox = (targetMailboxId: string) => {
    if (!message) return;
    moveToMailbox.mutate(
      { messageId: message.id, targetMailboxId },
      {
        onSuccess: () => {
          setActiveSheetView(null);
          toast("Message moved");
          router.back();
        },
        onError: (error) =>
          toast(getErrorMessage(error, "Failed to move the message."), "error"),
      },
    );
  };

  const respondToCalendarInvite = (
    status: "accepted" | "declined" | "tentative",
  ) => {
    void calendarInvitation.handleInvitationResponse(status).then((result) => {
      if (result.ok) {
        toast(result.message, "success");
        return;
      }
      toast(result.error, "error");
    });
  };

  const handleArchive = () => {
    if (!archiveMailboxId) {
      toast("No archive mailbox is configured", "info");
      return;
    }
    handleMoveToMailbox(archiveMailboxId);
  };

  const handleRestoreToInbox = () => {
    if (!inboxMailboxId) {
      toast("No inbox mailbox is configured for this account", "info");
      return;
    }
    handleMoveToMailbox(inboxMailboxId);
  };

  const accountEmail =
    user?.email?.trim().toLowerCase() ??
    runtime?.session.username?.trim().toLowerCase() ??
    undefined;
  const accountName = user?.name?.trim() || undefined;
  const enrichedFrom = message?.from?.[0]
    ? enrichSelfMailRecipient(message.from[0], {
        email: accountEmail,
        name: accountName,
      })
    : null;

  const messageHeader = message ? (
    <>
      <View style={styles.subjectRow}>
        <Text style={styles.subject}>
          {message.subject?.trim() || "(no subject)"}
        </Text>
        <Pressable
          onPress={handleToggleStar}
          disabled={toggleFlagged.isPending}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={isFlagged ? "Unstar" : "Star"}
        >
          <FontAwesome
            name={isFlagged ? "star" : "star-o"}
            size={18}
            color={isFlagged ? "#fbbf24" : theme.colors.mutedForeground}
            style={!isFlagged ? { opacity: 0.4 } : undefined}
          />
        </Pressable>
      </View>

      {messageLabels.length > 0 ? (
        <View style={styles.labelRow}>
          {messageLabels.map((label) => (
            <View
              key={label.id}
              style={[
                styles.labelChip,
                {
                  borderColor: `${label.color}50`,
                  backgroundColor: `${label.color}18`,
                },
              ]}
            >
              <View
                style={[styles.labelDot, { backgroundColor: label.color }]}
              />
              <Text
                style={[styles.labelText, { color: label.color }]}
                numberOfLines={1}
              >
                {label.name}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.metaBlock}>
        {message.from?.[0] ? (
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>From</Text>
            <View style={styles.metaValueRow}>
              <RecipientLink
                recipient={enrichedFrom ?? message.from[0]}
                currentUserEmail={accountEmail}
                currentUserName={accountName}
                textStyle={styles.metaLink}
                showInlineAddress
              />
              <MailIdentityBadge
                message={message}
                identities={runtime?.identities ?? []}
              />
            </View>
          </View>
        ) : (
          <MetaRow theme={theme} label="From" value="Unknown sender" />
        )}
        {message.to?.length ? (
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>To</Text>
            <View style={styles.metaValueWrap}>
              <RecipientLinkList
                recipients={message.to}
                currentUserEmail={accountEmail}
                currentUserName={accountName}
                textStyle={styles.metaLink}
              />
            </View>
          </View>
        ) : null}
        {message.cc?.length ? (
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Cc</Text>
            <View style={styles.metaValueWrap}>
              <RecipientLinkList
                recipients={message.cc}
                currentUserEmail={accountEmail}
                currentUserName={accountName}
                textStyle={styles.metaLink}
              />
            </View>
          </View>
        ) : null}
        <MetaRow
          theme={theme}
          label="Date"
          value={formatMessageDate(message.receivedAt)}
        />
      </View>

      {displayAttachments.length > 0 ? (
        <View style={styles.attachmentBlock}>
          {displayAttachments.map((attachment, index) => {
            const key = attachment.blobId ?? `inline-${index}`;
            const isDownloading = downloadingBlobId === key;
            const previewKind = resolveAttachmentPreviewKind({
              name: attachment.name,
              type: attachment.type,
            });
            return (
              <Pressable
                key={key}
                onPress={() => handleOpenAttachment(attachment, key)}
                disabled={isDownloading}
                style={({ pressed }) => [
                  styles.attachmentChip,
                  pressed && styles.attachmentChipPressed,
                ]}
              >
                {isDownloading ? (
                  <ActivityIndicator
                    size={13}
                    color={theme.colors.mutedForeground}
                  />
                ) : (
                  <Feather
                    name="paperclip"
                    size={13}
                    color={theme.colors.mutedForeground}
                  />
                )}
                <Text style={styles.attachmentName} numberOfLines={1}>
                  {attachment.name ?? "attachment"}
                </Text>
                {!isDownloading && (
                  <Feather
                    name={previewKind ? "eye" : "download"}
                    size={11}
                    color={theme.colors.mutedForeground}
                  />
                )}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={styles.divider} />
    </>
  ) : null;

  return (
    <AppScreen
      header={
        <MailReaderHeader
          title={message?.subject?.trim() || "Message"}
          mailboxName={currentMailbox?.name}
          mailboxIcon={
            currentMailbox
              ? (getMailboxIcon(
                  currentMailbox,
                ) as keyof typeof Feather.glyphMap)
              : "mail"
          }
        />
      }
    >
      {isMessageLoading && !message ? (
        <CenteredLoader theme={theme} />
      ) : isMessageError && !message ? (
        <View style={styles.centered}>
          <Feather
            name="alert-triangle"
            size={36}
            color={theme.colors.destructive}
          />
          <Text style={styles.mutedText}>
            {getErrorMessage(messageError, "Failed to load message")}
          </Text>
        </View>
      ) : !message ? (
        <View style={styles.centered}>
          <Text style={styles.mutedText}>Message not found.</Text>
        </View>
      ) : (
        <View style={styles.messageBody}>
          <ScrollView
            style={styles.messageScroll}
            contentContainerStyle={[
              styles.body,
              { paddingBottom: scrollBottomPad },
            ]}
          >
            {messageHeader}

            {isConversationLoading ? (
              <ActivityIndicator
                size="small"
                color={theme.colors.mutedForeground}
                style={{ marginBottom: theme.spacing["2"] }}
              />
            ) : (
              <ConversationThreadStrip
                messages={conversationMessages}
                activeMessageId={messageId}
                accountEmail={user?.email ?? runtime?.session.username ?? null}
                previews={conversationPreviews}
                onSelectMessage={(id) => {
                  if (id !== messageId) {
                    router.replace(`/(tabs)/mail/message/${id}` as never);
                  }
                }}
              />
            )}

            {isEventReminderEmail && linkedCalendarEventId ? (
              <EventReminderBanner
                loading={isReminderEventLoading}
                error={
                  isLinkedEventError
                    ? getErrorMessage(
                        linkedEventError,
                        "Unable to load linked event details.",
                      )
                    : null
                }
                reminder={eventReminderView}
                onOpenEvent={() =>
                  router.push(
                    `/event/${linkedCalendarEventId}` as never,
                  )
                }
              />
            ) : null}

            {calendarInvitation.mailCalendarInvite?.method === "REQUEST" ? (
              <CalendarInviteBanner
                invite={calendarInvitation.mailCalendarInvite}
                loading={calendarInvitation.currentCalendarInviteEvent?.loading}
                error={calendarInvitation.currentCalendarInviteEvent?.error}
                inviteDeclined={calendarInvitation.inviteDeclined}
                invitationStatus={calendarInvitation.invitationStatus}
                inviteResponsePending={calendarInvitation.inviteResponsePending}
                formattedStart={formattedInviteStart}
                onAccept={() => respondToCalendarInvite("accepted")}
                onMaybe={() => respondToCalendarInvite("tentative")}
                onDecline={() => respondToCalendarInvite("declined")}
                onOpenEvent={
                  calendarInvitation.currentCalendarInviteEvent?.event
                    ? () =>
                        router.push(
                          `/event/${calendarInvitation.currentCalendarInviteEvent!.event!.id}` as never,
                        )
                    : undefined
                }
              />
            ) : null}

            {isDecrypting ? (
              <MessageDecryptingSkeleton
                attachedBelowBanner
                isDark={isDark}
              />
            ) : decryptError ? (
              <DecryptErrorCard
                theme={theme}
                styles={styles}
                error={getErrorMessage(decryptError, "Decryption failed")}
                onRetry={() => refetchDecrypt()}
              />
            ) : shouldReplaceBodyWithEventReminder && eventReminderView ? (
              <EventReminderMessageBody
                reminder={eventReminderView}
                attachedBelowBanner
                onOpenEvent={() =>
                  router.push(`/event/${eventReminderView.eventId}` as never)
                }
              />
            ) : isReminderEventLoading ? (
              <EventReminderMessageBodyLoading attachedBelowBanner />
            ) : isEventReminderEmail &&
              isLinkedEventSuccess &&
              !eventReminderView ? (
              <View style={styles.reminderBodyPlaceholder}>
                <Text style={styles.mutedText}>
                  Event details couldn&apos;t be decrypted on this device.
                </Text>
              </View>
            ) : isHtmlEmail ? (
              <>
                {decryptResult && (
                  <SignatureBadge
                    theme={theme}
                    styles={styles}
                    state={decryptResult.signatureVerificationState}
                  />
                )}
                <HtmlEmailView
                  key={messageId}
                  html={htmlContent!}
                  isDark={isDark}
                  theme={theme}
                />
              </>
            ) : plainContent ? (
              <>
                {decryptResult && (
                  <SignatureBadge
                    theme={theme}
                    styles={styles}
                    state={decryptResult.signatureVerificationState}
                  />
                )}
                <Text style={styles.bodyText}>{plainContent}</Text>
              </>
            ) : (
              <Text style={styles.mutedText}>This message has no content.</Text>
            )}
          </ScrollView>

          <MailBottomActionBar bottomInset={insets.bottom}>
            {archiveMailboxId ? (
              <>
                <MailBottomAction
                  icon="archive"
                  label="Archive"
                  disabled={isActionBusy}
                  onPress={handleArchive}
                />
                <MailBottomActionDivider />
              </>
            ) : null}
            <MailBottomAction
              icon="corner-up-left"
              label="Reply"
              disabled={isActionBusy}
              onPress={handleReply}
            />
            <MailBottomActionDivider />
            <MailBottomAction
              icon="trash-2"
              label={currentMailboxRole === "trash" ? "Delete" : "Trash"}
              disabled={isActionBusy}
              destructive
              onPress={handleMoveToTrash}
            />
            <MailBottomActionDivider />
            <MailBottomAction
              icon="more-horizontal"
              label="More"
              disabled={isActionBusy}
              onPress={() => setActiveSheetView("menu")}
            />
          </MailBottomActionBar>
        </View>
      )}

      {preview && (
        <AttachmentPreviewModal
          visible
          name={preview.attachment.name ?? "attachment"}
          kind={preview.kind}
          theme={theme}
          isDark={isDark}
          loadCached={() =>
            cacheAttachment(
              preview.attachment,
              preview.attachment.blobId ??
                `preview-${preview.attachment.name ?? "attachment"}`,
            )
          }
          onClose={() => setPreview(null)}
          onShare={async (cached) => {
            try {
              await shareCachedAttachment(cached);
            } catch (err) {
              toast(
                getErrorMessage(err, "Could not share attachment."),
                "error",
              );
            }
          }}
          onOpen={async (cached) => {
            try {
              await openCachedAttachment(cached);
            } catch (err) {
              toast(
                getErrorMessage(err, "Could not open attachment."),
                "error",
              );
            }
          }}
        />
      )}

      <BottomSheet
        visible={activeSheetView !== null}
        onDismiss={() => setActiveSheetView(null)}
        snapPoints={
          activeSheetView === "html"
            ? [0.92]
            : activeSheetView === "label"
              ? [0.65]
              : [0.52]
        }
      >
        <BottomSheetHeader>
          <BottomSheetTitle>
            {activeSheetView === "move"
              ? "Move to"
              : activeSheetView === "label"
                ? "Labels"
                : activeSheetView === "html"
                  ? "HTML source"
                  : "Actions"}
          </BottomSheetTitle>
        </BottomSheetHeader>
        {activeSheetView === "menu" ? (
          <MailSheetPanel bottomInset={insets.bottom}>
            <MailSheetList>
              <SheetRow
                variant="mail"
                icon="corner-up-right"
                label="Forward"
                onPress={handleForward}
              />
              <SheetRow
                variant="mail"
                icon="star"
                label={isFlagged ? "Unstar" : "Star"}
                onPress={handleToggleStar}
                showDivider
              />
              {isSeen ? (
                <SheetRow
                  variant="mail"
                  icon="mail"
                  label="Mark as unread"
                  onPress={handleMarkUnread}
                  showDivider
                />
              ) : null}
              <SheetRow
                variant="mail"
                icon="tag"
                label="Labels"
                accessory="chevron-right"
                onPress={() => setActiveSheetView("label")}
                showDivider
              />
              {(currentMailboxRole === "trash" ||
                isSpamMailboxRole(currentMailboxRole)) &&
              inboxMailboxId ? (
                <SheetRow
                  variant="mail"
                  icon="inbox"
                  label="Restore to inbox"
                  onPress={handleRestoreToInbox}
                  showDivider
                />
              ) : null}
              {moveTargets.length > 0 ? (
                <SheetRow
                  variant="mail"
                  icon="folder"
                  label="Move to…"
                  accessory="chevron-right"
                  onPress={() => setActiveSheetView("move")}
                  showDivider
                />
              ) : null}
              {rawHtmlSource ? (
                <SheetRow
                  variant="mail"
                  icon="code"
                  label="View HTML source"
                  accessory="chevron-right"
                  onPress={() => setActiveSheetView("html")}
                  showDivider
                />
              ) : null}
            </MailSheetList>
            <MailSheetList>
              <SheetRow
                variant="mail"
                icon="trash-2"
                label={
                  currentMailboxRole === "trash"
                    ? "Delete message"
                    : "Move to trash"
                }
                destructive
                onPress={handleMoveToTrash}
                disabled={isActionBusy}
              />
            </MailSheetList>
          </MailSheetPanel>
        ) : activeSheetView === "move" ? (
          <MailSheetPanel bottomInset={insets.bottom}>
            <SheetNavButton
              label="Actions"
              onPress={() => setActiveSheetView("menu")}
            />
            <MailSheetList>
              {moveTargets.map((mailbox, index) => (
                <SheetRow
                  key={mailbox.id}
                  variant="mail"
                  icon="folder"
                  label={getMailboxDisplayName(mailbox)}
                  onPress={() => handleMoveToMailbox(mailbox.id)}
                  showDivider={index > 0}
                />
              ))}
            </MailSheetList>
          </MailSheetPanel>
        ) : activeSheetView === "label" ? (
          <MailSheetPanel bottomInset={insets.bottom}>
            <MailLabelsSheet
              labels={labels}
              messageKeywords={message?.keywords}
              onBack={() => setActiveSheetView("menu")}
              onToggleLabel={(labelId, assigned) => {
                if (!message) return;
                setMessageLabel.mutate({
                  messageId: message.id,
                  labelId,
                  assigned,
                });
                setActiveSheetView(null);
                const label = labels.find((l) => l.id === labelId);
                toast(
                  assigned
                    ? `Added "${label?.name ?? labelId}"`
                    : `Removed "${label?.name ?? labelId}"`,
                );
              }}
              onCreateLabel={async (name, color) => {
                const newLabel = await createLabel(name, color);
                if (message) {
                  setMessageLabel.mutate({
                    messageId: message.id,
                    labelId: newLabel.id,
                    assigned: true,
                  });
                  toast(`Created "${newLabel.name}"`);
                }
                setActiveSheetView(null);
              }}
              onDeleteLabel={async (labelId) => {
                const label = labels.find((l) => l.id === labelId);
                await deleteLabel(labelId);
                toast(`Deleted "${label?.name ?? labelId}"`);
              }}
            />
          </MailSheetPanel>
        ) : activeSheetView === "html" ? (
          <View style={styles.sheetView}>
            <SheetNavButton
              label="Actions"
              onPress={() => setActiveSheetView("menu")}
            />
            <ScrollView
              style={styles.sheetScroll}
              contentContainerStyle={{
                paddingHorizontal: mailPad.sheetH,
                paddingBottom: sheetPad,
                gap: 8,
              }}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.htmlSourceCard}>
                <Text selectable style={styles.htmlSourceText}>
                  {rawHtmlSource ?? ""}
                </Text>
              </View>
            </ScrollView>
          </View>
        ) : null}
      </BottomSheet>
    </AppScreen>
  );
}

function DecryptErrorCard({
  theme,
  styles,
  error,
  onRetry,
}: {
  theme: ThemeTokens;
  styles: ReturnType<typeof createStyles>;
  error: string;
  onRetry: () => void;
}) {
  return (
    <View style={styles.errorCard}>
      <Feather
        name="alert-triangle"
        size={24}
        color={theme.colors.destructive}
      />
      <Text style={styles.errorTitle}>Could not decrypt message</Text>
      <Text style={styles.mutedText}>{error}</Text>
      <Pressable onPress={onRetry} style={styles.retryButton}>
        <Text style={styles.retryButtonText}>Retry</Text>
      </Pressable>
    </View>
  );
}

function SignatureBadge({
  theme,
  styles,
  state,
}: {
  theme: ThemeTokens;
  styles: ReturnType<typeof createStyles>;
  state: MailDecryptResult["signatureVerificationState"];
}) {
  if (state === "not_signed") return null;

  const icon =
    state === "verified"
      ? "check-circle"
      : state === "failed"
        ? "x-circle"
        : "help-circle";
  const color =
    state === "verified"
      ? ((theme.colors as unknown as Record<string, string>)["success"] ??
        theme.colors.primaryBase)
      : state === "failed"
        ? theme.colors.destructive
        : theme.colors.mutedForeground;
  const label =
    state === "verified"
      ? "Signature verified"
      : state === "failed"
        ? "Signature verification failed"
        : "Unverified signature";

  return (
    <View style={styles.signatureBadge}>
      <Feather name={icon as any} size={14} color={color} />
      <Text style={[styles.signatureBadgeText, { color }]}>{label}</Text>
    </View>
  );
}

function MetaRow({
  theme,
  label,
  value,
}: {
  theme: ThemeTokens;
  label: string;
  value: string;
}) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  const view = {
    messageBody: {
      flex: 1,
    },
    messageScroll: {
      flex: 1,
    },
    centered: {
      flex: 1,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: theme.spacing["3"],
      paddingHorizontal: theme.spacing["6"],
    },
    body: {
      padding: theme.spacing["4"],
      gap: theme.spacing["3"],
    },
    metaBlock: {
      gap: theme.spacing["1"],
    },
    labelRow: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      gap: 6,
    },
    labelChip: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: theme.borderRadius.full,
      borderWidth: 1,
    },
    labelDot: {
      width: 8,
      height: 8,
      borderRadius: theme.borderRadius.full,
    },
    metaRow: {
      flexDirection: "row" as const,
      gap: theme.spacing["2"],
    },
    metaValueRow: {
      flex: 1,
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      alignItems: "center" as const,
      gap: theme.spacing["1.5"],
    },
    metaValueWrap: {
      flex: 1,
    },
    attachmentBlock: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      gap: theme.spacing["2"],
    },
    attachmentChip: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["1"],
      maxWidth: 220,
      paddingHorizontal: theme.spacing["2"],
      paddingVertical: theme.spacing["1"],
      borderRadius: theme.borderRadius.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.card,
    },
    attachmentChipPressed: {
      opacity: 0.65,
    },
    divider: {
      height: 1,
      backgroundColor: theme.colors.border,
    },
    signatureBadge: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["1"],
    },
    errorCard: {
      alignItems: "center" as const,
      gap: theme.spacing["3"],
      padding: theme.spacing["4"],
      borderRadius: theme.borderRadius.lg,
      borderWidth: 1,
      borderColor: theme.colors.destructive,
      backgroundColor: theme.colors.card,
    },
    retryButton: {
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["2"],
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.primaryBase,
    },
    unsupportedCard: {
      alignItems: "center" as const,
      gap: theme.spacing["2"],
      padding: theme.spacing["4"],
      borderRadius: theme.borderRadius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.card,
    },
    sheetView: {
      flex: 1,
    },
    sheetScroll: {
      flex: 1,
    },
    htmlSourceCard: {
      padding: theme.spacing["3"],
      borderRadius: theme.borderRadius.lg,
      backgroundColor: theme.colors.muted + "28",
    },
    reminderBodyPlaceholder: {
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: theme.spacing["2"],
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["8"],
      borderWidth: StyleSheet.hairlineWidth,
      borderTopWidth: 0,
      borderColor: theme.colors.primaryBase + "26",
      borderBottomLeftRadius: theme.borderRadius.lg,
      borderBottomRightRadius: theme.borderRadius.lg,
      backgroundColor: theme.colors.card,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    subjectRow: {
      flexDirection: "row" as const,
      alignItems: "flex-start" as const,
      gap: theme.spacing["2"],
    },
    subject: {
      flex: 1,
      fontSize: theme.typography.fontSize.xl.size,
      lineHeight: theme.typography.fontSize.xl.lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    metaLabel: {
      width: 44,
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
    },
    metaValue: {
      flex: 1,
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
    },
    metaLink: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.primaryBase,
      textDecorationLine: "underline" as const,
    },
    attachmentName: {
      flexShrink: 1,
      fontSize: theme.typography.fontSize.xs.size,
      color: theme.colors.foreground,
    },
    bodyText: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      color: theme.colors.foreground,
    },
    labelText: {
      fontSize: theme.typography.fontSize.xs.size - 1,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
    },
    mutedText: {
      textAlign: "center" as const,
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
    },
    reminderBodyPlaceholderText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
    },
    errorTitle: {
      fontSize: theme.typography.fontSize.base.size,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.destructive,
    },
    retryButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.primaryForeground,
    },
    signatureBadgeText: {
      fontSize: theme.typography.fontSize.xs.size,
      color: theme.colors.mutedForeground,
    },
    htmlSourceText: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
      fontFamily: Platform.select({
        ios: "Menlo",
        android: "monospace",
        default: "monospace",
      }),
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
