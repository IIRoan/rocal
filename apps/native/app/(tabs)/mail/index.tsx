import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { FontAwesome } from "@expo/vector-icons";
import { getErrorMessage } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../../src/providers/ThemeProvider";
import { useToast } from "../../../src/providers/ToastProvider";
import { useSidebar } from "../../../src/providers/SidebarProvider";
import { useMailSelection } from "../../../src/providers/MailSelectionProvider";
import { useCommandPalette } from "../../../src/providers/CommandPaletteProvider";
import { CenteredLoader } from "../../../src/components/ui/loading";
import { MailMessageRow } from "../../../src/components/mail/MailMessageRow";
import { BottomSheet } from "../../../src/components/BottomSheet";
import {
  SheetList,
  SheetNavButton,
  SheetRow,
} from "../../../src/components/sheet";
import { MailLabelsSheet } from "../../../src/components/mail/MailLabelsSheet";
import {
  useMailAccount,
  useMailConfig,
  useMailMutations,
  useProvisionMailbox,
  useMailRuntime,
  useMailboxMessages,
} from "../../../src/lib/mail/use-mail";
import { useLabels } from "../../../src/lib/mail/use-labels";
import { getMailboxIcon, getPrimaryMailboxId } from "../../../src/lib/mail/mail-helpers";
import { buildMailConversations } from "../../../src/lib/mail/conversation-thread";
import { useConversationListExtras } from "../../../src/lib/mail/use-conversation-thread";
import { messageHasVisibleAttachments } from "../../../src/lib/mail/message-security";
import {
  isWebMailAvailable,
  openWebMail,
} from "../../../src/lib/mail/mail-web-bridge";
import type { JmapEmailMessage, JmapMailbox } from "../../../src/lib/mail/types";

type ListSheetView = "menu" | "label" | "move" | null;

const SENDER_AS_RECIPIENT_ROLES = new Set(["sent", "drafts"]);

