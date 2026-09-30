import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getErrorMessage } from "@workspace/calendar-core";
import { useCommandPalette } from "@workspace/native-core/providers/CommandPaletteProvider";
import { useToast } from "@workspace/native-core/providers/ToastProvider";
import { useUserTimezone } from "@workspace/native-core/hooks/use-user-timezone";
import { useUserTimeFormat } from "@workspace/native-core/hooks/use-user-time-format";
import { sheetCompactBottomPadding } from "@workspace/native-core/components/sheet/sheet-padding";
import { useMailCompose } from "../providers/MailComposeProvider";
import { useMailSelection } from "../providers/MailSelectionProvider";
import { useMailMutations } from "../lib/mail/use-mail";
import { useLabels } from "../lib/mail/use-labels";
import {
  getMailboxDisplayName,
  getPrimaryMailboxId,
  isSpamMailboxRole,
  sortMailboxes,
} from "../lib/mail/mail-helpers";
import { emptyMailboxResultMessage } from "../lib/mail/mail-action-messages";
import { filterVisibleMailboxes } from "../lib/mail/mailbox-management";
import { mailBottomBarTotalHeight } from "../components/mail/mail-bottom-action-bar-layout";
import { useHiddenMailboxIds } from "./use-hidden-mailbox-ids";
import { useMailAccountState } from "./use-mail-account-state";
import { useMailBulkActions } from "./use-mail-bulk-actions";
import { useMailListSearch } from "./use-mail-list-search";
import { useMailListSelection } from "./use-mail-list-selection";
import { useMailListSettings } from "./use-mail-list-settings";
import { useMailRowHandlers } from "./use-mail-row-handlers";
import { useMailUndoToast } from "./use-mail-undo-toast";
import { useMailboxThreadRows } from "./use-mailbox-thread-rows";
import type { JmapIdentity, JmapMailbox } from "../lib/mail/types";

type ListSheetView = "bulkMore" | "bulkMove" | "bulkLabel" | null;

const SENDER_AS_RECIPIENT_ROLES = new Set(["sent", "drafts"]);
const MOVE_EXCLUDED_ROLES = new Set(["sent", "drafts"]);
const NO_IDENTITIES: JmapIdentity[] = [];
const NO_MAILBOXES: JmapMailbox[] = [];

export type MailListController = ReturnType<typeof useMailListController>;

