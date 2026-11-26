"use client";
"use no memo";

import { useEffect, useLayoutEffect, useRef } from "react";
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
  getRowHeight,
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

type ItemHeightOptions = Pick<MessageListRowPresentation, "labels"> &
  Pick<MessageListRowPresentation["display"], "isMobile" | "density" | "showLabelChips">;

function itemHeight(
  item: MessageListItem | undefined,
  { labels, isMobile, density, showLabelChips }: ItemHeightOptions,
  narrow: boolean,
) {
  if (!item || item.kind === "day") return DAY_HEADER_HEIGHT;
  return getRowHeight(item.row.latestMessage, labels, isMobile, density, showLabelChips, narrow);
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
  const { labels, display } = presentation;
  const { isMobile, narrow, density, showLabelChips } = display;
  const { hasMore, isLoadingMore, onLoadMore } = pagination;
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadMoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadMoreStateRef = useRef<MessageListPaginationState>(pagination);

  useEffect(() => {
    loadMoreStateRef.current = pagination;
  });

  const estimateRowSize = (index: number) =>
    itemHeight(items[index], { labels, isMobile, density, showLabelChips }, narrow);

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

  const renderedNarrowRef = useRef(narrow);
  // Row heights change with `narrow`; keep the selected (else top) row at the same screen position so nothing jumps.
  useLayoutEffect(() => {
    if (renderedNarrowRef.current === narrow) return;
    renderedNarrowRef.current = narrow;
    const element = scrollRef.current;
    if (!element) return;
    const scrollTop = element.scrollTop;
    const previousStarts: number[] = [];
    const nextStarts: number[] = [];
    let previous = 0;
    let next = 0;
    let topIndex = 0;
    items.forEach((item, index) => {
      previousStarts.push(previous);
      nextStarts.push(next);
      if (previous <= scrollTop) topIndex = index;
      const heightOptions = { labels, isMobile, density, showLabelChips };
      previous += itemHeight(item, heightOptions, !narrow);
      next += itemHeight(item, heightOptions, narrow);
    });
    const selectedIndex = findThreadRowIndex(items, selectedMessageId);
    const selectedStart = previousStarts[selectedIndex];
    const selectedVisible =
      selectedStart !== undefined &&
      selectedStart >= scrollTop &&
      selectedStart < scrollTop + element.clientHeight;
    const anchor = selectedVisible ? selectedIndex : topIndex;
    const previousStart = previousStarts[anchor];
    const nextStart = nextStarts[anchor];
    if (previousStart === undefined || nextStart === undefined) return;
    element.scrollTop = nextStart + (scrollTop - previousStart);
  }, [narrow, items, selectedMessageId, labels, isMobile, density, showLabelChips]);

  useEffect(() => {
    const index = findThreadRowIndex(items, selectedMessageId);
    if (index >= 0) {
      virtualizer.scrollToIndex(index, { align: "auto" });
    }
  }, [selectedMessageId, items, virtualizer, narrow]);

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
