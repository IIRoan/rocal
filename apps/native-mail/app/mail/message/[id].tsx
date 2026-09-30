import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppScreen } from "@workspace/native-core/components/layout/AppScreen";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  getErrorMessage,
  isCurrentUserMailAddress,
  isAutomatedMailAddress,
  resolveMailContentIsDark,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { useToast } from "@workspace/native-core/providers/ToastProvider";
import {
  getMailboxDisplayName,
  getMailboxIcon,
  isDraftMessage,
} from "../../../src/lib/mail/mail-helpers";
import {
  openCachedAttachment,
  shareCachedAttachment,
} from "../../../src/lib/mail/attachment-cache";
import { MailZoomScrollView } from "../../../src/components/mail/MailZoomScrollView";
import { CenteredLoader } from "@workspace/native-core/components/ui/loading";
import { AttachmentPreviewModal } from "../../../src/components/mail/AttachmentPreviewModal";
import { ConversationThreadStrip } from "../../../src/components/mail/ConversationThreadStrip";
import { useAuth } from "@workspace/native-core/providers/AuthProvider";
import { useMailCompose } from "../../../src/providers/MailComposeProvider";
import {
  MAIL_HOME_ROUTE,
  mailMessageRoute,
} from "../../../src/lib/mail-routes";
import { MailReaderToolbar } from "../../../src/components/mail/MailReaderToolbar";
import { mailBottomBarTotalHeight } from "../../../src/components/mail/mail-bottom-action-bar-layout";
import { MailAttachmentCards } from "../../../src/components/mail/MailAttachmentCards";
import { MailReaderHeader } from "../../../src/components/mail/MailReaderHeader";
import { MailMessageHeader } from "../../../src/components/mail/MailMessageHeader";
import { MailMessageBody } from "../../../src/components/mail/MailMessageBody";
import { openCalendarEvent } from "../../../src/lib/open-calendar-event";
import { MailMessageActionsSheet } from "../../../src/components/mail/MailMessageActionsSheet";
import { useRecentContacts } from "@workspace/native-core/hooks/use-recent-contacts";
import { useMailMessageContent } from "../../../src/hooks/use-mail-message-content";
import { useMailMessageCalendar } from "../../../src/hooks/use-mail-message-calendar";
import { useUserTimeFormat } from "@workspace/native-core/hooks/use-user-time-format";
import {
  useMailMessageActions,
  type MailMessageActions,
} from "../../../src/hooks/use-mail-message-actions";
import { useMailDisplaySettings } from "../../../src/hooks/use-mail-settings";
import {
  useLabels,
  getAllMessageLabels,
} from "../../../src/lib/mail/use-labels";