export default function MailScreen() {
  const { theme } = useTheme();
  const { toggle: toggleSidebar } = useSidebar();
  const { open: openCommandPalette } = useCommandPalette();
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const accountQuery = useMailAccount();
  const configQuery = useMailConfig();
  const provisionMailbox = useProvisionMailbox();
  const provisioned = accountQuery.data?.provisioned ?? false;
  const runtimeQuery = useMailRuntime(provisioned);
  const runtime = runtimeQuery.data;

  const { selectedMailboxId, setSelectedMailboxId } = useMailSelection();

  useEffect(() => {
    if (!runtime || selectedMailboxId) return;
    const inbox =
      getPrimaryMailboxId(runtime.mailboxes, "inbox") ??
      runtime.mailboxes[0]?.id ??
      null;
    setSelectedMailboxId(inbox);
  }, [runtime, selectedMailboxId, setSelectedMailboxId]);

  const messagesQuery = useMailboxMessages(runtime, selectedMailboxId);
  const companionMailboxId = useMemo(() => {
    const mailboxes = runtime?.mailboxes ?? [];
    const selected = mailboxes.find((mailbox) => mailbox.id === selectedMailboxId);
    const role = selected?.role?.toLowerCase();
    if (role === "inbox") {
      return getPrimaryMailboxId(mailboxes, "sent");
    }
    if (role === "sent") {
      return getPrimaryMailboxId(mailboxes, "inbox");
    }
    return null;
  }, [runtime?.mailboxes, selectedMailboxId]);
  const companionMessagesQuery = useMailboxMessages(
    runtime,
    companionMailboxId && companionMailboxId !== selectedMailboxId
      ? companionMailboxId
      : null,
  );
  const mailboxMessages = messagesQuery.data?.messages ?? [];
  const conversationExtras = useConversationListExtras(
    runtime,
    mailboxMessages,
    companionMessagesQuery.data?.messages ?? [],
  );
  const {
    markAsRead,
    markAsUnread,
    toggleFlagged,
    moveToTrash,
    deleteMessage,
    moveToMailbox,
    setMessageLabel,
  } = useMailMutations(runtime, selectedMailboxId);
  const { labels, createLabel, deleteLabel } = useLabels({
    runtime,
    enabled: provisioned,
  });
  const { toast } = useToast();
  const insets = useSafeAreaInsets();

  const [activeSheetMessage, setActiveSheetMessage] = useState<JmapEmailMessage | null>(null);
  const [activeSheetView, setActiveSheetView] = useState<ListSheetView>(null);

  const selectedMailbox = runtime?.mailboxes.find(
    (m) => m.id === selectedMailboxId,
  );
  const showRecipient = selectedMailbox?.role
    ? SENDER_AS_RECIPIENT_ROLES.has(selectedMailbox.role)
    : false;

  const handleOpenMessage = useCallback(
    (message: JmapEmailMessage) => {
      if (runtime && !message.keywords?.["$seen"]) {
        markAsRead.mutate(message.id);
      }
      router.push(`/(tabs)/mail/message/${message.id}` as never);
    },
    [router, runtime, markAsRead],
  );

  const handleLongPress = useCallback((message: JmapEmailMessage) => {
    setActiveSheetMessage(message);
    setActiveSheetView("menu");
  }, []);

  const handleToggleStar = useCallback(() => {
    if (!activeSheetMessage) return;
    const isFlagged = Boolean(activeSheetMessage.keywords?.["$flagged"]);
    toggleFlagged.mutate({ messageId: activeSheetMessage.id, flagged: !isFlagged });
    toast(isFlagged ? "Unstarred" : "Starred");
    setActiveSheetView(null);
  }, [activeSheetMessage, toggleFlagged, toast]);

  const handleMarkUnread = useCallback(() => {
    if (!activeSheetMessage) return;
    markAsUnread.mutate(activeSheetMessage.id, {
      onSuccess: () => {
        setActiveSheetView(null);
        toast("Marked as unread");
      },
      onError: (error) =>
        toast(getErrorMessage(error, "Failed to mark message as unread."), "error"),
    });
  }, [activeSheetMessage, markAsUnread, toast]);

  const handleMoveToTrash = useCallback(() => {
    if (!activeSheetMessage) return;
    setActiveSheetView(null);
    const currentMailboxId = Object.keys(activeSheetMessage.mailboxIds ?? {})[0] ?? null;
    const currentMailbox = runtime?.mailboxes.find((m) => m.id === currentMailboxId);
    const isInTrash = currentMailbox?.role === "trash";
    const mutation = isInTrash ? deleteMessage : moveToTrash;
    const successMessage = isInTrash ? "Message deleted" : "Message moved to trash";
    mutation.mutate(activeSheetMessage.id, {
      onSuccess: () => toast(successMessage),
      onError: (error) =>
        toast(
          getErrorMessage(
            error,
            isInTrash ? "Failed to delete the message." : "Failed to move message to trash.",
          ),
          "error",
        ),
    });
  }, [activeSheetMessage, deleteMessage, moveToTrash, runtime, toast]);

  const handleMoveToMailbox = useCallback(
    (targetMailboxId: string) => {
      if (!activeSheetMessage) return;
      moveToMailbox.mutate(
        { messageId: activeSheetMessage.id, targetMailboxId },
        {
          onSuccess: () => {
            setActiveSheetView(null);
            toast("Message moved");
          },
          onError: (error) =>
            toast(getErrorMessage(error, "Failed to move the message."), "error"),
        },
      );
    },
    [activeSheetMessage, moveToMailbox, toast],
  );

  const moveTargets = useMemo(() => {
    if (!runtime || !activeSheetMessage) return [];
    const activeMailboxIds = new Set(Object.keys(activeSheetMessage.mailboxIds ?? {}));
    return runtime.mailboxes.filter((mailbox) => !activeMailboxIds.has(mailbox.id));
  }, [activeSheetMessage, runtime]);

  const threadRows = useMemo(() => {
    const seen = new Set(mailboxMessages.map((message) => message.id));
    const extras = conversationExtras.filter((message) => !seen.has(message.id));
    return buildMailConversations([...mailboxMessages, ...extras]);
  }, [mailboxMessages, conversationExtras]);

  const isActionBusy =
    markAsUnread.isPending ||
    toggleFlagged.isPending ||
    moveToTrash.isPending ||
    deleteMessage.isPending ||
    moveToMailbox.isPending;

  const renderItem = useCallback(
    ({ item }: { item: (typeof threadRows)[number] }) => {
      const primaryIds = new Set(
        (messagesQuery.data?.messages ?? []).map((message) => message.id),
      );
      const unreadCount = item.messages.filter(
        (entry) => primaryIds.has(entry.id) && !entry.keywords?.["$seen"],
      ).length;
      const hasAttachments = item.messages.some((entry) =>
        messageHasVisibleAttachments(entry),
      );

      return (
        <MailMessageRow
          message={item.latestMessage}
          threadMessages={item.messages}
          threadCount={item.messages.length}
          threadUnreadCount={unreadCount}
          hasAttachments={hasAttachments}
          showRecipient={showRecipient}
          labels={labels}
          onPress={handleOpenMessage}
          onLongPress={handleLongPress}
        />
      );
    },
    [
      handleOpenMessage,
      handleLongPress,
      showRecipient,
      labels,
      messagesQuery.data?.messages,
      threadRows,
    ],
  );

  const header = (
    <View style={styles.header}>
      <Pressable
        onPress={toggleSidebar}
        style={styles.iconButton}
        accessibilityRole="button"
        accessibilityLabel="Open menu"
      >
        <Feather name="menu" size={22} color={theme.colors.foreground} />
      </Pressable>
      <View style={styles.headerRight}>
        <Pressable
          onPress={openCommandPalette}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel="Search and commands"
        >
          <Feather name="search" size={20} color={theme.colors.foreground} />
        </Pressable>
        <Pressable
          onPress={() => router.push("/(tabs)/mail/compose" as never)}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel="Compose message"
        >
          <Feather name="edit" size={20} color={theme.colors.foreground} />
        </Pressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {header}

      {accountQuery.isLoading ? (
        <CenteredLoader theme={theme} />
      ) : accountQuery.isError ? (
        <ErrorState
          theme={theme}
          message={getErrorMessage(accountQuery.error, "Failed to load mail")}
          onRetry={() => accountQuery.refetch()}
        />
      ) : !provisioned ? (
        <SetupState
          theme={theme}
          canCreateMailbox={configQuery.data?.signupEnabled ?? true}
          isSettingUp={provisionMailbox.isPending}
          errorMessage={
            provisionMailbox.error
              ? getErrorMessage(
                  provisionMailbox.error,
                  "Could not create your mailbox.",
                )
              : null
          }
          onSetup={() => provisionMailbox.mutate()}
        />
      ) : runtimeQuery.isLoading ? (
        <CenteredLoader theme={theme} message="Connecting to your mailbox…" />
      ) : runtimeQuery.isError ? (
        <ErrorState
          theme={theme}
          message={getErrorMessage(
            runtimeQuery.error,
            "Failed to connect to your mailbox",
          )}
          onRetry={() => runtimeQuery.refetch()}
        />
      ) : (
        <>
          <MailboxBar
            theme={theme}
            mailboxes={runtime?.mailboxes ?? []}
            selectedId={selectedMailboxId}
            onSelect={setSelectedMailboxId}
          />
          <FlatList
            data={threadRows}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            ItemSeparatorComponent={() => (
              <View style={styles.separator} />
            )}
            refreshing={messagesQuery.isFetching && !messagesQuery.isLoading}
            onRefresh={() => {
              void messagesQuery.refetch();
              void companionMessagesQuery.refetch();
            }}
            contentContainerStyle={
              threadRows.length === 0
                ? styles.emptyListContent
                : undefined
            }
            ListEmptyComponent={
              messagesQuery.isLoading ? (
                <CenteredLoader theme={theme} />
              ) : (
                <View style={styles.centered}>
                  <Feather
                    name="inbox"
                    size={40}
                    color={theme.colors.mutedForeground}
                  />
                  <Text style={styles.mutedText}>No messages here</Text>
                </View>
              )
            }
          />
        </>
      )}

      <BottomSheet
        visible={activeSheetView !== null}
        onDismiss={() => setActiveSheetView(null)}
        onCloseComplete={() => setActiveSheetMessage(null)}
        snapPoints={activeSheetView === "label" ? [0.65] : activeSheetView === "move" ? [0.55] : [0.45]}
      >
        {activeSheetView === "menu" && activeSheetMessage ? (
          <View style={{ paddingBottom: insets.bottom + 8, paddingHorizontal: 16, gap: 8 }}>
            <SheetList>
              <SheetRow
                icon="star"
                label={activeSheetMessage.keywords?.["$flagged"] ? "Unstar" : "Star"}
                iconColor={activeSheetMessage.keywords?.["$flagged"] ? "#fbbf24" : undefined}
                onPress={handleToggleStar}
              />
              {activeSheetMessage.keywords?.["$seen"] ? (
                <SheetRow
                  icon="mail"
                  label="Mark as unread"
                  onPress={handleMarkUnread}
                  showDivider
                />
              ) : null}
              <SheetRow
                icon="tag"
                label="Labels"
                accessory="chevron-right"
                onPress={() => setActiveSheetView("label")}
                showDivider
              />
              {moveTargets.length > 0 ? (
                <SheetRow
                  icon="folder"
                  label="Move to…"
                  accessory="chevron-right"
                  onPress={() => setActiveSheetView("move")}
                  showDivider
                />
              ) : null}
              <SheetRow
                icon="trash-2"
                label="Move to trash"
                destructive
                onPress={handleMoveToTrash}
                disabled={isActionBusy}
                showDivider={moveTargets.length > 0 || activeSheetMessage.keywords?.["$seen"]}
              />
            </SheetList>
          </View>
        ) : activeSheetView === "move" && activeSheetMessage ? (
          <View style={{ paddingBottom: insets.bottom + 8, paddingHorizontal: 16, gap: 8 }}>
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
        ) : activeSheetView === "label" && activeSheetMessage ? (
          <MailLabelsSheet
            labels={labels}
            messageKeywords={activeSheetMessage.keywords}
            insetsBottom={insets.bottom}
            onBack={() => setActiveSheetView("menu")}
            onToggleLabel={(labelId, assigned) => {
              setMessageLabel.mutate({ messageId: activeSheetMessage.id, labelId, assigned });
              setActiveSheetView(null);
              const label = labels.find((l) => l.id === labelId);
              toast(assigned ? `Added "${label?.name ?? labelId}"` : `Removed "${label?.name ?? labelId}"`);
            }}
            onCreateLabel={async (name, color) => {
              const newLabel = await createLabel(name, color);
              setMessageLabel.mutate({ messageId: activeSheetMessage.id, labelId: newLabel.id, assigned: true });
              toast(`Created "${newLabel.name}"`);
              setActiveSheetView(null);
            }}
            onDeleteLabel={async (labelId) => {
              const label = labels.find((l) => l.id === labelId);
              await deleteLabel(labelId);
              toast(`Deleted "${label?.name ?? labelId}"`);
            }}
          />
        ) : null}
      </BottomSheet>
    </SafeAreaView>
  );
}

