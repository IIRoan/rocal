import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import * as FileSystem from "expo-file-system/legacy";
type SharingModule = typeof import("expo-sharing");
let Sharing: SharingModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Sharing = require("expo-sharing") as SharingModule;
} catch {
  Sharing = null;
}
import { getErrorMessage } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../../../src/providers/ThemeProvider";
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
} from "../../../../src/lib/mail/message-security";
import {
  decryptMailMessage,
  decryptPgpMimeMessage,
  type MailDecryptResult,
} from "../../../../src/lib/mail/mail-crypto";
import { HtmlEmailView } from "../../../../src/components/mail/HtmlEmailView";
import { CenteredLoader } from "../../../../src/components/ui/loading";
import { AttachmentPreviewModal } from "../../../../src/components/mail/AttachmentPreviewModal";
import { BottomSheet } from "../../../../src/components/BottomSheet";

import {
  resolveAttachmentPreviewKind,
  type MailAttachmentPreviewKind,
} from "../../../../src/lib/mail/attachment-preview";
import type { JmapAttachment, JmapEmailMessage } from "../../../../src/lib/mail/types";

type MessageSheetView = "menu" | "move" | "html" | null;

export default function MailMessageScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const messageId = typeof id === "string" ? id : "";

  const runtimeQuery = useMailRuntime(true);
  const runtime = runtimeQuery.data;
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
  const { markAsUnread, toggleFlagged, moveToTrash, deleteMessage, moveToMailbox } =
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

  const currentMailboxId = message
    ? Object.keys(message.mailboxIds ?? {})[0] ?? null
    : null;
  const currentMailbox = runtime?.mailboxes.find((mailbox) =>
    currentMailboxId ? mailbox.id === currentMailboxId : false,
  );
  const currentMailboxRole = currentMailbox?.role ?? null;
  const isFlagged = Boolean(message?.keywords?.["$flagged"]);
  const isSeen = Boolean(message?.keywords?.["$seen"]);
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
  const downloadAttachmentToCache = async (
    attachment: JmapAttachment,
  ): Promise<string> => {
    if (!attachment.blobId || !runtime) {
      throw new Error("Attachment is not available.");
    }
    const name = attachment.name ?? "attachment";
    const type = attachment.type ?? "application/octet-stream";
    const { url, authHeader } = await runtime.client.getBlobDownloadInfo(
      runtime.session,
      attachment.blobId,
      name,
      type,
    );
    const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "_") || "attachment";
    const localUri = (FileSystem.cacheDirectory ?? "") + safeName;
    const { status } = await FileSystem.downloadAsync(localUri, url, {
      headers: { Authorization: authHeader },
    });
    if (status !== 200) throw new Error(`Download failed (${status})`);
    return localUri;
  };

  const shareUri = async (uri: string, type: string, name: string) => {
    if (!Sharing) {
      Alert.alert(
        "Sharing not available",
        "The sharing module is not loaded.",
      );
      return;
    }
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      Alert.alert(
        "Sharing not available",
        "File sharing is not supported on this device.",
      );
      return;
    }
    await Sharing.shareAsync(uri, { mimeType: type, dialogTitle: name });
  };

  const handleOpenAttachment = async (attachment: JmapAttachment) => {
    if (!attachment.blobId || !runtime) return;
    const kind = resolveAttachmentPreviewKind({
      name: attachment.name,
      type: attachment.type,
    });

    if (kind) {
      setPreview({ attachment, kind });
      return;
    }

    // No inline preview available — download then share/open externally.
    const name = attachment.name ?? "attachment";
    const type = attachment.type ?? "application/octet-stream";
    setDownloadingBlobId(attachment.blobId);
    try {
      const localUri = await downloadAttachmentToCache(attachment);
      await shareUri(localUri, type, name);
    } catch (err) {
      Alert.alert(
        "Download failed",
        getErrorMessage(err, "Could not download attachment."),
      );
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
    setActiveSheetView(null);
  };

  const handleMarkUnread = () => {
    if (!message) return;
    markAsUnread.mutate(message.id, {
      onSuccess: () => setActiveSheetView(null),
      onError: (error) =>
        Alert.alert(
          "Could not update message",
          getErrorMessage(error, "Failed to mark message as unread."),
        ),
    });
  };

  const handleMoveToTrash = () => {
    if (!message) return;
    const mutation = currentMailboxRole === "trash" ? deleteMessage : moveToTrash;
    mutation.mutate(message.id, {
      onSuccess: () => router.back(),
      onError: (error) =>
        Alert.alert(
          "Could not delete message",
          getErrorMessage(
            error,
            currentMailboxRole === "trash"
              ? "Failed to delete the message."
              : "Failed to move message to trash.",
          ),
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
          router.back();
        },
        onError: (error) =>
          Alert.alert(
            "Could not move message",
            getErrorMessage(error, "Failed to move the message."),
          ),
      },
    );
  };

  const handleArchive = () => {
    if (!archiveMailboxId) {
      Alert.alert("Archive unavailable", "No archive mailbox is configured.");
      return;
    }
    handleMoveToMailbox(archiveMailboxId);
  };

  const handleRestoreToInbox = () => {
    if (!inboxMailboxId) {
      Alert.alert(
        "Restore unavailable",
        "No inbox mailbox is configured for this account.",
      );
      return;
    }
    handleMoveToMailbox(inboxMailboxId);
  };

  const messageHeader = message ? (
    <>
      <Text style={styles.subject}>
        {message.subject?.trim() || "(no subject)"}
      </Text>

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

      {(message.attachments?.length ?? 0) > 0 ? (
        <View style={styles.attachmentBlock}>
          {message.attachments!.map((attachment, index) => {
            const key = attachment.blobId ?? `${attachment.name}-${index}`;
            const isDownloading = downloadingBlobId === attachment.blobId;
            const previewKind = resolveAttachmentPreviewKind({
              name: attachment.name,
              type: attachment.type,
            });
            return (
              <Pressable
                key={key}
                onPress={() => handleOpenAttachment(attachment)}
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
          loadUri={() => downloadAttachmentToCache(preview.attachment)}
          onClose={() => setPreview(null)}
          onShare={(uri) =>
            shareUri(
              uri,
              preview.attachment.type ?? "application/octet-stream",
              preview.attachment.name ?? "attachment",
            )
          }
        />
      )}

      <BottomSheet
        visible={activeSheetView !== null}
        onDismiss={() => setActiveSheetView(null)}
        snapPoints={activeSheetView === "html" ? [0.92] : [0.45]}
      >
        {activeSheetView === "menu" ? (
          <View style={[styles.sheetContent, { paddingBottom: insets.bottom + 8 }]}>
            <View style={styles.sheetList}>
              <SheetRow icon="corner-up-right" label="Forward" onPress={handleForward} theme={theme} />
              <SheetRow icon="star" label={isFlagged ? "Unstar" : "Star"} onPress={handleToggleStar} theme={theme} showDivider />
              {isSeen ? (
                <SheetRow icon="mail" label="Mark as unread" onPress={handleMarkUnread} theme={theme} showDivider />
              ) : null}
              {(currentMailboxRole === "trash" ||
                currentMailboxRole === "junk") &&
              inboxMailboxId ? (
                <SheetRow icon="inbox" label="Restore to inbox" onPress={handleRestoreToInbox} theme={theme} showDivider />
              ) : null}
              {moveTargets.length > 0 ? (
                <SheetRow icon="folder" label="Move to…" accessory="chevron-right" onPress={() => setActiveSheetView("move")} theme={theme} showDivider />
              ) : null}
              {rawHtmlSource ? (
                <SheetRow icon="code" label="View HTML source" accessory="chevron-right" onPress={() => setActiveSheetView("html")} theme={theme} showDivider />
              ) : null}
            </View>
            <View style={styles.sheetList}>
              <SheetRow
                icon="trash-2"
                label={currentMailboxRole === "trash" ? "Delete message" : "Move to trash"}
                destructive
                onPress={handleMoveToTrash}
                disabled={isActionBusy}
                theme={theme}
              />
            </View>
          </View>
        ) : activeSheetView === "move" ? (
          <View style={[styles.sheetContent, { paddingBottom: insets.bottom + 8 }]}>
            <Pressable
              onPress={() => setActiveSheetView("menu")}
              style={styles.sheetNavButton}
              accessibilityRole="button"
              accessibilityLabel="Back to message actions"
            >
              <Feather name="chevron-left" size={20} color={theme.colors.mutedForeground} />
              <Text style={styles.sheetNavLabel}>Actions</Text>
            </Pressable>
            <View style={styles.sheetList}>
              {moveTargets.map((mailbox, index) => (
                <SheetRow
                  key={mailbox.id}
                  icon="folder"
                  label={mailbox.name}
                  onPress={() => handleMoveToMailbox(mailbox.id)}
                  theme={theme}
                  showDivider={index > 0}
                />
              ))}
            </View>
          </View>
        ) : activeSheetView === "html" ? (
          <View style={styles.sheetView}>
            <Pressable
              onPress={() => setActiveSheetView("menu")}
              style={styles.sheetNavButton}
              accessibilityRole="button"
              accessibilityLabel="Back to message actions"
            >
              <Feather name="chevron-left" size={20} color={theme.colors.mutedForeground} />
              <Text style={styles.sheetNavLabel}>Actions</Text>
            </Pressable>
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

function SheetRow({
  theme,
  icon,
  label,
  accessory,
  destructive,
  disabled,
  onPress,
  showDivider,
}: {
  theme: ThemeTokens;
  icon: keyof typeof Feather.glyphMap;
  label: string;
  accessory?: keyof typeof Feather.glyphMap;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
  showDivider?: boolean;
}) {
  const iconColor = destructive ? theme.colors.destructive : theme.colors.mutedForeground;
  const textColor = destructive ? theme.colors.destructive : theme.colors.foreground;

  return (
    <View>
      {showDivider ? (
        <View
          style={{
            height: StyleSheet.hairlineWidth,
            backgroundColor: theme.colors.border + "50",
            marginLeft: 44,
          }}
        />
      ) : null}
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          {
            flexDirection: "row" as const,
            alignItems: "center" as const,
            gap: 12,
            paddingHorizontal: 14,
            paddingVertical: 13,
            opacity: pressed ? 0.6 : disabled ? 0.45 : 1,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Feather name={icon} size={18} color={iconColor} />
        <Text
          style={{
            flex: 1,
            fontSize: theme.typography.fontSize.base.size,
            color: textColor,
          }}
        >
          {label}
        </Text>
        {accessory ? (
          <Feather name={accessory} size={16} color={theme.colors.mutedForeground} />
        ) : null}
      </Pressable>
    </View>
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
    sheetList: {
      marginHorizontal: 16,
      borderRadius: theme.borderRadius.lg,
      backgroundColor: theme.colors.muted + "22",
      overflow: "hidden" as const,
    },
    sheetNavButton: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 2,
      paddingHorizontal: 16,
      paddingBottom: 4,
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
    subject: {
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
    sheetNavLabel: {
      fontSize: theme.typography.fontSize.sm.size,
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
