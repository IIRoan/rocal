"use client";

import { useLayoutEffect, useRef } from "react";
import { cn } from "@workspace/ui/lib/utils";
import { MOTION_EASING, slideFadeIn } from "@workspace/ui/lib/motion";
import { toast } from "@workspace/ui/lib/toast";
import { getErrorMessage } from "@workspace/calendar-core";
import { createLogger } from "@workspace/logger";
import {
  MAIL_LIST_NARROW_WIDTH_CLASS,
} from "./mail-reader-transition";
import { MessageList } from "../message-list";
import { MailMailboxHeader } from "../mail-mailbox-header";
import { applyMailListViewFilter } from "../mail-app-list-chrome-state";
import type { MailAppContentController } from "../use-mail-app-content-controller";

const log = createLogger("mail-app-list-column");

function MailSearchState({ loading, query, mailbox }: { loading: boolean; query: string; mailbox: string }) {
  if (loading) {
    return <div className="flex flex-1 items-center justify-center p-8"><p className="text-sm text-muted-foreground">Searching…</p></div>;
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 p-8 text-center">
      <p className="max-w-full break-words text-sm text-foreground">{query ? `No results for “${query}”` : "No messages match these filters"}</p>
      <p className="text-xs text-muted-foreground">Search covers {mailbox} only. Open another folder to search there.</p>
    </div>
  );
}

function MailAppListHeader({
  controller,
  title,
  unreadCount,
}: {
  controller: MailAppContentController;
  title: string;
  unreadCount: number;
}) {
  const {
    canEmptyFolder,
    emptyFolderLabel,
    canMarkFolderRead,
    handleMarkMailboxAsRead,
    isBusy,
    isRefreshing,
    patchListChrome,
    mailListSearch,
    advancedFilters,
    filterPanelExpanded,
    searchBarOpen,
    listViewFilter,
    isSearching,
    isSearchDebouncing,
    searchInputRef,
    clearListSearch,
    handleSearchInputChange,
    handleSearchInputKeyDown,
    handleManualRefresh,
  } = controller;

  return (
    <MailMailboxHeader
      title={title}
      unreadCount={unreadCount}
      filter={{
        value: listViewFilter,
        onChange: (value) => patchListChrome({ listViewFilter: value }),
      }}
      searchInputRef={searchInputRef}
      search={{
        open: searchBarOpen,
        value: mailListSearch,
        busy: Boolean(
          (isSearching || isSearchDebouncing) && mailListSearch.trim(),
        ),
        onOpenChange: (open) => patchListChrome({ searchBarOpen: open }),
        onChange: handleSearchInputChange,
        onKeyDown: handleSearchInputKeyDown,
        onClear: clearListSearch,
      }}
      advanced={{
        filters: advancedFilters,
        expanded: filterPanelExpanded,
        onFiltersChange: (filters) =>
          patchListChrome({ advancedFilters: filters }),
        onExpandedChange: (expanded) =>
          patchListChrome({ filterPanelExpanded: expanded }),
      }}
      refresh={{
        spinning: isRefreshing,
        disabled: isRefreshing || isBusy,
        onClick: () =>
          void handleManualRefresh().catch((error) =>
            toast.error(getErrorMessage(error, "Could not refresh mail. Check your connection and try again.")),
          ),
      }}
      emptyFolder={
        canEmptyFolder
          ? {
              label: emptyFolderLabel,
              onClick: () => patchListChrome({ emptyFolderOpen: true }),
            }
          : undefined
      }
      onMarkAllRead={
        canMarkFolderRead
          ? () =>
              void handleMarkMailboxAsRead().catch((error) =>
                log.error("Failed to mark folder as read", error),
              )
          : undefined
      }
    />
  );
}

