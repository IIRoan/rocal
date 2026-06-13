import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppScreen } from "../../../src/components/layout";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { getErrorMessage } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../../src/providers/ThemeProvider";
import { useToast } from "../../../src/providers/ToastProvider";
import { useSidebar } from "../../../src/providers/SidebarProvider";
import { useMailSelection } from "../../../src/providers/MailSelectionProvider";
import { useCommandPalette } from "../../../src/providers/CommandPaletteProvider";
import { CenteredLoader } from "../../../src/components/ui/loading";
import { MailMessageRow } from "../../../src/components/mail/MailMessageRow";
import { MAIL_COMPOSE_LIST_EXTRA } from "../../../src/components/mail/MailComposeButton";
import { mailBottomBarTotalHeight } from "../../../src/components/mail/mail-bottom-action-bar-layout";
import { BottomSheet } from "../../../src/components/BottomSheet";
import { MailBulkMoveSheet } from "../../../src/components/mail/MailBulkMoveSheet";
import { MailBulkMoreSheet } from "../../../src/components/mail/MailBulkMoreSheet";
import { MailBulkLabelsSheet } from "../../../src/components/mail/MailBulkLabelsSheet";
import { MailSheetPanel } from "../../../src/components/mail/MailSheetPanel";
import { MailListHeader } from "../../../src/components/mail/MailListHeader";
import { MailListBottomChrome } from "../../../src/components/mail/MailListBottomChrome";
import { MailListAnimatedFooter } from "../../../src/components/mail/MailListAnimatedFooter";
import { MailSelectionAnimProvider } from "../../../src/components/mail/mail-selection-anim";
import {
  MAIL_ICON,
  mailListSeparatorInset,
} from "../../../src/components/mail/mail-ui";
import { sheetCompactBottomPadding } from "../../../src/components/sheet/sheet-padding";
import {
  useMailAccount,
  useMailConfig,
  useMailMutations,
  useProvisionMailbox,
  useMailRuntime,
  useMailboxMessages,
} from "../../../src/lib/mail/use-mail";
import { useLabels } from "../../../src/lib/mail/use-labels";
import {
  getMailboxIcon,
  getPrimaryMailboxId,
  isDraftMessage,
} from "../../../src/lib/mail/mail-helpers";
import { layoutListSeparator } from "../../../src/lib/app-layout";
import { buildMailConversations } from "../../../src/lib/mail/conversation-thread";
import { useConversationListExtras } from "../../../src/lib/mail/use-conversation-thread";
import { messageHasVisibleAttachments } from "../../../src/lib/mail/message-security";
import {
  isWebMailAvailable,
  openWebMail,
} from "../../../src/lib/mail/mail-web-bridge";
import type { JmapEmailMessage } from "../../../src/lib/mail/types";

type ListSheetView = "bulkMore" | "bulkMove" | "bulkLabel" | null;

