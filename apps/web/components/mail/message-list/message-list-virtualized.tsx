"use client";
"use no memo";

import { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AppLoadingState } from "@workspace/ui/components/ui";
import type { JmapEmailMessage, JmapMailbox, LabelDef } from "@/lib/mail/types";
import { MessageListRow } from "./message-list-row";
import {
  getRowHeight,
  ROW_HEIGHT_DESKTOP,
  ROW_HEIGHT_MOBILE,
  SCROLL_LOAD_THRESHOLD,
  type MessageListThreadRow,
} from "./message-list-utils";

type LoadMoreState = {
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
};

export type MessageListVirtualizedProps = {
  threadRows: MessageListThreadRow[];
  primaryIds: Set<string>;
  selectedMessageId: string | null;
  selectedIds: Set<string>;
  expandedThreads: Set<string>;
  expandedThreadMessages: Record<string, JmapEmailMessage[]>;
  isLoadingThread: Set<string>;
  labels: LabelDef[];
  moveTargets: JmapMailbox[];
  canReportSpam: boolean;
  canNotSpam: boolean;
  isMobile: boolean;
  density: "compact" | "comfortable";
  showLabelChips: boolean;
  threadExpandEnabled: boolean;
  timeFormat?: "12h" | "24h";
  timezone?: string;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  onSelect: (id: string) => void;
  onToggleSelect: (event: React.MouseEvent, ids: string[]) => void;
  onToggleThreadExpand: (threadId: string) => void;
  onDelete?: (id: string) => void;
  onMove?: (id: string, targetMailboxId: string) => void;
  onMarkAsUnread?: (id: string) => void;
  onMarkAsRead?: (id: string) => void;
  onBulkDelete?: (ids: string[]) => void;
  onBulkMove?: (ids: string[], targetMailboxId: string) => void;
  onBulkMarkAsUnread?: (ids: string[]) => void;
  onBulkMarkAsRead?: (ids: string[]) => void;
  onToggleFlagged?: (id: string) => void;
  onReportSpam?: (id: string) => void;
  onNotSpam?: (id: string) => void;
  onSetLabel?: (messageId: string, labelId: string, assigned: boolean) => void;
};

