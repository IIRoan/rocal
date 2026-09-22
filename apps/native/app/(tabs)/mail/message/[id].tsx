import { useEffect, useMemo, useRef } from "react";
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
import { AppScreen } from "../../../../src/components/layout/AppScreen";
import { HeaderIconButton } from "../../../../src/components/layout/HeaderIconButton";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  getErrorMessage,
  isCurrentUserMailAddress,
  isAutomatedMailAddress,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../../../src/providers/ThemeProvider";
import { useToast } from "../../../../src/providers/ToastProvider";
import {
  getMailboxDisplayName,
  getMailboxIcon,
  isDraftMessage,
} from "../../../../src/lib/mail/mail-helpers";
import {
  openCachedAttachment,
  shareCachedAttachment,
} from "../../../../src/lib/mail/attachment-cache";
import { MailZoomScrollView } from "../../../../src/components/mail/MailZoomScrollView";
import { CenteredLoader } from "../../../../src/components/ui/loading";
import { AttachmentPreviewModal } from "../../../../src/components/mail/AttachmentPreviewModal";
import { ConversationThreadStrip } from "../../../../src/components/mail/ConversationThreadStrip";
import { useAuth } from "../../../../src/providers/AuthProvider";
import {
  MailBottomAction,
  MailBottomActionBar,
  MailBottomActionDivider,
} from "../../../../src/components/mail/MailBottomActionBar";
import { mailBottomBarTotalHeight } from "../../../../src/components/mail/mail-bottom-action-bar-layout";
import { MailReaderHeader } from "../../../../src/components/mail/MailReaderHeader";
import { MailMessageHeader } from "../../../../src/components/mail/MailMessageHeader";
import { MailMessageBody } from "../../../../src/components/mail/MailMessageBody";
import { MailMessageActionsSheet } from "../../../../src/components/mail/MailMessageActionsSheet";
import { useRecentContacts } from "../../../../src/hooks/use-recent-contacts";
import { useMailMessageContent } from "../../../../src/hooks/use-mail-message-content";
import { useMailMessageCalendar } from "../../../../src/hooks/use-mail-message-calendar";
import { useMailMessageActions } from "../../../../src/hooks/use-mail-message-actions";
import {
  useLabels,
  getAllMessageLabels,
} from "../../../../src/lib/mail/use-labels";

export default function MailMessageScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";
  const { replace, push } = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const scrollBottomPad =
    theme.spacing["6"] + mailBottomBarTotalHeight(insets.bottom);
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

  useEffect(() => {
    if (!message || !runtime) return;
    if (isDraftMessage(message, null, runtime.mailboxes)) {
      replace(
        `/(tabs)/mail/compose?mode=draft&messageId=${message.id}` as never,
      );
    }
  }, [message, replace, runtime]);

  // Decrypting unlocks the vault, so refresh label names/colors from its backup.
  useEffect(() => {
    if (content.isDecryptSuccess) {
      refreshLabels();
    }
  }, [content.isDecryptSuccess, refreshLabels]);

  const { currentMailbox, preview } = actions;
  const { userSettings } = calendar;
  const accountEmail =
    user?.email?.trim().toLowerCase() ??
    runtime?.session.username?.trim().toLowerCase() ??
    undefined;
  const openEvent = (eventId: string) => push(`/event/${eventId}` as never);

  return (
    <AppScreen
      header={
        <MailReaderHeader
          mailboxName={
            currentMailbox ? getMailboxDisplayName(currentMailbox) : "Mail"
          }
          mailboxIcon={
            currentMailbox
              ? (getMailboxIcon(
                  currentMailbox,
                ) as keyof typeof Feather.glyphMap)
              : "mail"
          }
          trailingAction={
            message && actions.isSeen ? (
              <HeaderIconButton
                name="mail"
                accessibilityLabel="Mark as unread"
                onPress={actions.handleMarkUnread}
                disabled={actions.isActionBusy}
              />
            ) : undefined
          }
        />
      }
    >
      {content.isMessageLoading && !message ? (
        <CenteredLoader theme={theme} />
      ) : content.isMessageError && !message ? (
        <View style={styles.centered}>
          <Feather
            name="alert-triangle"
            size={36}
            color={theme.colors.destructive}
          />
          <Text style={styles.mutedText}>
            {getErrorMessage(content.messageError, "Failed to load message")}
          </Text>
        </View>
      ) : !message ? (
        <View style={styles.centered}>
          <Text style={styles.mutedText}>Message not found.</Text>
        </View>
      ) : (
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
              attachments={content.displayAttachments}
              isFlagged={actions.isFlagged}
              starDisabled={actions.isStarPending}
              onToggleStar={actions.handleToggleStar}
              downloadingBlobId={actions.downloadingBlobId}
              onOpenAttachment={actions.handleOpenAttachment}
              encryption={content.encryption}
              encryptedAtRest={Boolean(runtime?.encryptedAtRest)}
              signatureVerificationState={
                content.decryptResult?.signatureVerificationState
              }
              decryptionFailed={Boolean(content.decryptError)}
              timeFormat={
                userSettings?.timeFormat === "12h" ||
                userSettings?.timeFormat === "24h"
                  ? userSettings.timeFormat
                  : undefined
              }
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
                accountEmail={user?.email ?? runtime?.session.username ?? null}
                previews={content.conversationPreviews}
                onSelectMessage={(id) => {
                  if (id !== messageId) {
                    replace(`/(tabs)/mail/message/${id}` as never);
                  }
                }}
              />
            )}

            <MailMessageBody
              messageId={messageId}
              content={content}
              calendar={calendar}
              onOpenEvent={openEvent}
            />
          </MailZoomScrollView>

          <MailBottomActionBar bottomInset={insets.bottom}>
            {actions.archiveMailboxId ? (
              <>
                <MailBottomAction
                  icon="archive"
                  label="Archive"
                  disabled={actions.isActionBusy}
                  onPress={actions.handleArchive}
                />
                <MailBottomActionDivider />
              </>
            ) : null}
            <MailBottomAction
              icon="corner-up-left"
              label="Reply"
              disabled={actions.isActionBusy}
              onPress={actions.handleReply}
            />
            <MailBottomActionDivider />
            <MailBottomAction
              icon="trash-2"
              label={actions.currentMailboxRole === "trash" ? "Delete" : "Trash"}
              disabled={actions.isActionBusy}
              destructive
              onPress={actions.handleMoveToTrash}
            />
            <MailBottomActionDivider />
            <MailBottomAction
              icon="more-horizontal"
              label="More"
              disabled={actions.isActionBusy}
              onPress={() => actions.setActiveSheetView("menu")}
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
        createLabel={createLabel}
        deleteLabel={deleteLabel}
      />
    </AppScreen>
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
      gap: theme.spacing["3"],
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