const SENDER_AS_RECIPIENT_ROLES = new Set(["sent", "drafts"]);
const MOVE_EXCLUDED_ROLES = new Set(["sent", "drafts"]);

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
    const selected = mailboxes.find(
      (mailbox) => mailbox.id === selectedMailboxId,
    );
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
  const mailboxMessages = useMemo(
    () => messagesQuery.data?.pages.flatMap((page) => page.messages) ?? [],
    [messagesQuery.data?.pages],
  );
  const totalMailboxMessages =
    messagesQuery.data?.pages[0]?.total ?? mailboxMessages.length;
  const companionMessages = useMemo(() => {
    if (!companionMailboxId) return [];
    return (
      companionMessagesQuery.data?.pages.flatMap((page) => page.messages) ?? []
    );
  }, [companionMailboxId, companionMessagesQuery.data?.pages]);

  const allowedMailboxIds = useMemo(
    () =>
      [selectedMailboxId, companionMailboxId].filter((id): id is string =>
        Boolean(id),
      ),
    [selectedMailboxId, companionMailboxId],
  );

  const conversationExtras = useConversationListExtras(
    runtime,
    mailboxMessages,
    companionMessages,
    allowedMailboxIds,
  );
  const {
    toggleFlagged,
    setMessageLabel,
    bulkMarkAsRead,
    bulkMarkAsUnread,
    bulkMoveToTrash,
    bulkMoveToMailbox,
  } = useMailMutations(runtime, selectedMailboxId);
  const { labels } = useLabels({
    runtime,
    enabled: provisioned,
  });
  const { toast } = useToast();
  const insets = useSafeAreaInsets();

  const [activeSheetView, setActiveSheetView] = useState<ListSheetView>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const sheetPadCompact = sheetCompactBottomPadding(insets.bottom);
  const selectionActive = selectedIds.size > 0;
  const bulkIds = useMemo(() => Array.from(selectedIds), [selectedIds]);
  const composeListPadding = MAIL_COMPOSE_LIST_EXTRA + insets.bottom;
  const bulkListPadding = mailBottomBarTotalHeight(insets.bottom);
  const showMailChrome = provisioned && Boolean(runtime);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [selectedMailboxId]);

  const selectedMailbox = runtime?.mailboxes.find(
    (m) => m.id === selectedMailboxId,
  );
  const showRecipient = selectedMailbox?.role
    ? SENDER_AS_RECIPIENT_ROLES.has(selectedMailbox.role)
    : false;

  const primaryMessageIds = useMemo(
    () => new Set(mailboxMessages.map((message) => message.id)),
    [mailboxMessages],
  );

  const threadRows = useMemo(() => {
    const seen = new Set(mailboxMessages.map((message) => message.id));
    const extras = conversationExtras.filter(
      (message) => !seen.has(message.id),
    );
    return buildMailConversations([...mailboxMessages, ...extras]);
  }, [mailboxMessages, conversationExtras]);

  const selectableIds = useMemo(
    () =>
      threadRows.flatMap((row) =>
        row.messageIds.filter((id) => primaryMessageIds.has(id)),
      ),
    [threadRows, primaryMessageIds],
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const messageById = useMemo(() => {
    const map = new Map<string, JmapEmailMessage>();
    for (const message of mailboxMessages) {
      map.set(message.id, message);
    }
    for (const message of conversationExtras) {
      if (!map.has(message.id)) {
        map.set(message.id, message);
      }
    }
    return map;
  }, [mailboxMessages, conversationExtras]);

  const unreadSelectedIds = useMemo(
    () => bulkIds.filter((id) => !messageById.get(id)?.keywords?.["$seen"]),
    [bulkIds, messageById],
  );

  const readSelectedIds = useMemo(
    () => bulkIds.filter((id) => messageById.get(id)?.keywords?.["$seen"]),
    [bulkIds, messageById],
  );

  const unflaggedSelectedIds = useMemo(
    () => bulkIds.filter((id) => !messageById.get(id)?.keywords?.["$flagged"]),
    [bulkIds, messageById],
  );

  const flaggedSelectedIds = useMemo(
    () => bulkIds.filter((id) => messageById.get(id)?.keywords?.["$flagged"]),
    [bulkIds, messageById],
  );

  const handleOpenMessage = useCallback(
    (message: JmapEmailMessage) => {
      const mailboxes = runtime?.mailboxes ?? [];
      if (isDraftMessage(message, selectedMailboxId, mailboxes)) {
        router.push(
          `/(tabs)/mail/compose?mode=draft&messageId=${message.id}` as never,
        );
        return;
      }
      router.push(`/(tabs)/mail/message/${message.id}` as never);
    },
    [router, runtime?.mailboxes, selectedMailboxId],
  );

  const toggleThreadSelection = useCallback((messageIds: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = messageIds.every((id) => next.has(id));
      for (const id of messageIds) {
        if (allSelected) {
          next.delete(id);
        } else {
          next.add(id);
        }
      }
      return next;
    });
  }, []);

  const handleToggleSelect = useCallback(
    (message: JmapEmailMessage, threadMessageIds: string[]) => {
      const ids = threadMessageIds.filter((id) => primaryMessageIds.has(id));
      if (ids.length === 0) {
        toggleThreadSelection([message.id]);
        return;
      }
      toggleThreadSelection(ids);
    },
    [primaryMessageIds, toggleThreadSelection],
  );

  const handleLongPress = useCallback(
    (message: JmapEmailMessage, threadMessageIds: string[]) => {
      handleToggleSelect(message, threadMessageIds);
    },
    [handleToggleSelect],
  );

  const bulkMoveTargets = useMemo(() => {
    if (!runtime) return [];
    return runtime.mailboxes.filter(
      (mailbox) =>
        mailbox.id !== selectedMailboxId &&
        !MOVE_EXCLUDED_ROLES.has(mailbox.role?.toLowerCase() ?? ""),
    );
  }, [runtime, selectedMailboxId]);

  const bulkMoveSnapPoints = useMemo(() => {
    const count = Math.max(bulkMoveTargets.length, 1);
    const fraction = 0.12 + Math.min(count, 7) * 0.05;
    return [Math.min(0.48, Math.max(0.24, fraction))];
  }, [bulkMoveTargets.length]);

  const trashMailboxId = useMemo(
    () => runtime?.mailboxes.find((m) => m.role === "trash")?.id ?? null,
    [runtime?.mailboxes],
  );
  const isInTrash = selectedMailboxId === trashMailboxId;

  const handleBulkMarkRead = useCallback(() => {
    if (unreadSelectedIds.length === 0) return;
    bulkMarkAsRead.mutate(unreadSelectedIds, {
      onSuccess: () => {
        clearSelection();
        setActiveSheetView(null);
        toast(
          unreadSelectedIds.length === 1
            ? "Marked 1 as read"
            : `Marked ${unreadSelectedIds.length} as read`,
        );
      },
      onError: (error) =>
        toast(
          getErrorMessage(error, "Failed to mark messages as read."),
          "error",
        ),
    });
  }, [unreadSelectedIds, bulkMarkAsRead, clearSelection, toast]);

  const handleBulkMarkUnread = useCallback(() => {
    if (readSelectedIds.length === 0) return;
    bulkMarkAsUnread.mutate(readSelectedIds, {
      onSuccess: () => {
        clearSelection();
        setActiveSheetView(null);
        toast(
          readSelectedIds.length === 1
            ? "Marked 1 as unread"
            : `Marked ${readSelectedIds.length} as unread`,
        );
      },
      onError: (error) =>
        toast(
          getErrorMessage(error, "Failed to mark messages as unread."),
          "error",
        ),
    });
  }, [readSelectedIds, bulkMarkAsUnread, clearSelection, toast]);

  const handleBulkTrash = useCallback(() => {
    if (bulkIds.length === 0) return;
    setActiveSheetView(null);
    bulkMoveToTrash.mutate(bulkIds, {
      onSuccess: () => {
        clearSelection();
        toast(
          isInTrash
            ? `Deleted ${bulkIds.length} messages`
            : `Moved ${bulkIds.length} to trash`,
        );
      },
      onError: (error) =>
        toast(
          getErrorMessage(
            error,
            isInTrash
              ? "Failed to delete messages."
              : "Failed to move messages to trash.",
          ),
          "error",
        ),
    });
  }, [bulkIds, bulkMoveToTrash, clearSelection, isInTrash, toast]);

  const handleBulkMove = useCallback(
    (targetMailboxId: string) => {
      if (bulkIds.length === 0) return;
      const targetName =
        runtime?.mailboxes.find((m) => m.id === targetMailboxId)?.name ??
        "mailbox";
      bulkMoveToMailbox.mutate(
        { messageIds: bulkIds, targetMailboxId },
        {
          onSuccess: () => {
            clearSelection();
            setActiveSheetView(null);
            toast(`Moved ${bulkIds.length} to ${targetName}`);
          },
          onError: (error) =>
            toast(getErrorMessage(error, "Failed to move messages."), "error"),
        },
      );
    },
    [bulkIds, bulkMoveToMailbox, clearSelection, runtime?.mailboxes, toast],
  );

  const [bulkActionPending, setBulkActionPending] = useState(false);

  const isActionBusy =
    bulkActionPending ||
    bulkMarkAsRead.isPending ||
    bulkMarkAsUnread.isPending ||
    bulkMoveToTrash.isPending ||
    bulkMoveToMailbox.isPending ||
    toggleFlagged.isPending ||
    setMessageLabel.isPending;

  const handleBulkStar = useCallback(async () => {
    if (unflaggedSelectedIds.length === 0) return;
    setBulkActionPending(true);
    setActiveSheetView(null);
    try {
      await Promise.all(
        unflaggedSelectedIds.map((id) =>
          toggleFlagged.mutateAsync({ messageId: id, flagged: true }),
        ),
      );
      toast(
        unflaggedSelectedIds.length === 1
          ? "Starred 1 message"
          : `Starred ${unflaggedSelectedIds.length} messages`,
      );
      clearSelection();
    } catch (error) {
      toast(getErrorMessage(error, "Failed to star messages."), "error");
    } finally {
      setBulkActionPending(false);
    }
  }, [unflaggedSelectedIds, toggleFlagged, clearSelection, toast]);

  const handleBulkUnstar = useCallback(async () => {
    if (flaggedSelectedIds.length === 0) return;
    setBulkActionPending(true);
    setActiveSheetView(null);
    try {
      await Promise.all(
        flaggedSelectedIds.map((id) =>
          toggleFlagged.mutateAsync({ messageId: id, flagged: false }),
        ),
      );
      toast(
        flaggedSelectedIds.length === 1
          ? "Unstarred 1 message"
          : `Unstarred ${flaggedSelectedIds.length} messages`,
      );
      clearSelection();
    } catch (error) {
      toast(getErrorMessage(error, "Failed to unstar messages."), "error");
    } finally {
      setBulkActionPending(false);
    }
  }, [flaggedSelectedIds, toggleFlagged, clearSelection, toast]);

  const handleBulkApplyLabel = useCallback(
    async (labelId: string) => {
      if (bulkIds.length === 0) return;
      const label = labels.find((l) => l.id === labelId);
      setBulkActionPending(true);
      setActiveSheetView(null);
      try {
        await Promise.all(
          bulkIds.map((id) =>
            setMessageLabel.mutateAsync({
              messageId: id,
              labelId,
              assigned: true,
            }),
          ),
        );
        toast(
          `Applied "${label?.name ?? labelId}" to ${bulkIds.length} messages`,
        );
        clearSelection();
      } catch (error) {
        toast(getErrorMessage(error, "Failed to apply label."), "error");
      } finally {
        setBulkActionPending(false);
      }
    },
    [bulkIds, labels, setMessageLabel, clearSelection, toast],
  );

  const bulkSheetSnapPoints = useMemo(() => {
    if (activeSheetView === "bulkLabel") return [0.55];
    if (activeSheetView === "bulkMove") return bulkMoveSnapPoints;
    if (activeSheetView === "bulkMore") return [0.32];
    return [0.4];
  }, [activeSheetView, bulkMoveSnapPoints]);

  const listExtraData = useMemo(
    () => ({
      mailboxId: selectedMailboxId,
      selectionActive,
      selectedKey: Array.from(selectedIds).sort().join(","),
    }),
    [selectedMailboxId, selectionActive, selectedIds],
  );

  const renderItem = useCallback(
    ({ item }: { item: (typeof threadRows)[number] }) => {
      const unreadCount = item.messages.filter(
        (entry) =>
          primaryMessageIds.has(entry.id) && !entry.keywords?.["$seen"],
      ).length;
      const hasAttachments = item.messages.some((entry) =>
        messageHasVisibleAttachments(entry),
      );
      const rowSelectableIds = item.messageIds.filter((id) =>
        primaryMessageIds.has(id),
      );
      const selectedCount = rowSelectableIds.filter((id) =>
        selectedIds.has(id),
      ).length;
      const isRowSelected =
        selectedCount > 0 ||
        (rowSelectableIds.length === 0 &&
          selectedIds.has(item.latestMessage.id));

      return (
        <MailMessageRow
          message={item.latestMessage}
          threadMessages={item.messages}
          threadCount={item.messages.length}
          threadUnreadCount={unreadCount}
          hasAttachments={hasAttachments}
          showRecipient={showRecipient}
          labels={labels}
          selectionActive={selectionActive}
          selected={isRowSelected}
          onPress={handleOpenMessage}
          onLongPress={(message) => handleLongPress(message, item.messageIds)}
          onToggleSelect={(message) =>
            handleToggleSelect(message, item.messageIds)
          }
        />
      );
    },
    [
      handleOpenMessage,
      handleLongPress,
      handleToggleSelect,
      showRecipient,
      labels,
      primaryMessageIds,
      selectedIds,
      selectionActive,
      threadRows,
    ],
  );

  const listFooter = useMemo(
    () => (
      <>
        {messagesQuery.isFetchingNextPage ? (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.colors.primaryBase} />
          </View>
        ) : null}
        {showMailChrome ? (
          <MailListAnimatedFooter
            composePadding={composeListPadding}
            bulkPadding={bulkListPadding}
          />
        ) : null}
      </>
    ),
    [
      showMailChrome,
      composeListPadding,
      bulkListPadding,
      messagesQuery.isFetchingNextPage,
      styles.centered,
      theme.colors.primaryBase,
    ],
  );

  const handleSelectAll = useCallback(() => {
    const allSelected =
      selectableIds.length > 0 &&
      selectableIds.every((id) => selectedIds.has(id));
    setSelectedIds(allSelected ? new Set() : new Set(selectableIds));
  }, [selectableIds, selectedIds]);

  return (
    <MailSelectionAnimProvider active={selectionActive}>
      <AppScreen
        header={
          <MailListHeader
            selectedCount={selectedIds.size}
            totalCount={selectableIds.length}
            mailboxName={selectedMailbox?.name ?? "Mail"}
            mailboxIcon={
              selectedMailbox
                ? (getMailboxIcon(
                    selectedMailbox,
                  ) as keyof typeof Feather.glyphMap)
                : "mail"
            }
            onMenu={toggleSidebar}
            onSearch={openCommandPalette}
            onClearSelection={clearSelection}
            onSelectAll={handleSelectAll}
          />
        }
      >
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
          <View style={styles.listArea}>
            <FlatList
              key={selectedMailboxId ?? "mailbox"}
              style={styles.listFlex}
              data={threadRows}
              keyExtractor={(item) => item.id}
              extraData={listExtraData}
              renderItem={renderItem}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              refreshing={
                messagesQuery.isFetching &&
                !messagesQuery.isLoading &&
                !messagesQuery.isFetchingNextPage
              }
              onRefresh={() => {
                void messagesQuery.refetch();
                void companionMessagesQuery.refetch();
              }}
              onEndReached={() => {
                if (
                  messagesQuery.hasNextPage &&
                  !messagesQuery.isFetchingNextPage
                ) {
                  void messagesQuery.fetchNextPage();
                }
              }}
              onEndReachedThreshold={0.4}
              contentContainerStyle={
                threadRows.length === 0 ? styles.emptyListContent : undefined
              }
              ListFooterComponent={listFooter}
              ListEmptyComponent={
                messagesQuery.isLoading ? (
                  <CenteredLoader theme={theme} />
                ) : (
                  <View style={styles.centered}>
                    <Feather
                      name="inbox"
                      size={MAIL_ICON.emptyState}
                      color={theme.colors.mutedForeground}
                    />
                    <Text style={styles.mutedText}>No messages here</Text>
                  </View>
                )
              }
            />
          </View>
        )}

        {showMailChrome ? (
          <MailListBottomChrome
            bottomInset={insets.bottom}
            composeOnPress={() => router.push("/(tabs)/mail/compose" as never)}
            bulk={{
              isInTrash,
              canMarkRead: unreadSelectedIds.length > 0,
              canMarkUnread: readSelectedIds.length > 0,
              busy: isActionBusy,
              onMarkRead: handleBulkMarkRead,
              onMarkUnread: handleBulkMarkUnread,
              onTrash: handleBulkTrash,
              onMore: () => setActiveSheetView("bulkMore"),
            }}
          />
        ) : null}

        <BottomSheet
          visible={activeSheetView !== null}
          onDismiss={() => setActiveSheetView(null)}
          snapPoints={bulkSheetSnapPoints}
        >
          {activeSheetView === "bulkMore" ? (
            <MailSheetPanel bottomInset={insets.bottom}>
              <MailBulkMoreSheet
                showStar={unflaggedSelectedIds.length > 0}
                showUnstar={flaggedSelectedIds.length > 0}
                showMove={bulkMoveTargets.length > 0}
                onStar={() => void handleBulkStar()}
                onUnstar={() => void handleBulkUnstar()}
                onLabels={() => setActiveSheetView("bulkLabel")}
                onMove={() => setActiveSheetView("bulkMove")}
              />
            </MailSheetPanel>
          ) : activeSheetView === "bulkMove" ? (
            <MailBulkMoveSheet
              mailboxes={bulkMoveTargets}
              bottomInset={sheetPadCompact}
              disabled={isActionBusy || bulkIds.length === 0}
              onSelectMailbox={handleBulkMove}
            />
          ) : activeSheetView === "bulkLabel" ? (
            <MailSheetPanel bottomInset={insets.bottom}>
              <MailBulkLabelsSheet
                labels={labels}
                onBack={() => setActiveSheetView("bulkMore")}
                onApplyLabel={(labelId) => void handleBulkApplyLabel(labelId)}
              />
            </MailSheetPanel>
          ) : null}
        </BottomSheet>
      </AppScreen>
    </MailSelectionAnimProvider>
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
        size={MAIL_ICON.emptyState}
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
      <Feather
        name="mail"
        size={MAIL_ICON.emptyState}
        color={theme.colors.primaryBase}
      />
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

function createStyles(theme: ThemeTokens) {
  const separatorInset = mailListSeparatorInset(theme);

  const view = {
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
      position: "relative",
    },
    listArea: {
      flex: 1,
    },
    listFlex: {
      flex: 1,
    },
    separator: {
      ...layoutListSeparator(theme),
      marginLeft: separatorInset,
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