function ErrorState({
  theme,
  message,
  onRetry,
}: {
  theme: ThemeTokens;
  message: string;
  onRetry: () => void;
}) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.centered}>
      <Feather
        name="alert-triangle"
        size={36}
        color={theme.colors.destructive}
      />
      <Text style={styles.errorText}>{message}</Text>
      <Pressable onPress={onRetry} style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>Try again</Text>
      </Pressable>
      {isWebMailAvailable() ? (
        <Pressable onPress={() => openWebMail()} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Open secure web mail</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function SetupState({
  theme,
  canCreateMailbox,
  isSettingUp,
  errorMessage,
  onSetup,
}: {
  theme: ThemeTokens;
  canCreateMailbox: boolean;
  isSettingUp: boolean;
  errorMessage: string | null;
  onSetup: () => void;
}) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.centered}>
      <Feather name="mail" size={44} color={theme.colors.primaryBase} />
      <Text style={styles.setupTitle}>Set up your mailbox</Text>
      <Text style={styles.mutedText}>
        Create your encrypted mailbox on this device. Solace generates a random
        OpenPGP keypair locally, uploads only the public key, and stores your
        private key in an encrypted vault backup.
      </Text>
      {errorMessage ? (
        <Text style={styles.errorText}>{errorMessage}</Text>
      ) : null}
      {canCreateMailbox ? (
        <Pressable
          onPress={onSetup}
          disabled={isSettingUp}
          style={[
            styles.primaryButton,
            isSettingUp && styles.primaryButtonDisabled,
          ]}
        >
          {isSettingUp ? (
            <ActivityIndicator
              size="small"
              color={theme.colors.primaryForeground}
            />
          ) : null}
          <Text style={styles.primaryButtonText}>
            {isSettingUp ? "Creating mailbox…" : "Create mailbox here"}
          </Text>
        </Pressable>
      ) : isWebMailAvailable() ? (
        <Pressable onPress={() => openWebMail()} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Open secure web mail</Text>
        </Pressable>
      ) : (
        <Text style={styles.mutedText}>
          Mailbox setup is disabled for this environment.
        </Text>
      )}
      {canCreateMailbox && isWebMailAvailable() ? (
        <Pressable onPress={() => openWebMail()} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Open secure web mail</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function MailboxBar({
  theme,
  mailboxes,
  selectedId,
  onSelect,
}: {
  theme: ThemeTokens;
  mailboxes: JmapMailbox[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.mailboxBarWrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.mailboxBar}
      >
        {mailboxes.map((mailbox) => {
          const active = mailbox.id === selectedId;
          return (
            <Pressable
              key={mailbox.id}
              onPress={() => onSelect(mailbox.id)}
              style={[styles.chip, active && styles.chipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Feather
                name={getMailboxIcon(mailbox) as keyof typeof Feather.glyphMap}
                size={14}
                color={
                  active
                    ? theme.colors.primaryForeground
                    : theme.colors.mutedForeground
                }
              />
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {mailbox.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
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
      justifyContent: "space-between" as const,
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
    headerRight: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
    },
    mailboxBarWrap: {
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    mailboxBar: {
      flexDirection: "row" as const,
      gap: theme.spacing["2"],
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["2"],
    },
    chip: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["1"],
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["1"],
      borderRadius: theme.borderRadius.full,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.card,
    },
    chipActive: {
      backgroundColor: theme.colors.primaryBase,
      borderColor: theme.colors.primaryBase,
    },
    separator: {
      height: 1,
      marginLeft: theme.spacing["4"] + 40 + theme.spacing["3"],
      backgroundColor: theme.colors.border,
    },
    centered: {
      flex: 1,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: theme.spacing["3"],
      paddingHorizontal: theme.spacing["6"],
    },
    emptyListContent: {
      flexGrow: 1,
    },
    primaryButton: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["2"],
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["2"],
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.primaryBase,
    },
    primaryButtonDisabled: {
      opacity: 0.7,
    },
    secondaryButton: {
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["2"],
      borderRadius: theme.borderRadius.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },

  } satisfies Record<string, ViewStyle>;

  const text = {
    mutedText: {
      textAlign: "center" as const,
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
    },
    errorText: {
      textAlign: "center" as const,
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
    },
    setupTitle: {
      fontSize: theme.typography.fontSize.lg.size,
      lineHeight: theme.typography.fontSize.lg.lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    chipText: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.mutedForeground,
    },
    chipTextActive: {
      color: theme.colors.primaryForeground,
    },
    primaryButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.primaryForeground,
    },
    secondaryButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },

  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