export default function MailMessageScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";
  const { replace, back, canGoBack } = useRouter();
  const { openCompose } = useMailCompose();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const scrollBottomPad =
    theme.spacing["4"] + mailBottomBarTotalHeight(insets.bottom);
  const { toast } = useToast();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const messageId = typeof id === "string" ? id : "";

  const content = useMailMessageContent(messageId);
  const { runtime, message } = content;
  const { labels, createLabel, deleteLabel, refreshLabels } = useLabels({
    runtime,
    enabled: Boolean(runtime),
  });
  const calendar = useMailMessageCalendar({
    message,
    plainContent: content.plainContent,
    attachments: content.displayAttachments,
    runtime,
    userId: user?.id,
    isDecrypting: content.isDecrypting,
  });
  const actions = useMailMessageActions({ messageId, message, runtime });
  const { settings: displaySettings } = useMailDisplaySettings();
  // Per-message override: never written back to the saved appearance setting.
  const [originalLookMessageId, setOriginalLookMessageId] = useState<
    string | null
  >(null);
  const showOriginalLook = originalLookMessageId === messageId;
  const canShowOriginalLook =
    isDark && resolveMailContentIsDark(displaySettings);
  const { recordUsage } = useRecentContacts();
  const recordedContactMessageRef = useRef<string | null>(null);

  useEffect(() => {
    const sender = message?.from?.[0];
    const accountEmail = runtime?.session?.username;
    if (!message || !sender?.email || !accountEmail) {
      return;
    }
    if (
      isCurrentUserMailAddress(sender.email, accountEmail) ||
      isAutomatedMailAddress(sender.email)
    ) {
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

  const openedDraftRef = useRef<string | null>(null);
  useEffect(() => {
    if (!message || !runtime) return;
    if (openedDraftRef.current === message.id) return;
    if (isDraftMessage(message, null, runtime.mailboxes)) {
      openedDraftRef.current = message.id;
      openCompose({ mode: "draft", messageId: message.id });
      if (canGoBack()) {
        back();
      } else {
        replace(MAIL_HOME_ROUTE as never);
      }
    }
  }, [back, canGoBack, message, openCompose, replace, runtime]);

  // Decrypting unlocks the vault, so refresh label names/colors from its backup.
  useEffect(() => {
    if (content.isDecryptSuccess) {
      refreshLabels();
    }
  }, [content.isDecryptSuccess, refreshLabels]);

  const { preview } = actions;
  const { userSettings } = calendar;
  const timeFormat = useUserTimeFormat();
  const accountEmail =
    user?.email?.trim().toLowerCase() ??
    runtime?.session.username?.trim().toLowerCase() ??
    undefined;
  const openEvent = (eventId: string) => {
    void openCalendarEvent(eventId).then((opened) => {
      if (!opened) toast("Install Solace Calendar to open this event", "error");
    });
  };

  return (
    <AppScreen
      header={
        <MailReaderNavigation actions={actions} hasMessage={Boolean(message)} />
      }
    >
      <MailReaderState content={content}>
        {message && (
          <View style={styles.messageBody}>
            <MailZoomScrollView
              style={styles.messageScroll}
              contentContainerStyle={[
                styles.body,
                { paddingBottom: scrollBottomPad },
              ]}
            >
              <MailMessageHeader
                message={message}
                accountEmail={accountEmail}
                accountName={user?.name?.trim() || undefined}
                identities={runtime?.identities ?? []}
                labels={getAllMessageLabels(message, labels)}
                isFlagged={actions.isFlagged}
                starDisabled={actions.isStarPending}
                onToggleStar={actions.handleToggleStar}
                encryption={content.encryption}
                encryptedAtRest={Boolean(runtime?.encryptedAtRest)}
                signatureVerificationState={
                  content.decryptResult?.signatureVerificationState
                }
                decryptionFailed={Boolean(content.decryptError)}
                timeFormat={timeFormat}
                timezone={userSettings?.timezone}
              />

              {content.isConversationLoading ? (
                <ActivityIndicator
                  size="small"
                  color={theme.colors.mutedForeground}
                  style={{ marginBottom: theme.spacing["2"] }}
                />
              ) : (
                <ConversationThreadStrip
                  messages={content.conversationMessages}
                  activeMessageId={messageId}
                  accountEmail={
                    user?.email ?? runtime?.session.username ?? null
                  }
                  previews={content.conversationPreviews}
                  onSelectMessage={(id) => {
                    if (id !== messageId) {
                      replace(mailMessageRoute(id) as never);
                    }
                  }}
                />
              )}

              <MailMessageBody
                messageId={messageId}
                content={content}
                calendar={calendar}
                onOpenEvent={openEvent}
                showOriginalLook={showOriginalLook}
              />

              <MailAttachmentCards
                attachments={content.displayAttachments}
                downloadingBlobId={actions.downloadingBlobId}
                onOpenAttachment={actions.handleOpenAttachment}
              />
            </MailZoomScrollView>

            <MailReaderToolbar bottomInset={insets.bottom} actions={actions} />
          </View>
        )}
      </MailReaderState>

      {preview && (
        <AttachmentPreviewModal
          visible
          name={preview.attachment.name ?? "attachment"}
          kind={preview.kind}
          theme={theme}
          isDark={isDark}
          loadCached={actions.loadPreview}
          onClose={actions.closePreview}
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

      <MailMessageActionsSheet
        actions={actions}
        labels={labels}
        messageKeywords={message?.keywords}
        rawHtmlSource={content.rawHtmlSource}
        originalLook={
          canShowOriginalLook && content.htmlContent
            ? {
                showing: showOriginalLook,
                toggle: () =>
                  setOriginalLookMessageId(showOriginalLook ? null : messageId),
              }
            : null
        }
        createLabel={createLabel}
        deleteLabel={deleteLabel}
      />
    </AppScreen>
  );
}

function MailReaderNavigation({
  actions,
  hasMessage,
}: {
  actions: MailMessageActions;
  hasMessage: boolean;
}) {
  const { currentMailbox } = actions;
  return (
    <MailReaderHeader
      mailboxName={
        currentMailbox ? getMailboxDisplayName(currentMailbox) : "Mail"
      }
      mailboxIcon={
        currentMailbox
          ? (getMailboxIcon(currentMailbox) as keyof typeof Feather.glyphMap)
          : "mail"
      }
      onReply={hasMessage ? actions.handleReply : undefined}
      replyDisabled={actions.isActionBusy}
      onMore={hasMessage ? () => actions.setActiveSheetView("menu") : undefined}
      moreDisabled={actions.isActionBusy}
    />
  );
}

function MailReaderState({
  content,
  children,
}: {
  content: ReturnType<typeof useMailMessageContent>;
  children: ReactNode;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  if (content.message) return children;
  if (content.isMessageLoading) return <CenteredLoader theme={theme} />;
  return (
    <View style={styles.centered}>
      {content.isMessageError ? (
        <Feather
          name="alert-triangle"
          size={36}
          color={theme.colors.destructive}
        />
      ) : null}
      <Text style={styles.mutedText}>
        {content.isMessageError
          ? getErrorMessage(content.messageError, "Failed to load message")
          : "Message not found."}
      </Text>
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
      paddingHorizontal: theme.spacing["4"],
      paddingTop: theme.spacing["3"],
      gap: theme.spacing["4"],
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    mutedText: {
      textAlign: "center" as const,
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
