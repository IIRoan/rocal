import { useEffect, useMemo, useState } from "react";
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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { FontAwesome } from "@expo/vector-icons";
import { getErrorMessage } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../../../src/providers/ThemeProvider";
import { useToast } from "../../../../src/providers/ToastProvider";
import { QUERY_KEYS } from "../../../../src/lib/query-keys";
import {
  useCachedMessage,
  useMailMutations,
  useMailRuntime,
} from "../../../../src/lib/mail/use-mail";
import {
  formatAddressFull,
  formatMessageDate,
} from "../../../../src/lib/mail/mail-helpers";
import {
  classifyMessageEncryption,
  extractMessageBodies,
  resolveDisplayAttachments,
} from "../../../../src/lib/mail/message-security";
import {
  openCachedAttachment,
  shareCachedAttachment,
  writeAttachmentToCache,
} from "../../../../src/lib/mail/attachment-cache";
import { useConversationThread } from "../../../../src/lib/mail/use-conversation-thread";
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
import { BottomSheet } from "../../../../src/components/BottomSheet";
import {
  SheetList,
  SheetNavButton,
  SheetRow,
} from "../../../../src/components/sheet";

import {
  resolveAttachmentPreviewKind,
  type MailAttachmentPreviewKind,
} from "../../../../src/lib/mail/attachment-preview";
import type { JmapAttachment, JmapEmailMessage, LabelDef } from "../../../../src/lib/mail/types";
import { useLabels, getAllMessageLabels } from "../../../../src/lib/mail/use-labels";
import { MailLabelsSheet } from "../../../../src/components/mail/MailLabelsSheet";

type MessageSheetView = "menu" | "move" | "label" | "html" | null;

