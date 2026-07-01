"use client";

import { RotateCcw, Search, X } from "lucide-react";
import { Button } from "@workspace/ui/components/ui/button";
import { Input } from "@workspace/ui/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/ui/tooltip";
import { AdvancedSearchPanel, AdvancedSearchToggle, countActiveFilters } from "../advanced-search-panel";
import { MessageList } from "../message-list";
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
    isSearching,
    searchUiActive,
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

  return (
    <div
      className={
        isMobile
          ? showMobileDetailPane
            ? "hidden"
            : "flex h-full min-h-0 flex-1 flex-col overflow-hidden"
          : "flex h-full min-h-0 w-72 shrink-0 flex-col overflow-hidden border-r border-border/40"
      }
    >
      {!isMobile && (
        <header className="flex h-11 shrink-0 items-center border-b border-border/40 px-3 gap-2">
          <h1 className="text-sm font-semibold flex-1 min-w-0 truncate">
            {selectedMailboxName}
          </h1>
          <div className="flex items-center gap-0.5 shrink-0">
            {canEmptyFolder ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                    disabled={isBusy || isRefreshing}
                    onClick={() => patchListChrome({ emptyFolderOpen: true })}
                  >
                    {emptyFolderLabel}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Permanently delete all messages in this folder
                </TooltipContent>
              </Tooltip>
            ) : null}
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-[min(var(--radius-md),12px)] disabled:opacity-40"
              disabled={isRefreshing || isBusy}
              onClick={() => void handleManualRefresh()}
              aria-label="Refresh mail"
              title="Refresh mail"
            >
              <RotateCcw
                size={15}
                strokeWidth={2}
                className={
                  isRefreshing ? "animate-spin" : "transition-transform"
                }
              />
            </Button>
          </div>
        </header>
      )}
      {!isMobile && (
        <div className="px-3 py-2 border-b border-border/40 shrink-0">
          <div className="flex items-center gap-1.5">
            <div className="relative flex min-w-0 flex-1 items-center">
              <Search
                size={13}
                strokeWidth={2}
                className="absolute left-2.5 text-muted-foreground/50 pointer-events-none"
              />
              <Input
                ref={searchInputRef}
                value={mailListSearch}
                onChange={(e) => handleSearchInputChange(e.target.value)}
                onKeyDown={handleSearchInputKeyDown}
                placeholder="Search all messages… (press / to focus)"
                className="h-7 w-full pl-7 pr-7 text-xs bg-muted/40 border-0 shadow-none rounded-md focus-visible:ring-1 focus-visible:ring-ring/40 placeholder:text-muted-foreground/40"
              />
              {(isSearching || isSearchDebouncing) && searchUiActive && (
                <RotateCcw
                  size={11}
                  strokeWidth={2}
                  className="absolute right-2 text-muted-foreground/40 animate-spin pointer-events-none"
                />
              )}
              {mailListSearch && !isSearching && !isSearchDebouncing && (
                <button
                  type="button"
                  onClick={clearListSearch}
                  className="absolute right-2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  aria-label="Clear search"
                >
                  <X size={12} strokeWidth={2.5} />
                </button>
              )}
            </div>
            <AdvancedSearchToggle
              expanded={filterPanelExpanded}
              onExpandedChange={(expanded) =>
                patchListChrome({ filterPanelExpanded: expanded })
              }
              activeCount={countActiveFilters(advancedFilters)}
            />
          </div>
          <AdvancedSearchPanel
            filters={advancedFilters}
            onFiltersChange={(filters) =>
              patchListChrome({ advancedFilters: filters })
            }
            expanded={filterPanelExpanded}
            onExpandedChange={(expanded) =>
              patchListChrome({ filterPanelExpanded: expanded })
            }
          />
        </div>
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
