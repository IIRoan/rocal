"use client";

import {
  useEffect,
  useReducer,
  useRef,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useIsMobile } from "@workspace/ui/hooks";
import { useMailApp } from "@/hooks/use-mail-app";
import { useMailUrlSync } from "@/hooks/use-mail-url-sync";
import { useSettings } from "@/hooks/use-settings";
import { useMailKeyboardShortcuts } from "@/hooks/use-mail-keyboard-shortcuts";
import { useMailListSettings } from "@/lib/mail/mail-list-settings";
import {
  buildJmapFilter,
  hasActiveFilters,
  mergeInlineSearchResults,
  type MailSearchFilters,
} from "@/lib/mail/mail-search-filter";
import { registerComposeCloseActions } from "./mail-compose-bridge";
import {
  useMailComposeChrome,
  useMailCompose,
} from "./mail-compose-context";
import type { JmapEmailMessage } from "@/lib/mail/types";
import { mailQueryKeys } from "@/lib/mail/mail-query-keys";
import { useRefreshGesture } from "@/hooks/use-refresh-gesture";
import { isDraftMessage } from "@/lib/mail/draft-utils";
import { canEmptyMailboxRole, getMailboxDisplayName } from "@/lib/mail/mail-mailbox-roles";
import {
  initialMailAppListChromeState,
  mailAppListChromeReducer,
  type MailAppListChromeAction,
  type MailAppListChromeState,
} from "./mail-app-list-chrome-state";

export type MailAppContentController = ReturnType<
  typeof useMailAppContentController
>;