export default function MailMessageScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { toast } = useToast();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const messageId = typeof id === "string" ? id : "";

  const runtimeQuery = useMailRuntime(true);
  const runtime = runtimeQuery.data;
  const { labels, createLabel, deleteLabel, refreshLabels } = useLabels({
    runtime,
    enabled: Boolean(runtime),
  });
  const cached = useCachedMessage(messageId);

  const messageQuery = useQuery<JmapEmailMessage | null>({
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

  const message = messageQuery.data ?? null;
  const { conversationMessages, isLoading: isConversationLoading } =
    useConversationThread(runtime, message);
  const { markAsUnread, toggleFlagged, moveToTrash, deleteMessage, moveToMailbox, setMessageLabel } =
    useMailMutations(runtime, null);
  const bodies = message ? extractMessageBodies(message) : null;
  const encryption = message ? classifyMessageEncryption(message) : "plain";
  const isEncrypted = encryption !== "plain";

  const decryptQuery = useQuery<MailDecryptResult>({
    queryKey: QUERY_KEYS.mailDecrypted(messageId),
    enabled: isEncrypted && Boolean(runtime) && Boolean(message),
    retry: 1,
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!runtime || !message) throw new Error("Runtime or message not available");
      const rawBodyText = bodies?.text ?? bodies?.html ?? null;
      if (encryption === "inline_pgp") {
        if (!rawBodyText) throw new Error("No armored PGP body found in this message");
        return decryptMailMessage(runtime, messageId, rawBodyText);
      }
      if (encryption === "pgp_mime") {
        return decryptPgpMimeMessage(runtime, messageId, message.bodyStructure);
      }
      throw new Error(`Unsupported encryption type: ${encryption}`);
    },
  });

  // After decrypt unlocks the vault, refresh label names/colors from the vault backup.
  useEffect(() => {
    if (decryptQuery.isSuccess) {
      refreshLabels();
    }
  }, [decryptQuery.isSuccess, refreshLabels]);

  const htmlContent: string | null = decryptQuery.data?.html ?? (isEncrypted ? null : (bodies?.html ?? null));
  const plainContent: string | null = decryptQuery.data?.plaintext ?? (isEncrypted ? null : (bodies?.text ?? null));
  const isHtmlEmail = Boolean(htmlContent);
  const isDecrypting = isEncrypted && (decryptQuery.isLoading || decryptQuery.isFetching);
  const decryptError = isEncrypted ? decryptQuery.error : null;
  const rawHtmlSource = decryptQuery.data?.html ?? bodies?.html ?? null;

  const [downloadingBlobId, setDownloadingBlobId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    attachment: JmapAttachment;
    kind: MailAttachmentPreviewKind;
  } | null>(null);
  const [activeSheetView, setActiveSheetView] = useState<MessageSheetView>(null);

  const displayAttachments = useMemo(
    () =>
      resolveDisplayAttachments({
        encryption,
        isDecrypting,
        decryptSucceeded: decryptQuery.isSuccess,
        decryptedAttachments: decryptQuery.data?.attachments,
        messageAttachments: message?.attachments,
      }),
    [
      encryption,
      isDecrypting,
      decryptQuery.isSuccess,
      decryptQuery.data?.attachments,
      message?.attachments,
    ],
  );

  const currentMailboxId = message
    ? Object.keys(message.mailboxIds ?? {})[0] ?? null
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
    runtime?.mailboxes.find((mailbox) => mailbox.role === "archive")?.id ?? null;
  const moveTargets = useMemo(() => {
    if (!runtime || !message) {
      return [];
    }

    const activeMailboxIds = new Set(Object.keys(message.mailboxIds ?? {}));
    return runtime.mailboxes.filter((mailbox) => !activeMailboxIds.has(mailbox.id));
  }, [message, runtime]);
  const isActionBusy =
    markAsUnread.isPending ||
    toggleFlagged.isPending ||
    moveToTrash.isPending ||
    deleteMessage.isPending ||
    moveToMailbox.isPending;
  const cacheAttachment = async (attachment: JmapAttachment, cacheKey: string) =>
    writeAttachmentToCache({
      attachment,
      cacheKey,
      runtime,
    });

  const handleOpenAttachment = async (attachment: JmapAttachment, cacheKey: string) => {
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
    markAsUnread.mutate(message.id, {
      onSuccess: () => {
        setActiveSheetView(null);
        toast("Marked as unread");
      },
      onError: (error) =>
        toast(getErrorMessage(error, "Failed to mark message as unread."), "error"),
    });
  };

  const handleMoveToTrash = () => {
    if (!message) return;
    setActiveSheetView(null);
    const mutation = currentMailboxRole === "trash" ? deleteMessage : moveToTrash;
    const successMessage = currentMailboxRole === "trash" ? "Message deleted" : "Message moved to trash";
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
              style={[styles.labelChip, { borderColor: `${label.color}50`, backgroundColor: `${label.color}18` }]}
            >
              <View style={[styles.labelDot, { backgroundColor: label.color }]} />
              <Text style={[styles.labelText, { color: label.color }]} numberOfLines={1}>
                {label.name}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.metaBlock}>
        <MetaRow theme={theme} label="From" value={formatAddressFull(message.from)} />
        <MetaRow theme={theme} label="To" value={formatAddressFull(message.to)} />
        {message.cc?.length ? (
          <MetaRow theme={theme} label="Cc" value={formatAddressFull(message.cc)} />
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
                  <ActivityIndicator size={13} color={theme.colors.mutedForeground} />
                ) : (
                  <Feather name="paperclip" size={13} color={theme.colors.mutedForeground} />
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
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel="Back to messages"
        >
          <Feather name="arrow-left" size={22} color={theme.colors.foreground} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {message?.subject?.trim() || "Message"}
        </Text>
        <View style={styles.iconButton} />
      </View>

      {messageQuery.isLoading && !message ? (
        <CenteredLoader theme={theme} />
      ) : messageQuery.isError && !message ? (
        <View style={styles.centered}>
          <Feather name="alert-triangle" size={36} color={theme.colors.destructive} />
          <Text style={styles.mutedText}>
            {getErrorMessage(messageQuery.error, "Failed to load message")}
          </Text>
        </View>
      ) : !message ? (
        <View style={styles.centered}>
          <Text style={styles.mutedText}>Message not found.</Text>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.body}>
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
                onSelectMessage={(id) => {
                  if (id !== messageId) {
                    router.replace(`/(tabs)/mail/message/${id}` as never);
                  }
                }}
              />
            )}

            {isDecrypting ? (
              <CenteredLoader theme={theme} message="Decrypting message…" />
            ) : decryptError ? (
              <DecryptErrorCard
                theme={theme}
                styles={styles}
                error={getErrorMessage(decryptError, "Decryption failed")}
                onRetry={() => decryptQuery.refetch()}
              />
            ) : isHtmlEmail ? (
              <>
                {decryptQuery.data && (
                  <SignatureBadge
                    theme={theme}
                    styles={styles}
                    state={decryptQuery.data.signatureVerificationState}
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
                {decryptQuery.data && (
                  <SignatureBadge
                    theme={theme}
                    styles={styles}
                    state={decryptQuery.data.signatureVerificationState}
                  />
                )}
                <Text style={styles.bodyText}>{plainContent}</Text>
              </>
            ) : (
              <Text style={styles.mutedText}>This message has no content.</Text>
            )}
          </ScrollView>

          <View style={styles.bottomBar}>
            {archiveMailboxId ? (
              <BottomBarButton
                theme={theme}
                icon="archive"
                label="Archive"
                disabled={isActionBusy}
                onPress={handleArchive}
              />
            ) : null}
            <BottomBarButton
              theme={theme}
              icon="corner-up-left"
              label="Reply"
              disabled={isActionBusy}
              onPress={handleReply}
            />
            <BottomBarButton
              theme={theme}
              icon="trash-2"
              label={currentMailboxRole === "trash" ? "Delete" : "Trash"}
              disabled={isActionBusy}
              destructive
              onPress={handleMoveToTrash}
            />
            <BottomBarButton
              theme={theme}
              icon="more-horizontal"
              label="More"
              disabled={isActionBusy}
              onPress={() => setActiveSheetView("menu")}
            />
          </View>
        </>
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
              preview.attachment.blobId ?? `preview-${preview.attachment.name ?? "attachment"}`,
            )
          }
          onClose={() => setPreview(null)}
          onShare={async (cached) => {
            try {
              await shareCachedAttachment(cached);
            } catch (err) {
              toast(getErrorMessage(err, "Could not share attachment."), "error");
            }
          }}
          onOpen={async (cached) => {
            try {
              await openCachedAttachment(cached);
            } catch (err) {
              toast(getErrorMessage(err, "Could not open attachment."), "error");
            }
          }}
        />
      )}

      <BottomSheet
        visible={activeSheetView !== null}
        onDismiss={() => setActiveSheetView(null)}
        snapPoints={activeSheetView === "html" ? [0.92] : activeSheetView === "label" ? [0.65] : [0.45]}
      >
        {activeSheetView === "menu" ? (
          <View style={[styles.sheetContent, { paddingBottom: insets.bottom + 8 }]}>
            <SheetList>
              <SheetRow icon="corner-up-right" label="Forward" onPress={handleForward} />
              <SheetRow icon="star" label={isFlagged ? "Unstar" : "Star"} onPress={handleToggleStar} showDivider />
              {isSeen ? (
                <SheetRow icon="mail" label="Mark as unread" onPress={handleMarkUnread} showDivider />
              ) : null}
              <SheetRow icon="tag" label="Labels" accessory="chevron-right" onPress={() => setActiveSheetView("label")} showDivider />
              {(currentMailboxRole === "trash" ||
                currentMailboxRole === "junk") &&
              inboxMailboxId ? (
                <SheetRow icon="inbox" label="Restore to inbox" onPress={handleRestoreToInbox} showDivider />
              ) : null}
              {moveTargets.length > 0 ? (
                <SheetRow icon="folder" label="Move to…" accessory="chevron-right" onPress={() => setActiveSheetView("move")} showDivider />
              ) : null}
              {rawHtmlSource ? (
                <SheetRow icon="code" label="View HTML source" accessory="chevron-right" onPress={() => setActiveSheetView("html")} showDivider />
              ) : null}
            </SheetList>
            <SheetList>
              <SheetRow
                icon="trash-2"
                label={currentMailboxRole === "trash" ? "Delete message" : "Move to trash"}
                destructive
                onPress={handleMoveToTrash}
                disabled={isActionBusy}
              />
            </SheetList>
          </View>
        ) : activeSheetView === "move" ? (
          <View style={[styles.sheetContent, { paddingBottom: insets.bottom + 8 }]}>
            <SheetNavButton label="Actions" onPress={() => setActiveSheetView("menu")} />
            <SheetList>
              {moveTargets.map((mailbox, index) => (
                <SheetRow
                  key={mailbox.id}
                  icon="folder"
                  label={mailbox.name}
                  onPress={() => handleMoveToMailbox(mailbox.id)}
                  showDivider={index > 0}
                />
              ))}
            </SheetList>
          </View>
        ) : activeSheetView === "label" ? (
          <MailLabelsSheet
            labels={labels}
            messageKeywords={message?.keywords}
            insetsBottom={insets.bottom}
            onBack={() => setActiveSheetView("menu")}
            onToggleLabel={(labelId, assigned) => {
              if (!message) return;
              setMessageLabel.mutate({ messageId: message.id, labelId, assigned });
              setActiveSheetView(null);
              const label = labels.find((l) => l.id === labelId);
              toast(assigned ? `Added "${label?.name ?? labelId}"` : `Removed "${label?.name ?? labelId}"`);
            }}
            onCreateLabel={async (name, color) => {
              const newLabel = await createLabel(name, color);
              if (message) {
                setMessageLabel.mutate({ messageId: message.id, labelId: newLabel.id, assigned: true });
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
        ) : activeSheetView === "html" ? (
          <View style={styles.sheetView}>
            <SheetNavButton label="Actions" onPress={() => setActiveSheetView("menu")} />
            <ScrollView
              style={styles.sheetScroll}
              contentContainerStyle={[styles.sheetContent, { paddingBottom: insets.bottom + 8 }]}
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
    </SafeAreaView>
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
      <Feather name="alert-triangle" size={24} color={theme.colors.destructive} />
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
    state === "verified" ? "check-circle" : state === "failed" ? "x-circle" : "help-circle";
  const color =
    state === "verified"
      ? ((theme.colors as unknown as Record<string, string>)["success"] ?? theme.colors.primaryBase)
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

function BottomBarButton({
  theme,
  icon,
  label,
  disabled,
  destructive,
  onPress,
}: {
  theme: ThemeTokens;
  icon: keyof typeof Feather.glyphMap;
  label: string;
  disabled?: boolean;
  destructive?: boolean;
  onPress: () => void;
}) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const color = destructive ? theme.colors.destructive : theme.colors.foreground;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.bottomBarButton,
        pressed && styles.bottomBarButtonPressed,
        disabled && styles.bottomBarButtonDisabled,
      ]}
    >
      <Feather name={icon} size={18} color={color} />
      <Text style={[styles.bottomBarButtonText, destructive && { color }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function createStyles(theme: ThemeTokens) {
  const view = {
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["2"],
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["2"],
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    iconButton: {
      width: 38,
      height: 38,
      alignItems: "center" as const,
      justifyContent: "center" as const,
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
      paddingBottom: theme.spacing["6"] + 84,
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
    bottomBar: {
      flexDirection: "row" as const,
      justifyContent: "space-around" as const,
      alignItems: "center" as const,
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["2"],
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      backgroundColor: theme.colors.background,
    },
    bottomBarButton: {
      flex: 1,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: theme.spacing["1"],
      paddingVertical: theme.spacing["1"],
      borderRadius: theme.borderRadius.md,
    },
    bottomBarButtonPressed: {
      opacity: 0.7,
    },
    bottomBarButtonDisabled: {
      opacity: 0.45,
    },
    sheetView: {
      flex: 1,
    },
    sheetScroll: {
      flex: 1,
    },
    sheetContent: {
      paddingHorizontal: 16,
      paddingBottom: 8,
      gap: 8,
    },

    htmlSourceCard: {
      padding: theme.spacing["3"],
      borderRadius: theme.borderRadius.lg,
      backgroundColor: theme.colors.muted + "28",
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    headerTitle: {
      flex: 1,
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
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
    bottomBarButtonText: {
      fontSize: theme.typography.fontSize.xs.size,
      color: theme.colors.foreground,
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
