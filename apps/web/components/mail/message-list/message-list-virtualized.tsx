"use client";
"use no memo";

import { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AppLoadingState } from "@workspace/ui/components/ui";
import { MessageListRow } from "./message-list-row";
import type {
  MessageListPaginationState,
  MessageListRowInteraction,
  MessageListRowPresentation,
} from "./message-list-types";
import {
  getRowHeight,
  ROW_HEIGHT_DESKTOP,
  ROW_HEIGHT_MOBILE,
  SCROLL_LOAD_THRESHOLD,
  type MessageListThreadRow,
} from "./message-list-utils";

export type MessageListVirtualizedProps = {
  threadRows: MessageListThreadRow[];
  primaryIds: Set<string>;
  interaction: MessageListRowInteraction;
  presentation: MessageListRowPresentation;
  pagination: MessageListPaginationState;
};

export function MessageListVirtualized({
  threadRows,
  primaryIds,
  interaction,
  presentation,
  pagination,
}: MessageListVirtualizedProps) {
  "use no memo";
  const { selectedMessageId } = interaction;
  const { labels, display } = presentation;
  const { isMobile, density, showLabelChips } = display;
  const { hasMore, isLoadingMore, onLoadMore } = pagination;
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadMoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadMoreStateRef = useRef<MessageListPaginationState>(pagination);

  useEffect(() => {
    loadMoreStateRef.current = pagination;
  });

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

  // Re-check after each page: a list filter can leave loaded rows short of the viewport.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    element.addEventListener("scroll", checkScrollForLoadMore, {
      passive: true,
    });
    checkScrollForLoadMore();

    const resizeObserver = new ResizeObserver(checkScrollForLoadMore);
    resizeObserver.observe(element);
    const loadMoreTimer = loadMoreTimerRef;

    return () => {
      element.removeEventListener("scroll", checkScrollForLoadMore);
      resizeObserver.disconnect();
      const timer = loadMoreTimer.current;
      if (timer) {
        clearTimeout(timer);
        loadMoreTimer.current = null;
      }
    };
  }, [threadRows.length, isLoadingMore]);

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
                interaction={interaction}
                presentation={presentation}
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