export function MessageListVirtualized({
  threadRows,
  primaryIds,
  selectedMessageId,
  selectedIds,
  expandedThreads,
  expandedThreadMessages,
  isLoadingThread,
  labels,
  moveTargets,
  canReportSpam,
  canNotSpam,
  isMobile,
  density,
  showLabelChips,
  threadExpandEnabled,
  timeFormat,
  timezone,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onSelect,
  onToggleSelect,
  onToggleThreadExpand,
  onDelete,
  onMove,
  onMarkAsUnread,
  onMarkAsRead,
  onBulkDelete,
  onBulkMove,
  onBulkMarkAsUnread,
  onBulkMarkAsRead,
  onToggleFlagged,
  onReportSpam,
  onNotSpam,
  onSetLabel,
}: MessageListVirtualizedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadMoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadMoreStateRef = useRef<LoadMoreState>({
    hasMore,
    isLoadingMore,
    onLoadMore,
  });
  loadMoreStateRef.current = { hasMore, isLoadingMore, onLoadMore };

  const estimateRowSize = (index: number) => {
    const row = threadRows[index];
    if (!row) return isMobile ? ROW_HEIGHT_MOBILE : ROW_HEIGHT_DESKTOP;
    return getRowHeight(row.latestMessage, labels, isMobile, density, showLabelChips);
  };

  const virtualizer = useVirtualizer({
    count: threadRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: estimateRowSize,
    overscan: 8,
    getItemKey: (index) => threadRows[index]?.id ?? String(index),
  });

  const scheduleLoadMore = () => {
    const state = loadMoreStateRef.current;
    if (!state.hasMore || state.isLoadingMore || !state.onLoadMore) return;
    if (loadMoreTimerRef.current) clearTimeout(loadMoreTimerRef.current);
    loadMoreTimerRef.current = setTimeout(() => {
      loadMoreTimerRef.current = null;
      const latest = loadMoreStateRef.current;
      if (latest.hasMore && !latest.isLoadingMore && latest.onLoadMore) {
        latest.onLoadMore();
      }
    }, 150);
  };

  const checkScrollForLoadMore = () => {
    const element = scrollRef.current;
    const state = loadMoreStateRef.current;
    if (!element || !state.hasMore || state.isLoadingMore || !state.onLoadMore) {
      return;
    }

    const remaining =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    if (remaining <= SCROLL_LOAD_THRESHOLD * 5) {
      scheduleLoadMore();
    }
  };

  const virtualItems = virtualizer.getVirtualItems();
  const lastVirtualItemIndex = virtualItems[virtualItems.length - 1]?.index;

  useEffect(() => {
    if (lastVirtualItemIndex === undefined) return;
    if (lastVirtualItemIndex >= threadRows.length - 5) {
      scheduleLoadMore();
    }
  }, [lastVirtualItemIndex, threadRows.length]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    element.addEventListener("scroll", checkScrollForLoadMore, {
      passive: true,
    });
    checkScrollForLoadMore();

    const resizeObserver = new ResizeObserver(checkScrollForLoadMore);
    resizeObserver.observe(element);

    return () => {
      element.removeEventListener("scroll", checkScrollForLoadMore);
      resizeObserver.disconnect();
      const timer = loadMoreTimerRef.current;
      if (timer) {
        clearTimeout(timer);
        loadMoreTimerRef.current = null;
      }
    };
  }, [threadRows.length]);

  useEffect(() => {
    if (!selectedMessageId) return;
    const index = threadRows.findIndex(
      (row) =>
        row.latestMessage.id === selectedMessageId ||
        row.messageIds.includes(selectedMessageId),
    );
    if (index >= 0) {
      virtualizer.scrollToIndex(index, { align: "auto" });
    }
  }, [selectedMessageId, threadRows, virtualizer]);

  return (
    <div
      ref={scrollRef}
      data-mail-list-scroll
      className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-6 safe-area-inset-bottom [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
    >
      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualItems.map((virtualRow) => {
          const row = threadRows[virtualRow.index];
          if (!row) return null;

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              className="absolute top-0 left-0 w-full"
              style={{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <MessageListRow
                row={row}
                primaryIds={primaryIds}
                selectedMessageId={selectedMessageId}
                selectedIds={selectedIds}
                expandedThreads={expandedThreads}
                expandedThreadMessages={expandedThreadMessages}
                isLoadingThread={isLoadingThread}
                labels={labels}
                moveTargets={moveTargets}
                canReportSpam={canReportSpam}
                canNotSpam={canNotSpam}
                isMobile={isMobile}
                density={density}
                showLabelChips={showLabelChips}
                threadExpandEnabled={threadExpandEnabled}
                timeFormat={timeFormat}
                timezone={timezone}
                onSelect={onSelect}
                onToggleSelect={onToggleSelect}
                onToggleThreadExpand={onToggleThreadExpand}
                onDelete={onDelete}
                onMove={onMove}
                onMarkAsUnread={onMarkAsUnread}
                onMarkAsRead={onMarkAsRead}
                onBulkDelete={onBulkDelete}
                onBulkMove={onBulkMove}
                onBulkMarkAsUnread={onBulkMarkAsUnread}
                onBulkMarkAsRead={onBulkMarkAsRead}
                onToggleFlagged={onToggleFlagged}
                onReportSpam={onReportSpam}
                onNotSpam={onNotSpam}
                onSetLabel={onSetLabel}
              />
            </div>
          );
        })}
      </div>
      {hasMore && isLoadingMore && (
        <div className="flex items-center justify-center py-4">
          <AppLoadingState variant="inline" text="Loading more messages…" />
        </div>
      )}
    </div>
  );
}