export function useMailAppContentController(
  mail: ReturnType<typeof useMailApp>,
) {
  const { isComposeOpen, setIsComposeOpen, isFullCompose, setIsFullCompose, dismissCompose } =
    useMailComposeChrome();
  const { openNewCompose, composeSessionId, requestComposeClose } = useMailCompose();
  const composeActive = isComposeOpen || isFullCompose;
  const {
    session,
    isBusy,
    isMailboxStatusLoading,
    activeMailbox,
    composeMailPolicy,
    listThreadRelatedMessages,
    selectedMessage,
    selectedMessageId,
    setSelectedMessageId,
    openMessageById,
    selectedConversationMessages,
    isConversationLoading,
    isMessageBodyLoading,
    setSelectedConversationMessageId,
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
    handleManualRefresh,
    isRefreshing,
    loadMoreMessages,
    hasMoreMessages,
    isLoadingMore,
    handleSendMessage,
    handleComposeImageUpload,
    handleDeleteMessage,
    handleReply,
    handleForward,
    handleEditDraft,
    handleDiscardDraft,
    handleQuickReply,
    handlePreviewAttachment,
    loadAttachmentHoverPreview,
    handleDownloadAttachment,
    closeAttachmentPreview,
    handleMoveMessage,
    handleUntrash,
    handleReportSpam,
    handleNotSpam,
    handleBulkReportSpam,
    handleEmptyMailbox,
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
    handleCreateLabel,
    handleDeleteLabel,
    handleUpdateLabel,
    labels,
    handleSignOut,
    user,
    accountEmail,
    accountDisplayName,
  } = mail;

  useRefreshGesture({
    enabled: Boolean(activeMailbox && session?.user),
    onRefresh: () => void handleManualRefresh(),
  });

  const { settings } = useSettings();
  const timeFormat = settings?.timeFormat ?? "24h";
  const [listChrome, dispatchListChrome] = useReducer(
    mailAppListChromeReducer,
    initialMailAppListChromeState,
  );
  const {
    paletteInitialView,
    mailListSearch,
    debouncedMailListSearch,
    advancedFilters,
    filterPanelExpanded,
    emptyFolderOpen,
  } = listChrome;
  const isMobile = useIsMobile();
  const editingDraftIdRef = useRef<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const suppressSearchShortcutInputRef = useRef(false);

  const patchListChrome = (patch: Partial<MailAppListChromeState>) => {
    dispatchListChrome({ type: "patch", patch });
  };

  useEffect(() => {
    const timer = setTimeout(
      () =>
        dispatchListChrome({
          type: "patch",
          patch: { debouncedMailListSearch: mailListSearch },
        }),
      300,
    );
    return () => clearTimeout(timer);
  }, [mailListSearch]);

  const mailboxId = activeMailbox?.selectedMailboxId ?? null;

  const trimmedMailListSearch = mailListSearch.trim();
  const trimmedDebouncedMailListSearch = debouncedMailListSearch.trim();
  const hasAdvancedFilters = hasActiveFilters({
    text: advancedFilters.text,
    conditions: advancedFilters.conditions,
  });
  const searchUiActive = Boolean(trimmedMailListSearch) || hasAdvancedFilters;
  const searchActive =
    Boolean(trimmedDebouncedMailListSearch) || hasAdvancedFilters;
  const isSearchDebouncing =
    Boolean(trimmedMailListSearch) &&
    trimmedMailListSearch !== trimmedDebouncedMailListSearch;

  const {
    data: serverSearchResults,
    isFetching: isSearching,
    isError: isSearchError,
  } = useQuery<JmapEmailMessage[]>({
    queryKey: [
      ...mailQueryKeys.inlineSearch(mailboxId, trimmedDebouncedMailListSearch),
      advancedFilters,
    ],
    queryFn: async () => {
      if (!activeMailbox || !mailboxId) return [];

      const inlineText = trimmedDebouncedMailListSearch;

      if (inlineText && !hasAdvancedFilters) {
        const { messages } = await activeMailbox.client.searchMailboxMessages(
          activeMailbox.session,
          mailboxId,
          inlineText,
          40,
        );
        return messages;
      }

      if (inlineText || hasAdvancedFilters) {
        const filters: MailSearchFilters = {
          ...advancedFilters,
          text: inlineText || advancedFilters.text?.trim() || undefined,
        };
        const jmapFilter = buildJmapFilter(mailboxId, filters);
        const { messages } = await activeMailbox.client.searchMailboxMessagesWithFilter(
          activeMailbox.session,
          mailboxId,
          jmapFilter,
          40,
        );
        return messages;
      }

      return [];
    },
    enabled: Boolean(searchActive && activeMailbox && mailboxId),
    staleTime: 10_000,
  });

  const showSearchLoadingState =
    searchUiActive &&
    (isSearchDebouncing ||
      (searchActive &&
        isSearching &&
        serverSearchResults === undefined));

  const filteredListMessages: JmapEmailMessage[] =
    searchUiActive || searchActive
      ? isSearchError && searchActive && !isSearchDebouncing
        ? (activeMailbox?.messages ?? [])
        : serverSearchResults === undefined
          ? []
          : trimmedDebouncedMailListSearch
            ? mergeInlineSearchResults(
                serverSearchResults,
                activeMailbox?.messages ?? [],
                trimmedDebouncedMailListSearch,
              )
            : serverSearchResults
      : (activeMailbox?.messages ?? []);

  const messages: JmapEmailMessage[] = activeMailbox?.messages ?? [];

  const selectedIsDraft = Boolean(
    selectedMessage &&
      activeMailbox &&
      isDraftMessage(selectedMessage, mailboxId, activeMailbox.mailboxes),
  );

  const handleDismissCompose = () => {
    dismissCompose();
    editingDraftIdRef.current = null;
    setSelectedMessageId(null);
  };

  useEffect(() => {
    registerComposeCloseActions({
      dismiss: () => {
        dismissCompose();
        editingDraftIdRef.current = null;
        setSelectedMessageId(null);
      },
      discardDraft: (draftId) => {
        void handleDiscardDraft(draftId);
      },
    });
    return () => registerComposeCloseActions(null);
  }, [dismissCompose, handleDiscardDraft, setSelectedMessageId]);

  const closeComposeThen = (action: () => void) => {
    if (!composeActive) {
      action();
      return;
    }
    if (requestComposeClose(action)) {
      handleDismissCompose();
      action();
    }
  };

  const performSelectMessage = (id: string | null) => {
    if (!id) {
      editingDraftIdRef.current = null;
      setSelectedMessageId(null);
      return;
    }

    const message =
      filteredListMessages.find((entry) => entry.id === id) ??
      messages.find((entry) => entry.id === id) ??
      listThreadRelatedMessages.find((entry) => entry.id === id);

    if (
      message &&
      activeMailbox &&
      isDraftMessage(message, mailboxId, activeMailbox.mailboxes)
    ) {
      if (editingDraftIdRef.current === id && isFullCompose) {
        return;
      }
      editingDraftIdRef.current = id;
      void handleEditDraft(message);
      return;
    }

    editingDraftIdRef.current = null;
    void openMessageById(id, message ?? undefined);
  };

  const handleSelectMessage = (id: string | null) => {
    closeComposeThen(() => performSelectMessage(id));
  };

  const handleSelectMailbox = (mailboxIdToSelect: string) => {
    closeComposeThen(() => {
      void refreshMailboxMessages(mailboxIdToSelect);
    });
  };

  const handleOpenCompose = () => {
    closeComposeThen(() => openNewCompose());
  };

  const selectedIndex = messages.findIndex((m) => m.id === selectedMessageId);
  const hasPrev = selectedIndex > 0;
  const hasNext = selectedIndex >= 0 && selectedIndex < messages.length - 1;

  const handleNavigatePrev = () => {
    if (hasPrev) handleSelectMessage(messages[selectedIndex - 1].id);
  };
  const handleNavigateNext = () => {
    if (hasNext) handleSelectMessage(messages[selectedIndex + 1].id);
  };
  const handleCloseMessage = () => {
    if (selectedIsDraft) {
      void handleDismissCompose();
      return;
    }
    setSelectedMessageId(null);
  };

  useMailUrlSync({
    activeMailbox,
    selectedMessageId,
    onSelectMailbox: handleSelectMailbox,
    onSelectMessageId: setSelectedMessageId,
    openMessageById: (id) => {
      void handleSelectMessage(id);
    },
  });

  const currentMailboxId = activeMailbox?.selectedMailboxId ?? null;
  const isInitialMailboxMountRef = useRef(true);
  useEffect(() => {
    if (isInitialMailboxMountRef.current) {
      isInitialMailboxMountRef.current = false;
      return;
    }
    dispatchListChrome({ type: "resetMailboxFilters" });
  }, [currentMailboxId]);

  const archiveMailbox = activeMailbox?.mailboxes.find(
    (m) => m.role?.toLowerCase() === "archive",
  );
  const handleArchive = archiveMailbox
    ? () => void handleMoveMessage(archiveMailbox.id)
    : undefined;

  const { settings: listSettings } = useMailListSettings();

  useMailKeyboardShortcuts(
    {
      navigatePrev: handleNavigatePrev,
      navigateNext: handleNavigateNext,
      reply: () => handleReply(),
      replyAll: () => handleReply(),
      forward: () => handleForward(),
      archive: () => handleArchive?.(),
      deleteMessage: () => void handleDeleteMessage(),
      toggleFlagged: () => void handleToggleFlagged(selectedMessage?.id),
      toggleReadUnread: () => {
        if (selectedMessage?.keywords?.["$seen"]) {
          void handleMarkAsUnread();
        } else {
          void handleMarkAsRead();
        }
      },
      markAsRead: () => void handleMarkAsRead(),
      markAsUnread: () => void handleMarkAsUnread(),
      compose: () => handleOpenCompose(),
      refresh: () => void handleManualRefresh(),
      closeMessage: handleCloseMessage,
      focusSearch: () => {
        if (!isMobile) {
          suppressSearchShortcutInputRef.current = true;
          requestAnimationFrame(() => {
            searchInputRef.current?.focus({ preventScroll: true });
            requestAnimationFrame(() => {
              suppressSearchShortcutInputRef.current = false;
            });
          });
        }
      },
    },
    Boolean(activeMailbox) && listSettings.keyboardShortcutsEnabled,
  );

  const isOverlayLoading = isMailboxStatusLoading || (isBusy && !activeMailbox);

  const selectedMailbox =
    activeMailbox?.mailboxes.find(
      (m) => m.id === activeMailbox.selectedMailboxId,
    ) ?? null;
  const canEmptyFolder =
    Boolean(activeMailbox?.messages.length) &&
    canEmptyMailboxRole(selectedMailbox?.role);
  const emptyFolderLabel = selectedMailbox?.role?.toLowerCase() === "trash"
    ? "Empty trash"
    : "Empty spam";

  const showMobileDetailPane =
    isMobile &&
    (isFullCompose || (Boolean(selectedMessageId) && !selectedIsDraft));

  const selectedMailboxName = selectedMailbox
    ? getMailboxDisplayName(selectedMailbox)
    : "Inbox";

  const clearListSearch = () => {
    dispatchListChrome({ type: "resetMailboxFilters" });
  };

  const handlePaletteOpenChange = (open: boolean) => {
    setIsPaletteOpen(open);
    if (!open) {
      patchListChrome({ paletteInitialView: undefined });
    }
  };

  const handleOpenMailboxesPalette = () => {
    patchListChrome({ paletteInitialView: "mailboxes" });
    setIsPaletteOpen(true);
  };

  const handleSearchEnter = () => {
    dispatchListChrome({
      type: "patch",
      patch: { debouncedMailListSearch: mailListSearch },
    });
  };

  const handleSearchInputChange = (value: string) => {
    if (suppressSearchShortcutInputRef.current && value === "/") {
      return;
    }
    if (value.trim() === "") {
      dispatchListChrome({ type: "resetMailboxFilters" });
      return;
    }
    patchListChrome({ mailListSearch: value });
  };

  const handleSearchInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "/" && suppressSearchShortcutInputRef.current) {
      event.preventDefault();
      return;
    }
    if (event.key === "Enter") {
      handleSearchEnter();
    }
  };

  const handleExpandCompose = () => {
    setIsComposeOpen(false);
    setIsFullCompose(true);
  };

  const handleFullComposeSend = async () => {
    await handleSendMessage();
    setIsFullCompose(false);
  };

  return {
    mail,
    composeSessionId,
    isComposeOpen,
    isFullCompose,
    isBusy,
    isRefreshing,
    isMobile,
    isOverlayLoading,
    isSearching,
    searchActive,
    searchUiActive,
    isSearchDebouncing,
    showSearchLoadingState,
    showMobileDetailPane,
    selectedIsDraft,
    selectedMessage,
    selectedMessageId,
    selectedConversationMessages,
    isConversationLoading,
    isMessageBodyLoading,
    selectedMessagePlaintext,
    selectedMessageDecryptedHtml,
    selectedMessageDecryptedAttachments,
    selectedMessageSignatureVerificationState,
    selectedMessageDecryptError,
    selectedMessageIsDecrypting,
    attachmentPreview,
    activeMailbox,
    composeMailPolicy,
    listThreadRelatedMessages,
    filteredListMessages,
    labels,
    timeFormat,
    timezone: settings?.timezone,
    listSettings,
    user,
    accountEmail,
    accountDisplayName,
    isPaletteOpen,
    paletteInitialView,
    mailListSearch,
    advancedFilters,
    filterPanelExpanded,
    emptyFolderOpen,
    searchInputRef: searchInputRef as RefObject<HTMLInputElement>,
    dispatchListChrome: dispatchListChrome as (
      action: MailAppListChromeAction,
    ) => void,
    patchListChrome,
    selectedMailbox,
    selectedMailboxName,
    canEmptyFolder,
    emptyFolderLabel,
    hasPrev,
    hasNext,
    handleArchive,
    handleSelectMailbox,
    handleOpenCompose,
    handleSelectMessage,
    handleDismissCompose,
    handleManualRefresh,
    handleSignOut,
    handleReorderMailboxes,
    handlePaletteOpenChange,
    handleOpenMailboxesPalette,
    setIsPaletteOpen,
    clearListSearch,
    handleSearchEnter,
    handleSearchInputChange,
    handleSearchInputKeyDown,
    handleCloseMessage,
    handleNavigatePrev,
    handleNavigateNext,
    setSelectedConversationMessageId,
    handleReply,
    handleForward,
    handleDeleteMessage,
    handleMoveMessage,
    handleMarkAsUnread,
    handleMarkAsRead,
    handleToggleFlagged,
    handleSetMessageLabel,
    handleCreateLabel,
    handleUpdateLabel,
    handleDeleteLabel,
    handleQuickReply,
    loadAttachmentHoverPreview,
    handlePreviewAttachment,
    handleDownloadAttachment,
    handleUntrash,
    handleReportSpam,
    handleNotSpam,
    handleBulkDelete,
    handleBulkMove,
    handleBulkMarkAsUnread,
    handleBulkMarkAsRead,
    handleBulkReportSpam,
    loadMoreMessages,
    hasMoreMessages,
    isLoadingMore,
    handleSendMessage,
    handleComposeImageUpload,
    handleExpandCompose,
    handleFullComposeSend,
    closeAttachmentPreview,
    handleCreateMailbox,
    handleDeleteMailbox,
    handleRenameMailbox,
    openMessageById,
    handleEmptyMailbox,
  };
}
