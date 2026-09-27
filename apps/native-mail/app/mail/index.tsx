import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppScreen } from "@workspace/native-core/components/layout";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_MAIL_LIST_FILTERS,
  applyMailListFilters,
  buildMailboxFieldSearchFilter,
  countActiveMailListFilters,
  getErrorMessage,
  hasMailSearchFieldValues,
  type MailListFilters,
  type MailSearchFieldValues,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { useToast } from "@workspace/native-core/providers/ToastProvider";
import { useMailCompose } from "../../src/providers/MailComposeProvider";
import { useMailSelection } from "../../src/providers/MailSelectionProvider";
import { useCommandPalette } from "@workspace/native-core/providers/CommandPaletteProvider";
import { CenteredLoader } from "@workspace/native-core/components/ui/loading";
import { MailMessageRow } from "../../src/components/mail/MailMessageRow";
import { mailBottomBarTotalHeight } from "../../src/components/mail/mail-bottom-action-bar-layout";
import {
  BottomSheet,
  BottomSheetHeader,
  BottomSheetTitle,
} from "@workspace/native-core/components/BottomSheet";
import { MailBulkMoveSheet } from "../../src/components/mail/MailBulkMoveSheet";
import { MailBulkMoreSheet } from "../../src/components/mail/MailBulkMoreSheet";
import { MailBulkLabelsSheet } from "../../src/components/mail/MailBulkLabelsSheet";
import { MailSheetPanel } from "../../src/components/mail/MailSheetPanel";
import { MailSwipeRow } from "../../src/components/mail/MailSwipeRow";
import { MailboxDrawerSheet } from "../../src/components/mail/MailboxDrawerSheet";
import { MailFilterSheet } from "../../src/components/mail/MailFilterSheet";
import { MailAccountSheet } from "../../src/components/MailAccountSheet";
import { mailMessageRoute } from "../../src/lib/mail-routes";
import { MailListHeader } from "../../src/components/mail/MailListHeader";
import { MailListBottomChrome } from "../../src/components/mail/MailListBottomChrome";
import { MailListAnimatedFooter } from "../../src/components/mail/MailListAnimatedFooter";
import { MailSelectionAnimProvider } from "../../src/components/mail/mail-selection-anim";
import {
  MAIL_ICON,
  mailListSeparatorInset,
} from "@workspace/native-core/components/mail/mail-ui";
import { sheetCompactBottomPadding } from "@workspace/native-core/components/sheet/sheet-padding";
import {
  useMailAccount,
  useMailConfig,
  useMailMutations,
  useProvisionMailbox,
  useMailRuntime,
  useMailboxFieldSearch,
  useMailboxMessages,
} from "../../src/lib/mail/use-mail";
import { useMailListSettings } from "../../src/hooks/use-mail-list-settings";
import { useMailUndoToast } from "../../src/hooks/use-mail-undo-toast";
import { useLabels } from "../../src/lib/mail/use-labels";
import {
  getMailboxDisplayName,
  getPrimaryMailboxId,
  isDraftMessage,
  isSpamMailboxRole,
  sortMailboxes,
} from "../../src/lib/mail/mail-helpers";
import { filterVisibleMailboxes } from "../../src/lib/mail/mailbox-management";
import { useHiddenMailboxIds } from "../../src/hooks/use-hidden-mailbox-ids";
import { buildMailboxThreadRows } from "../../src/lib/mail/conversation-thread";
import { useConversationListExtras } from "../../src/lib/mail/use-conversation-thread";
import { useConversationDecryptedPreviews } from "../../src/lib/mail/use-conversation-decrypted-previews";
import { messageHasVisibleAttachments } from "../../src/lib/mail/message-security";
import {
  isWebMailAvailable,
  openWebMail,
} from "../../src/lib/mail/mail-web-bridge";
import type { JmapEmailMessage, JmapMailbox } from "../../src/lib/mail/types";
import { QUERY_KEYS } from "@workspace/native-core/lib/query-keys";
import { useUserTimezone } from "@workspace/native-core/hooks/use-user-timezone";
import { useUserTimeFormat } from "@workspace/native-core/hooks/use-user-time-format";

type ListSheetView = "bulkMore" | "bulkMove" | "bulkLabel" | null;

const SENDER_AS_RECIPIENT_ROLES = new Set(["sent", "drafts"]);
const MOVE_EXCLUDED_ROLES = new Set(["sent", "drafts"]);

