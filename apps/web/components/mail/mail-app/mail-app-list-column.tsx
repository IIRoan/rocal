"use client";

import { MessageList } from "../message-list";
import { MailMailboxHeader } from "../mail-mailbox-header";
import { applyMailListViewFilter } from "../mail-app-list-chrome-state";
import type { MailAppContentController } from "../use-mail-app-content-controller";

export function MailAppListColumn({
  controller,
}: {
  controller: MailAppContentController;
}) {
  const {
    isMobile,
    showMobileDetailPane,
    selectedMailboxName,
    canEmptyFolder,
    emptyFolderLabel,
    isBusy,
    isRefreshing,
    patchListChrome,
    mailListSearch,
    advancedFilters,
    filterPanelExpanded,
    searchBarOpen,
    listViewFilter,
    activeLabelId,
    isSearching,
    isSearchDebouncing,
    searchActive,
    showSearchLoadingState,
    searchInputRef,
    clearListSearch,
    handleSearchInputChange,
    handleSearchInputKeyDown,
    handleManualRefresh,
    activeMailbox,
    filteredListMessages,
    listThreadRelatedMessages,
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
  } = controller;

  if (!activeMailbox) {
    return null;
  }

  const activeLabel = labels.find((label) => label.id === activeLabelId);
  const unreadCount = applyMailListViewFilter(
    activeMailbox.messages,
    "all",
    activeLabelId,
  ).filter((message) => !message.keywords?.["$seen"]).length;

  return (
    <div
      className={
        isMobile
          ? showMobileDetailPane
            ? "hidden"
            : "flex h-full min-h-0 flex-1 flex-col overflow-hidden"
          : "flex h-full min-h-0 min-w-[280px] flex-1 flex-col overflow-hidden border-r border-[var(--border-secondary)] bg-[var(--bg-l2-solid)]"
      }
    >
      {!isMobile && (
        <MailMailboxHeader
          title={activeLabel?.name ?? selectedMailboxName}
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
            onClick: () => void handleManualRefresh(),
          }}
          emptyFolder={
            canEmptyFolder
              ? {
                  label: emptyFolderLabel,
                  onClick: () => patchListChrome({ emptyFolderOpen: true }),
                }
              : undefined
          }
        />
      )}
      <div className="flex min-h-0 flex-1 flex-col">
        {showSearchLoadingState ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <p className="text-sm text-muted-foreground">Searching…</p>
          </div>
        ) : (
          <MessageList
          key={activeMailbox.selectedMailboxId ?? "mailbox-list"}
          messages={filteredListMessages}
          relatedMessages={listThreadRelatedMessages}
          selectedMessageId={selectedMessageId}
          onSelect={handleSelectMessage}
          mailboxes={activeMailbox.mailboxes}
          currentMailboxId={activeMailbox.selectedMailboxId}
          onDelete={(id) => void handleDeleteMessage(id)}
          onMove={(id, targetId) => void handleMoveMessage(targetId, id)}
          onMarkAsUnread={(id) => void handleMarkAsUnread(id)}
          onMarkAsRead={(id) => void handleMarkAsRead(id)}
          onBulkDelete={(ids) => void handleBulkDelete(ids)}
          onBulkMove={(ids, targetId) => void handleBulkMove(ids, targetId)}
          onBulkMarkAsUnread={(ids) => void handleBulkMarkAsUnread(ids)}
          onBulkMarkAsRead={(ids) => void handleBulkMarkAsRead(ids)}
          onToggleFlagged={(id) => void handleToggleFlagged(id)}
          onReportSpam={(id) => void handleReportSpam(id)}
          onNotSpam={(id) => void handleNotSpam(id)}
          onBulkReportSpam={(ids) => void handleBulkReportSpam(ids)}
          onSetLabel={(messageId, labelId, assigned) =>
            void handleSetMessageLabel(messageId, labelId, assigned)
          }
          labels={labels}
          timeFormat={timeFormat}
          timezone={timezone}
          onLoadMore={searchActive ? undefined : () => void loadMoreMessages()}
          hasMore={searchActive ? false : hasMoreMessages}
          isLoadingMore={isLoadingMore}
          density={listSettings.density}
          showLabelChips={listSettings.showLabelChipsInList}
          threadExpandEnabled={listSettings.threadExpandInList}
          preserveMessageOrder={searchActive}
          onExpandThread={
            activeMailbox
              ? async (threadId: string) => {
                  try {
                    const messages = await activeMailbox.client.getThreadMessages(
                      activeMailbox.session,
                      threadId,
                    );
                    return messages;
                  } catch {
                    return [];
                  }
                }
              : undefined
          }
          />
        )}
      </div>
    </div>
  );
}
