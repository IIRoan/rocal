"use client";

import { useLayoutEffect, useRef } from "react";
import { usePrefersReducedMotion } from "@workspace/ui/hooks";
import { cn } from "@workspace/ui/lib/utils";
import { toast } from "sonner";
import { getErrorMessage } from "@workspace/calendar-core";
import { createLogger } from "@workspace/logger";
import {
  MAIL_LIST_NARROW_WIDTH_CLASS,
  MAIL_LIST_OPEN_FADE_OPTIONS,
  MAIL_LIST_SWAP_KEYFRAMES,
  MAIL_READER_ANIMATION_OPTIONS,
  MAIL_READER_MOTION_CLASS,
} from "./mail-reader-transition";
import { MessageList } from "../message-list";
import { MailMailboxHeader } from "../mail-mailbox-header";
import { applyMailListViewFilter } from "../mail-app-list-chrome-state";
import type { MailAppContentController } from "../use-mail-app-content-controller";

const log = createLogger("mail-app-list-column");

export function MailAppListColumn({
  controller,
}: {
  controller: MailAppContentController;
}) {
  const {
    isMobile,
    showMobileDetailPane,
    desktopDetailPaneActive,
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

  const contentRef = useRef<HTMLDivElement>(null);
  const renderedDetailPaneRef = useRef(desktopDetailPaneActive);
  const prefersReducedMotion = usePrefersReducedMotion();

  useLayoutEffect(() => {
    if (renderedDetailPaneRef.current === desktopDetailPaneActive) return;
    renderedDetailPaneRef.current = desktopDetailPaneActive;
    const content = contentRef.current;
    if (!content || prefersReducedMotion || typeof content.animate !== "function") return;
    // Open fade is half-length: Firefox re-composites the opacity group every frame while the stacked rows reflow.
    // repo-rules-allow motion-shared-helpers: partial 0.4→1 fade with pane-scoped durations; slideFadeIn's 0→1 keyframes and visibility don't fit.
    const fade = content.animate(
      MAIL_LIST_SWAP_KEYFRAMES,
      desktopDetailPaneActive ? MAIL_LIST_OPEN_FADE_OPTIONS : MAIL_READER_ANIMATION_OPTIONS,
    );
    return () => fade.cancel();
  }, [desktopDetailPaneActive, prefersReducedMotion]);

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
          : cn(
              "flex h-full min-h-0 shrink-0 flex-col overflow-hidden bg-[var(--bg-l2-solid)]",
              // Only narrowing animates (stacked rows follow the edge under the sliding reader); on close the list is already full width beneath it.
              desktopDetailPaneActive
                // repo-rules-allow motion-compositor-only: width narrows under the covering reader pane (READER-TRANSITION.md); a transform-only swap would reintroduce the Firefox stutter.
                ? cn(MAIL_LIST_NARROW_WIDTH_CLASS, "transition-[width]", MAIL_READER_MOTION_CLASS)
                : "w-full",
            )
      }
    >
      <div ref={contentRef} className="flex min-h-0 flex-1 flex-col">
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
              onClick: () =>
                void handleManualRefresh().catch((error) =>
                  toast.error(getErrorMessage(error, "Could not refresh mail.")),
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
            narrow={desktopDetailPaneActive}
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
    </div>
  );
}