export default function MailScreen() {
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const { open: openCommandPalette } = useCommandPalette();
  const router = useRouter();
  const { openCompose } = useMailCompose();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const accountQuery = useMailAccount();
  const configQuery = useMailConfig();
  const provisionMailbox = useProvisionMailbox();
  const provisioned = accountQuery.data?.provisioned ?? false;
  const runtimeQuery = useMailRuntime(provisioned);
  const runtime = runtimeQuery.data;

  const { selectedMailboxId, setSelectedMailboxId } = useMailSelection();

  const resolvedMailboxId = useMemo(() => {
    if (selectedMailboxId) {
      return selectedMailboxId;
    }
    if (!runtime) {
      return null;
    }
    return (
      getPrimaryMailboxId(runtime.mailboxes, "inbox") ??
      runtime.mailboxes[0]?.id ??
      null
    );
  }, [runtime, selectedMailboxId]);

  useEffect(() => {
    if (!resolvedMailboxId || selectedMailboxId) {
      return;
    }
    setSelectedMailboxId(resolvedMailboxId);
  }, [resolvedMailboxId, selectedMailboxId, setSelectedMailboxId]);

  const messagesQuery = useMailboxMessages(runtime, resolvedMailboxId);
  const companionMailboxId = useMemo(() => {
    const mailboxes = runtime?.mailboxes ?? [];
    const selected = mailboxes.find(
      (mailbox) => mailbox.id === resolvedMailboxId,
    );
    const role = selected?.role?.toLowerCase();
    if (role === "inbox") {
      return getPrimaryMailboxId(mailboxes, "sent");
    }
    if (role === "sent") {
      return getPrimaryMailboxId(mailboxes, "inbox");
    }
    return null;
  }, [runtime?.mailboxes, resolvedMailboxId]);
  const companionMessagesQuery = useMailboxMessages(
    runtime,
    companionMailboxId && companionMailboxId !== resolvedMailboxId
      ? companionMailboxId
      : null,
  );
  const mailboxMessages = useMemo(
    () => messagesQuery.data?.pages.flatMap((page) => page.messages) ?? [],
    [messagesQuery.data?.pages],
  );
  const companionMessages = useMemo(() => {
    if (!companionMailboxId) return [];
    return (
      companionMessagesQuery.data?.pages.flatMap((page) => page.messages) ?? []
    );
  }, [companionMailboxId, companionMessagesQuery.data?.pages]);

  const allowedMailboxIds = useMemo(
    () =>
      [resolvedMailboxId, companionMailboxId].filter((id): id is string =>
        Boolean(id),
      ),
    [resolvedMailboxId, companionMailboxId],
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
    bulkDestroyMessages,
    emptyMailbox,
  } = useMailMutations(runtime, resolvedMailboxId);
  const { settings: listSettings } = useMailListSettings();
  const showMoveToast = useMailUndoToast(runtime);
  const { labels } = useLabels({
    runtime,
    enabled: provisioned,
  });
  const { toast } = useToast();
  const insets = useSafeAreaInsets();

  const [activeSheetView, setActiveSheetView] = useState<ListSheetView>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [listFilters, setListFilters] = useState<MailListFilters>(
    DEFAULT_MAIL_LIST_FILTERS,
  );
  const [fieldSearch, setFieldSearch] = useState<{
    fields: MailSearchFieldValues;
    revision: number;
  }>({ fields: {}, revision: 0 });
  const timezone = useUserTimezone();
  const timeFormat = useUserTimeFormat();
  const { hiddenIds } = useHiddenMailboxIds();

  const fieldSearchActive = hasMailSearchFieldValues(fieldSearch.fields);
  const fieldSearchFilter = useMemo(
    () =>
      fieldSearchActive && resolvedMailboxId
        ? buildMailboxFieldSearchFilter(
            resolvedMailboxId,
            fieldSearch.fields,
            listFilters,
            { timezone, now: new Date() },
          )
        : null,
    [fieldSearch.fields, fieldSearchActive, listFilters, resolvedMailboxId, timezone],
  );
  const fieldSearchQuery = useMailboxFieldSearch(
    runtime,
    resolvedMailboxId,
    fieldSearchFilter,
    fieldSearch.revision,
  );
  const searchMessages = useMemo(
    () => (fieldSearchActive ? (fieldSearchQuery.data?.pages.flatMap((page) => page.messages) ?? []) : []),
    [fieldSearchActive, fieldSearchQuery.data?.pages],
  );

  const handleSearchFieldsChange = useCallback(
    (fields: MailSearchFieldValues) =>
      setFieldSearch((prev) => ({ fields, revision: prev.revision + 1 })),
    [],
  );

  // Toggles fold into the server query, so a new revision keeps each distinct search in its own cache entry.
  const handleListFiltersChange = useCallback((next: MailListFilters) => {
    setListFilters(next);
    setFieldSearch((prev) => ({ ...prev, revision: prev.revision + 1 }));
  }, []);

  const drawerMailboxes = useMemo(
    () =>
      runtime
        ? filterVisibleMailboxes(sortMailboxes(runtime.mailboxes), hiddenIds)
        : [],
    [hiddenIds, runtime],
  );

  const sheetPadCompact = sheetCompactBottomPadding(insets.bottom);
  const selectionActive = selectedIds.size > 0;
  const bulkIds = useMemo(() => Array.from(selectedIds), [selectedIds]);
  const idleListPadding = insets.bottom;
  const bulkListPadding = mailBottomBarTotalHeight(insets.bottom);
  const showMailChrome = provisioned && Boolean(runtime);

  useEffect(() => {
    setSelectedIds(new Set());
    setListFilters(DEFAULT_MAIL_LIST_FILTERS);
    setFieldSearch((prev) => ({ fields: {}, revision: prev.revision + 1 }));
  }, [resolvedMailboxId]);

  const selectedMailbox = runtime?.mailboxes.find(
    (m) => m.id === resolvedMailboxId,
  );
  const showRecipient = selectedMailbox?.role
    ? SENDER_AS_RECIPIENT_ROLES.has(selectedMailbox.role)
    : false;

  const primaryMessageIds = useMemo(
    () =>
      new Set(
        [...mailboxMessages, ...searchMessages].map((message) => message.id),
      ),
    [mailboxMessages, searchMessages],
  );

  const allThreadRows = useMemo(
    () => buildMailboxThreadRows(mailboxMessages, conversationExtras),
    [mailboxMessages, conversationExtras],
  );

  const listFilterActive =
    countActiveMailListFilters(listFilters) > 0 || fieldSearchActive;
  const threadRows = useMemo(() => {
    if (!listFilterActive) return allThreadRows;
    const source = fieldSearchActive ? searchMessages : mailboxMessages;
    const filtered = applyMailListFilters(source, listFilters, {
      now: new Date(),
      timezone,
    });
    return buildMailboxThreadRows(filtered, conversationExtras);
  }, [
    allThreadRows,
    conversationExtras,
    fieldSearchActive,
    listFilters,
    listFilterActive,
    mailboxMessages,
    searchMessages,
    timezone,
  ]);

  const latestMessages = useMemo(
    () => threadRows.map((row) => row.latestMessage),
    [threadRows],
  );
  const decryptedPreviews = useConversationDecryptedPreviews(
    runtime,
    latestMessages,
  );

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

  const handleSelectMailbox = useCallback(
    (mailboxId: string) => {
      setSelectedMailboxId(mailboxId);
      void queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.mailMessages(mailboxId),
      });
    },
    [queryClient, setSelectedMailboxId],
  );

  const messageById = useMemo(() => {
    const map = new Map<string, JmapEmailMessage>();
    for (const message of [...mailboxMessages, ...searchMessages]) {
      map.set(message.id, message);
    }
    for (const message of conversationExtras) {
      if (!map.has(message.id)) {
        map.set(message.id, message);
      }
    }
    return map;
  }, [mailboxMessages, searchMessages, conversationExtras]);

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
      if (isDraftMessage(message, resolvedMailboxId, mailboxes)) {
        openCompose({ mode: "draft", messageId: message.id });
        return;
      }
      router.push(mailMessageRoute(message.id) as never);
    },
    [openCompose, router, runtime?.mailboxes, resolvedMailboxId],
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
        mailbox.id !== resolvedMailboxId &&
        !MOVE_EXCLUDED_ROLES.has(mailbox.role?.toLowerCase() ?? ""),
    );
  }, [runtime, resolvedMailboxId]);

  const bulkMoveSnapPoints = useMemo(() => {
    const count = Math.max(bulkMoveTargets.length, 1);
    const fraction = 0.2 + Math.min(count, 7) * 0.05;
    return [Math.min(0.55, Math.max(0.36, fraction))];
  }, [bulkMoveTargets.length]);

  const trashMailboxId = useMemo(
    () => runtime?.mailboxes.find((m) => m.role === "trash")?.id ?? null,
    [runtime?.mailboxes],
  );
  const isInTrash = resolvedMailboxId === trashMailboxId;
  const isInSpam = isSpamMailboxRole(selectedMailbox?.role);

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

  const handleBulkDeleteForever = useCallback(() => {
    if (bulkIds.length === 0) return;
    setActiveSheetView(null);
    const ids = bulkIds;
    Alert.alert(
      "Delete forever?",
      ids.length === 1
        ? "This message will be permanently deleted. This cannot be undone."
        : `${ids.length} messages will be permanently deleted. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            bulkDestroyMessages.mutate(ids, {
              onSuccess: () => {
                clearSelection();
                toast(
                  ids.length === 1
                    ? "Permanently deleted 1 message"
                    : `Permanently deleted ${ids.length} messages`,
                );
              },
              onError: (error) =>
                toast(
                  getErrorMessage(error, "Failed to delete messages."),
                  "error",
                ),
            }),
        },
      ],
    );
  }, [bulkDestroyMessages, bulkIds, clearSelection, toast]);

  const handleBulkTrash = useCallback(() => {
    if (bulkIds.length === 0) return;
    if (isInTrash) {
      handleBulkDeleteForever();
      return;
    }
    setActiveSheetView(null);
    const count = bulkIds.length;
    bulkMoveToTrash.mutate(bulkIds, {
      onSuccess: (_data, _ids, snapshot) => {
        clearSelection();
        showMoveToast(
          count === 1 ? "Moved 1 to trash" : `Moved ${count} to trash`,
          snapshot,
        );
      },
      onError: (error) =>
        toast(
          getErrorMessage(error, "Failed to move messages to trash."),
          "error",
        ),
    });
  }, [
    bulkIds,
    bulkMoveToTrash,
    clearSelection,
    handleBulkDeleteForever,
    isInTrash,
    showMoveToast,
    toast,
  ]);

  const handleBulkMove = useCallback(
    (targetMailboxId: string) => {
      if (bulkIds.length === 0) return;
      const targetName =
        runtime?.mailboxes.find((m) => m.id === targetMailboxId)?.name ??
        "mailbox";
      bulkMoveToMailbox.mutate(
        { messageIds: bulkIds, targetMailboxId },
        {
          onSuccess: (_data, _input, snapshot) => {
            clearSelection();
            setActiveSheetView(null);
            showMoveToast(`Moved ${bulkIds.length} to ${targetName}`, snapshot);
          },
          onError: (error) =>
            toast(getErrorMessage(error, "Failed to move messages."), "error"),
        },
      );
    },
    [
      bulkIds,
      bulkMoveToMailbox,
      clearSelection,
      runtime?.mailboxes,
      showMoveToast,
      toast,
    ],
  );

  const [emptyingMailboxId, setEmptyingMailboxId] = useState<string | null>(
    null,
  );

  const handleEmptyMailbox = useCallback(
    (mailbox: JmapMailbox) => {
      const name = getMailboxDisplayName(mailbox);
      Alert.alert(
        `Empty ${name}?`,
        `Every message in ${name} will be permanently deleted. This cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Empty",
            style: "destructive",
            onPress: () => {
              setEmptyingMailboxId(mailbox.id);
              emptyMailbox.mutate(mailbox.id, {
                onSuccess: (count) =>
                  toast(
                    count === 0
                      ? "Folder is already empty."
                      : count === 1
                        ? "Permanently deleted 1 message."
                        : `Permanently deleted ${count} messages.`,
                  ),
                onError: (error) =>
                  toast(
                    getErrorMessage(error, `Failed to empty ${name}.`),
                    "error",
                  ),
                onSettled: () => setEmptyingMailboxId(null),
              });
            },
          },
        ],
      );
    },
    [emptyMailbox, toast],
  );

  const [bulkActionPending, setBulkActionPending] = useState(false);

  const isActionBusy =
    bulkActionPending ||
    bulkMarkAsRead.isPending ||
    bulkMarkAsUnread.isPending ||
    bulkMoveToTrash.isPending ||
    bulkMoveToMailbox.isPending ||
    bulkDestroyMessages.isPending ||
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

  const handleSwipeToggleRead = useCallback(
    (ids: string[], read: boolean) => {
      if (ids.length === 0) return;
      const mutation = read ? bulkMarkAsUnread : bulkMarkAsRead;
      mutation.mutate(ids, {
        onError: (error) =>
          toast(getErrorMessage(error, "Failed to update message."), "error"),
      });
    },
    [bulkMarkAsRead, bulkMarkAsUnread, toast],
  );

  const handleSwipeTrash = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      return new Promise<void>((resolve) => {
        bulkMoveToTrash.mutate(ids, {
          onSuccess: (_data, _ids, snapshot) =>
            showMoveToast("Moved to trash", snapshot),
          onError: (error) =>
            toast(
              getErrorMessage(error, "Failed to move message to trash."),
              "error",
            ),
          onSettled: () => resolve(),
        });
      });
    },
    [bulkMoveToTrash, showMoveToast, toast],
  );

  const bulkSheetSnapPoints = useMemo(() => {
    if (activeSheetView === "bulkLabel") return [0.55];
    if (activeSheetView === "bulkMove") return bulkMoveSnapPoints;
    if (activeSheetView === "bulkMore") return [0.4];
    return [0.4];
  }, [activeSheetView, bulkMoveSnapPoints]);

  const listExtraData = useMemo(
    () => ({
      mailboxId: resolvedMailboxId,
      selectionActive,
      selectedKey: Array.from(selectedIds).sort().join(","),
      previewKey: Object.keys(decryptedPreviews).sort().join(","),
      listSettings,
    }),
    [
      resolvedMailboxId,
      selectionActive,
      selectedIds,
      decryptedPreviews,
      listSettings,
    ],
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

      const swipeIds =
        rowSelectableIds.length > 0
          ? rowSelectableIds
          : [item.latestMessage.id];
      const rowRead = unreadCount === 0;

      return (
        <MailSwipeRow
          enabled={!selectionActive}
          read={rowRead}
          onToggleRead={() => handleSwipeToggleRead(swipeIds, rowRead)}
          onTrash={isInTrash ? undefined : () => handleSwipeTrash(swipeIds)}
        >
          <MailMessageRow
            message={item.latestMessage}
            threadMessages={item.messages}
            threadCount={item.messages.length}
            threadUnreadCount={unreadCount}
            hasAttachments={hasAttachments}
            showRecipient={showRecipient}
            labels={labels}
            identities={runtime?.identities ?? []}
            preview={decryptedPreviews[item.latestMessage.id]}
            selectionActive={selectionActive}
            selected={isRowSelected}
            timeFormat={timeFormat}
            timezone={timezone}
            density={listSettings.density}
            showLabelChips={listSettings.showLabelChipsInList}
            threadExpandable={listSettings.threadExpandInList}
            onPress={handleOpenMessage}
            onLongPress={(message) => handleLongPress(message, item.messageIds)}
            onToggleSelect={(message) =>
              handleToggleSelect(message, item.messageIds)
            }
          />
        </MailSwipeRow>
      );
    },
    [
      handleOpenMessage,
      handleLongPress,
      handleToggleSelect,
      handleSwipeToggleRead,
      handleSwipeTrash,
      isInTrash,
      showRecipient,
      labels,
      primaryMessageIds,
      runtime?.identities,
      selectedIds,
      selectionActive,
      decryptedPreviews,
      timeFormat,
      timezone,
      listSettings.density,
      listSettings.showLabelChipsInList,
      listSettings.threadExpandInList,
    ],
  );

  const unreadThreadCount = useMemo(
    () =>
      allThreadRows.filter((row) =>
        row.messages.some(
          (entry) =>
            primaryMessageIds.has(entry.id) && !entry.keywords?.["$seen"],
        ),
      ).length,
    [allThreadRows, primaryMessageIds],
  );

  const renderSeparator = useCallback(
    () => <View style={styles.separator} />,
    [styles.separator],
  );

  const activeMessagesQuery = fieldSearchActive ? fieldSearchQuery : messagesQuery;
  const listFooter = useMemo(
    () => (
      <>
        {activeMessagesQuery.isFetchingNextPage ? (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.colors.primaryBase} />
          </View>
        ) : null}
        {showMailChrome ? (
          <MailListAnimatedFooter
            idlePadding={idleListPadding}
            bulkPadding={bulkListPadding}
          />
        ) : null}
      </>
    ),
    [
      showMailChrome,
      idleListPadding,
      bulkListPadding,
      activeMessagesQuery.isFetchingNextPage,
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
            toolbar={{
              mailboxName: selectedMailbox
                ? getMailboxDisplayName(selectedMailbox)
                : "Mail",
              unreadCount: unreadThreadCount,
              filterActive: listFilterActive,
              onSearch: openCommandPalette,
              onCompose: () => openCompose(),
              onOpenMailboxes: () => setDrawerOpen(true),
              onOpenFilter: () => setFilterOpen(true),
              onOpenAccount: () => setAccountOpen(true),
            }}
            onClearSelection={clearSelection}
            onSelectAll={handleSelectAll}
          />
        }
      >
        {accountQuery.isPending && !accountQuery.data ? (
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
        ) : runtimeQuery.isPending && !runtimeQuery.data ? (
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
              key={resolvedMailboxId ?? "mailbox"}
              style={styles.listFlex}
              data={threadRows}
              keyExtractor={(item) => item.id}
              extraData={listExtraData}
              renderItem={renderItem}
              ItemSeparatorComponent={renderSeparator}
              refreshing={
                activeMessagesQuery.isFetching &&
                !activeMessagesQuery.isLoading &&
                !activeMessagesQuery.isFetchingNextPage
              }
              onRefresh={() => {
                void runtimeQuery.refetch();
                void activeMessagesQuery.refetch();
                void companionMessagesQuery.refetch();
              }}
              onEndReached={() => {
                if (
                  activeMessagesQuery.hasNextPage &&
                  !activeMessagesQuery.isFetchingNextPage
                ) {
                  void activeMessagesQuery.fetchNextPage();
                }
              }}
              onEndReachedThreshold={0.4}
              contentContainerStyle={
                threadRows.length === 0 ? styles.emptyListContent : undefined
              }
              ListFooterComponent={listFooter}
              ListEmptyComponent={
                (messagesQuery.isPending && !messagesQuery.data) ||
                (fieldSearchActive && fieldSearchQuery.isPending) ? (
                  <CenteredLoader theme={theme} />
                ) : (
                  <View style={styles.centered}>
                    <Feather
                      name="inbox"
                      size={MAIL_ICON.emptyState}
                      color={theme.colors.mutedForeground}
                    />
                    <Text style={styles.mutedText}>
                      {fieldSearchActive && fieldSearchQuery.isError
                        ? getErrorMessage(
                            fieldSearchQuery.error,
                            "Search failed. Try again.",
                          )
                        : listFilterActive
                          ? "No messages match this filter"
                          : "No messages here"}
                    </Text>
                  </View>
                )
              }
            />
          </View>
        )}

        {showMailChrome ? (
          <MailListBottomChrome
            bottomInset={insets.bottom}
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
          <BottomSheetHeader>
            <BottomSheetTitle>
              {activeSheetView === "bulkMove"
                ? "Move to"
                : activeSheetView === "bulkLabel"
                  ? "Labels"
                  : "Actions"}
            </BottomSheetTitle>
          </BottomSheetHeader>
          {activeSheetView === "bulkMore" ? (
            <MailSheetPanel bottomInset={insets.bottom}>
              <MailBulkMoreSheet
                showStar={unflaggedSelectedIds.length > 0}
                showUnstar={flaggedSelectedIds.length > 0}
                showMove={bulkMoveTargets.length > 0}
                showDeleteForever={isInTrash || isInSpam}
                onDeleteForever={handleBulkDeleteForever}
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

      <MailboxDrawerSheet
        visible={drawerOpen}
        onDismiss={() => setDrawerOpen(false)}
        loading={runtimeQuery.isPending && !runtime}
        mailboxes={drawerMailboxes}
        selectedMailboxId={resolvedMailboxId}
        onSelectMailbox={handleSelectMailbox}
        onEmptyMailbox={handleEmptyMailbox}
        emptyingMailboxId={emptyingMailboxId}
      />

      <MailFilterSheet
        key={resolvedMailboxId ?? "mailbox"}
        visible={filterOpen}
        filters={listFilters}
        onFiltersChange={handleListFiltersChange}
        searchFields={fieldSearch.fields}
        onSearchFieldsChange={handleSearchFieldsChange}
        labels={labels}
        resultCount={threadRows.length}
        onDismiss={() => setFilterOpen(false)}
      />

      <MailAccountSheet
        visible={accountOpen}
        onDismiss={() => setAccountOpen(false)}
      />
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
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border,
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