export function MailAppListColumn({
  controller,
}: {
  controller: MailAppContentController;
}) {
  const {
    isMobile,
    showMobileDetailPane,
    selectedMailboxName,
    mailListSearch,
    listViewFilter,
    activeLabelId,
    searchActive,
    searchCoverageText,
    searchIssues,
    showSearchLoadingState,
    activeMailbox,
    filteredListMessages,
    listThreadRelatedMessages,
    cachedThreadMessages,
    loadThreadMessages,
    selectedMessageId,
    handleSelectMessage,
    handleDeleteMessage,
    handleMoveMessage,
    handleMarkAsUnread,
    handleMarkAsRead,
    handleBulkDelete,
    handleBulkMove,
    handleBulkMarkAsUnread,
    handleBulkMarkAsRead,
    handleToggleFlagged,
    handleReportSpam,
    handleNotSpam,
    handleBulkReportSpam,
    handleSetMessageLabel,
    labels,
    timeFormat,
    timezone,
    loadMoreMessages,
    hasMoreMessages,
    isLoadingMore,
    listSettings,
    scheduledSendAtById,
    composeScheduling,
  } = controller;
  const listBodyRef = useRef<HTMLDivElement>(null);
  const listSource = `${activeMailbox?.selectedMailboxId}|${activeLabelId}|${listViewFilter}`;

  // A new mailbox, label or filter lifts its rows in once painted, so the switch reads as fresh content in a fixed frame.
  useLayoutEffect(() => {
    const body = listBodyRef.current;
    if (!body) return;
    const enter = slideFadeIn(body, { y: 6 }, { duration: 220, easing: MOTION_EASING.soft });
    return () => enter?.cancel();
  }, [listSource]);

  if (!activeMailbox) {
    return null;
  }

  const activeLabel = labels.find((label) => label.id === activeLabelId);
  const listTitle = activeLabel?.name ?? selectedMailboxName;
  const searchQuery = mailListSearch.trim();
  const unreadCount = applyMailListViewFilter(
    activeMailbox.messages,
    "all",
    activeLabelId,
  ).filter((message) => !message.keywords?.["$seen"]).length;
  const listNarrowed =
    searchActive || listViewFilter !== "all" || Boolean(activeLabelId);
  const shownCount = filteredListMessages.length;
  const listStatus = showSearchLoadingState
    ? "Searching…"
    : !listNarrowed
      ? ""
      : shownCount === 1
        ? "1 message"
        : `${shownCount} messages`;

  return (
    <div
      className={
        isMobile
          ? showMobileDetailPane
            ? "hidden"
            : "flex h-full min-h-0 flex-1 flex-col overflow-hidden"
          : cn(
              "flex h-full min-h-0 shrink-0 flex-col overflow-hidden rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-l2-solid)]",
              MAIL_LIST_NARROW_WIDTH_CLASS,
            )
      }
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {searchCoverageText ? (
          <p role="status" className="px-3 py-2 text-xs text-muted-foreground">
            {searchCoverageText}
          </p>
        ) : null}
        {!isMobile && (
          <MailAppListHeader
            controller={controller}
            title={listTitle}
            unreadCount={unreadCount}
          />
        )}
        <p role="status" className="px-3 py-1 text-xs text-destructive empty:hidden">
          {searchIssues.join(" ")}
        </p>
        <p role="status" className="sr-only">
          {listStatus}
        </p>
        <div ref={listBodyRef} className="flex min-h-0 flex-1 flex-col">
          {showSearchLoadingState || (searchActive && shownCount === 0) ? (
            <MailSearchState loading={showSearchLoadingState} query={searchQuery} mailbox={listTitle} />
          ) : (
            <MessageList
              key={activeMailbox.selectedMailboxId ?? "mailbox-list"}
              messages={filteredListMessages}
              relatedMessages={listThreadRelatedMessages}
              selectedMessageId={selectedMessageId}
              onSelect={handleSelectMessage}
              mailboxes={activeMailbox.mailboxes}
              currentMailboxId={activeMailbox.selectedMailboxId}
              onDelete={(id) =>
                void handleDeleteMessage(id).catch((error) =>
                  log.error("Failed to delete message", error),
                )
              }
              onMove={(id, targetId) =>
                void handleMoveMessage(targetId, id).catch((error) =>
                  log.error("Failed to move message", error),
                )
              }
              onMarkAsUnread={(id) =>
                void handleMarkAsUnread(id).catch((error) =>
                  log.error("Failed to mark message as unread", error),
                )
              }
              onMarkAsRead={(id) =>
                void handleMarkAsRead(id).catch((error) =>
                  log.error("Failed to mark message as read", error),
                )
              }
              onBulkDelete={(ids) =>
                void handleBulkDelete(ids).catch((error) =>
                  log.error("Failed to delete messages", error),
                )
              }
              onBulkMove={(ids, targetId) =>
                void handleBulkMove(ids, targetId).catch((error) =>
                  log.error("Failed to move messages", error),
                )
              }
              onBulkMarkAsUnread={(ids) =>
                void handleBulkMarkAsUnread(ids).catch((error) =>
                  log.error("Failed to mark messages as unread", error),
                )
              }
              onBulkMarkAsRead={(ids) =>
                void handleBulkMarkAsRead(ids).catch((error) =>
                  log.error("Failed to mark messages as read", error),
                )
              }
              onToggleFlagged={(id) =>
                void handleToggleFlagged(id).catch((error) =>
                  log.error("Failed to toggle flagged", error),
                )
              }
              onReportSpam={(id) =>
                void handleReportSpam(id).catch((error) =>
                  log.error("Failed to report spam", error),
                )
              }
              onNotSpam={(id) =>
                void handleNotSpam(id).catch((error) =>
                  log.error("Failed to move out of spam", error),
                )
              }
              onBulkReportSpam={(ids) =>
                void handleBulkReportSpam(ids).catch((error) =>
                  log.error("Failed to report messages as spam", error),
                )
              }
              onSetLabel={(messageId, labelId, assigned) =>
                void handleSetMessageLabel(messageId, labelId, assigned).catch(
                  (error) => log.error("Failed to set message label", error),
                )
              }
              labels={labels}
              timeFormat={timeFormat}
              timezone={timezone}
              weekStartsOn={composeScheduling.weekStartsOn}
              scheduledSendAtById={scheduledSendAtById}
              onLoadMore={
                searchActive
                  ? undefined
                  : () =>
                      void loadMoreMessages().catch((error) =>
                        log.error("Failed to load more messages", error),
                      )
              }
              hasMore={searchActive ? false : hasMoreMessages}
              isLoadingMore={isLoadingMore}
              density={listSettings.density}
              showLabelChips={listSettings.showLabelChipsInList}
              threadExpandEnabled={listSettings.threadExpandInList}
              preserveMessageOrder={searchActive}
              narrow={!isMobile}
              cachedThreadMessages={cachedThreadMessages}
              onExpandThread={activeMailbox ? loadThreadMessages : undefined}
            />
          )}
        </div>
      </div>
    </div>
  );
}
