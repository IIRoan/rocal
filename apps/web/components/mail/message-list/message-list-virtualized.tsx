"use client";
"use no memo";

import { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AppLoadingState } from "@workspace/ui/components/ui";
import { cn } from "@workspace/ui/lib/utils";
import { MessageListDayHeader, MessageListRow } from "./message-list-row";
import type {
  MessageListPaginationState,
  MessageListRowInteraction,
  MessageListRowPresentation,
} from "./message-list-types";
import {
  DAY_HEADER_HEIGHT,
  ROW_HEIGHT,
  SCROLL_LOAD_THRESHOLD,
  type MessageListItem,
} from "./message-list-utils";

export type MessageListVirtualizedProps = {
  items: MessageListItem[];
  primaryIds: Set<string>;
  interaction: MessageListRowInteraction;
  presentation: MessageListRowPresentation;
  pagination: MessageListPaginationState;
  /** While selecting, day headings offer select-all. */
  selectionActive: boolean;
  /** The floating action bar is up, so the list scrolls clear of it. */
  reserveBarSpace: boolean;
};

function itemHeight(item: MessageListItem | undefined) {
  return item?.kind === "row" ? ROW_HEIGHT : DAY_HEADER_HEIGHT;
}

function findThreadRowIndex(
  items: MessageListItem[],
  messageId: string | null | undefined,
) {
  if (!messageId) return -1;
  return items.findIndex(
    (item) =>
      item.kind === "row" &&
      (item.row.latestMessage.id === messageId || item.row.messageIds.includes(messageId)),
  );
}

export function MessageListVirtualized({
  items,
  primaryIds,
  interaction,
  presentation,
  pagination,
  selectionActive,
  reserveBarSpace,
}: MessageListVirtualizedProps) {
  "use no memo";
  const { selectedMessageId, selectedIds, onToggleSelect } = interaction;
  const { hasMore, isLoadingMore, onLoadMore } = pagination;
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadMoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadMoreStateRef = useRef<MessageListPaginationState>(pagination);

  useEffect(() => {
    loadMoreStateRef.current = pagination;
  });

  const estimateRowSize = (index: number) => itemHeight(items[index]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: estimateRowSize,
    overscan: 8,
    getItemKey: (index) => items[index]?.id ?? String(index),
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
    if (lastVirtualItemIndex >= items.length - 5) {
      scheduleLoadMore();
    }
  }, [lastVirtualItemIndex, items.length]);

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
  }, [items.length, isLoadingMore]);

  useEffect(() => {
    const index = findThreadRowIndex(items, selectedMessageId);
    if (index >= 0) {
      virtualizer.scrollToIndex(index, { align: "auto" });
    }
  }, [selectedMessageId, items, virtualizer]);

  return (
    <div
      ref={scrollRef}
      data-mail-list-scroll
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-y-auto safe-area-inset-bottom [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
        reserveBarSpace ? "pb-20" : "pb-6",
      )}
    >
      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualItems.map((virtualRow) => {
          const item = items[virtualRow.index];
          if (!item) return null;

          // Measured, so an expanded thread's child rows push the next row down instead of overlapping it.
          return (
            <div
              key={virtualRow.key}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              className="absolute top-0 left-0 w-full"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              {item.kind === "day" ? (
                <MessageListDayHeader
                  label={item.label}
                  selectionActive={selectionActive}
                  allSelected={item.messageIds.every((id) => selectedIds.has(id))}
                  onToggleDay={(event) => onToggleSelect(event, item.messageIds)}
                />
              ) : (
                <MessageListRow
                  row={item.row}
                  primaryIds={primaryIds}
                  interaction={interaction}
                  presentation={presentation}
                  height={estimateRowSize(virtualRow.index)}
                />
              )}
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