export function useMailListController() {
  const { open: openCommandPalette } = useCommandPalette();
  const { openCompose } = useMailCompose();
  const { toast } = useToast();
  const insets = useSafeAreaInsets();
  const timezone = useUserTimezone();
  const timeFormat = useUserTimeFormat();
  const { hiddenIds } = useHiddenMailboxIds();
  const { settings: listSettings } = useMailListSettings();

  const account = useMailAccountState();
  const { runtime, provisioned } = account;
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

  const search = useMailListSearch({
    runtime,
    mailboxId: resolvedMailboxId,
    timezone,
  });

  const list = useMailboxThreadRows({
    runtime,
    mailboxId: resolvedMailboxId,
    searchActive: search.fieldSearchActive,
    searchMessages: search.searchMessages,
    searchQuery: search.fieldSearchQuery,
    listFilters: search.listFilters,
    listFilterActive: search.listFilterActive,
    timezone,
    refetchRuntime: account.refetchRuntime,
  });

  const selection = useMailListSelection({
    mailboxMessages: list.mailboxMessages,
    searchMessages: search.searchMessages,
    conversationExtras: list.conversationExtras,
    threadRows: list.threadRows,
    primaryMessageIds: list.primaryMessageIds,
  });

  const mutations = useMailMutations(runtime, resolvedMailboxId);
  const showMoveToast = useMailUndoToast(runtime);
  const { labels } = useLabels({ runtime, enabled: provisioned });

  const [activeSheetView, setActiveSheetView] = useState<ListSheetView>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const closeSheet = useCallback(() => setActiveSheetView(null), []);

  const mailboxes = runtime?.mailboxes ?? NO_MAILBOXES;
  const selectedMailbox = mailboxes.find((m) => m.id === resolvedMailboxId);
  const trashMailboxId = mailboxes.find((m) => m.role === "trash")?.id ?? null;
  const isInTrash = resolvedMailboxId === trashMailboxId;

  const bulk = useMailBulkActions({
    mutations,
    mailboxes,
    labels,
    isInTrash,
    bulkIds: selection.bulkIds,
    unreadSelectedIds: selection.unreadSelectedIds,
    readSelectedIds: selection.readSelectedIds,
    unflaggedSelectedIds: selection.unflaggedSelectedIds,
    flaggedSelectedIds: selection.flaggedSelectedIds,
    clearSelection: selection.clearSelection,
    closeSheet,
    showMoveToast,
  });

  const rowHandlers = useMailRowHandlers({
    mutations,
    runtime,
    mailboxId: resolvedMailboxId,
    isInTrash,
    onToggleSelect: selection.handleToggleSelect,
    showMoveToast,
  });

  const { clearSelection } = selection;
  const handleSelectMailbox = useCallback(
    (mailboxId: string) => {
      clearSelection();
      setSelectedMailboxId(mailboxId);
    },
    [clearSelection, setSelectedMailboxId],
  );

  const { emptyMailbox } = mutations;
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
                onSuccess: (count) => toast(emptyMailboxResultMessage(count)),
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

  const drawerMailboxes = useMemo(
    () => filterVisibleMailboxes(sortMailboxes(mailboxes), hiddenIds),
    [hiddenIds, mailboxes],
  );

  const bulkMoveTargets = useMemo(
    () =>
      mailboxes.filter(
        (mailbox) =>
          mailbox.id !== resolvedMailboxId &&
          !MOVE_EXCLUDED_ROLES.has(mailbox.role?.toLowerCase() ?? ""),
      ),
    [mailboxes, resolvedMailboxId],
  );

  const bulkSheetSnapPoints = useMemo(
    () => bulkSheetSnapPointsFor(activeSheetView, bulkMoveTargets.length),
    [activeSheetView, bulkMoveTargets.length],
  );

  const listExtraData = useMemo(
    () => ({
      mailboxId: resolvedMailboxId,
      selectionActive: selection.selectionActive,
      selectedKey: Array.from(selection.selectedIds).sort().join(","),
      previewKey: Object.keys(list.decryptedPreviews).sort().join(","),
      listSettings,
    }),
    [
      resolvedMailboxId,
      selection.selectionActive,
      selection.selectedIds,
      list.decryptedPreviews,
      listSettings,
    ],
  );

  return {
    // Header toolbar
    selectionActive: selection.selectionActive,
    selectedCount: selection.selectedIds.size,
    selectableCount: selection.selectableIds.length,
    mailboxName: selectedMailbox
      ? getMailboxDisplayName(selectedMailbox)
      : "Mail",
    unreadThreadCount: list.unreadThreadCount,
    listFilterActive: search.listFilterActive,
    openCommandPalette,
    openCompose,
    clearSelection: selection.clearSelection,
    handleSelectAll: selection.handleSelectAll,
    setDrawerOpen,
    setFilterOpen,
    setAccountOpen,

    // Account / setup / runtime states
    ...account.gate,

    // Thread list
    threadRows: list.threadRows,
    listExtraData,
    resolvedMailboxId,
    pullRefreshing: list.pullRefreshing,
    handlePullRefresh: list.handlePullRefresh,
    onEndReached: list.onEndReached,
    viewabilityConfigCallbackPairs: list.viewabilityConfigCallbackPairs,
    fetchingNextPage: list.fetchingNextPage,
    listPending: list.listPending,
    searchPending: search.searchPending,
    searchErrorMessage: search.searchErrorMessage,
    rowHandlers,
    decryptedPreviews: list.decryptedPreviews,
    showRecipient: selectedMailbox?.role
      ? SENDER_AS_RECIPIENT_ROLES.has(selectedMailbox.role)
      : false,
    labels,
    identities: runtime?.identities ?? NO_IDENTITIES,
    timeFormat,
    timezone,
    listSettings,
    primaryMessageIds: list.primaryMessageIds,
    selectedIds: selection.selectedIds,

    // Bulk selection + actions
    insetsBottom: insets.bottom,
    showMailChrome: provisioned && Boolean(runtime),
    idleListPadding: insets.bottom,
    bulkListPadding: mailBottomBarTotalHeight(insets.bottom),
    isInTrash,
    isInSpam: isSpamMailboxRole(selectedMailbox?.role),
    activeSheetView,
    setActiveSheetView,
    bulkSheetSnapPoints,
    bulkIds: selection.bulkIds,
    unreadSelectedIds: selection.unreadSelectedIds,
    readSelectedIds: selection.readSelectedIds,
    unflaggedSelectedIds: selection.unflaggedSelectedIds,
    flaggedSelectedIds: selection.flaggedSelectedIds,
    bulkMoveTargets,
    sheetPadCompact: sheetCompactBottomPadding(insets.bottom),
    ...bulk,

    // Drawer / filter / account sheets
    drawerOpen,
    drawerLoading: account.runtimeLoading,
    drawerMailboxes,
    handleSelectMailbox,
    handleEmptyMailbox,
    emptyingMailboxId,
    filterOpen,
    listFilters: search.listFilters,
    handleListFiltersChange: search.handleListFiltersChange,
    fieldSearchFields: search.fieldSearchFields,
    handleSearchFieldsChange: search.handleSearchFieldsChange,
    accountOpen,
  };
}

// The move sheet grows with the folder count; the other panels have a fixed height.
function bulkSheetSnapPointsFor(view: ListSheetView, moveTargetCount: number) {
  if (view !== "bulkMove") {
    return view === "bulkLabel" ? [0.55] : [0.4];
  }
  const fraction = 0.2 + Math.min(Math.max(moveTargetCount, 1), 7) * 0.05;
  return [Math.min(0.55, Math.max(0.36, fraction))];
}
