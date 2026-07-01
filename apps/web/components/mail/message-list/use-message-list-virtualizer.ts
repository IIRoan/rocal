"use no memo";

import { useEffect, useRef } from "react";
import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import type { LabelDef } from "@/lib/mail/types";
import {
  getRowHeight,
  ROW_HEIGHT_DESKTOP,
  ROW_HEIGHT_MOBILE,
  SCROLL_LOAD_THRESHOLD,
  type MessageListThreadRow,
} from "./message-list-utils";
import type { MessageListDisplayOptions, MessageListPaginationState } from "./message-list-types";

type VirtualizerSizing = MessageListDisplayOptions & {
  labels: LabelDef[];
};

type UseMessageListVirtualizerInput = {
  threadRows: MessageListThreadRow[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  sizing: VirtualizerSizing;
  selectedMessageId: string | null;
  pagination: MessageListPaginationState;
  onLoadMore?: () => void;
};

function estimateThreadRowSize(
  threadRows: MessageListThreadRow[],
  index: number,
  sizing: VirtualizerSizing,
): number {
  const row = threadRows[index];
  if (!row) return sizing.isMobile ? ROW_HEIGHT_MOBILE : ROW_HEIGHT_DESKTOP;
  return getRowHeight(
    row.latestMessage,
    sizing.labels,
    sizing.isMobile,
    sizing.density,
    sizing.showLabelChips,
  );
}

export function useMessageListVirtualizer({
  threadRows,
  scrollRef,
  sizing,
  selectedMessageId,
  pagination,
  onLoadMore,
}: UseMessageListVirtualizerInput): Virtualizer<HTMLDivElement, Element> {
  const threadRowsRef = useRef(threadRows);
  threadRowsRef.current = threadRows;

  const sizingRef = useRef(sizing);
  sizingRef.current = sizing;

  const paginationRef = useRef({ ...pagination, onLoadMore });
  paginationRef.current = { ...pagination, onLoadMore };

  const loadMoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const virtualizer = useVirtualizer({
    count: threadRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) =>
      estimateThreadRowSize(threadRowsRef.current, index, sizingRef.current),
    overscan: 8,
    getItemKey: (index) => threadRowsRef.current[index]?.id ?? String(index),
  });

  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const scheduleLoadMore = () => {
      const state = paginationRef.current;
      if (!state.hasMore || state.isLoadingMore || !state.onLoadMore) return;
      if (loadMoreTimerRef.current) clearTimeout(loadMoreTimerRef.current);
      loadMoreTimerRef.current = setTimeout(() => {
        loadMoreTimerRef.current = null;
        const latest = paginationRef.current;
        if (latest.hasMore && !latest.isLoadingMore && latest.onLoadMore) {
          latest.onLoadMore();
        }
      }, 150);
    };

    const checkScrollForLoadMore = () => {
      const state = paginationRef.current;
      if (!state.hasMore || state.isLoadingMore || !state.onLoadMore) return;

      const remaining =
        element.scrollHeight - element.scrollTop - element.clientHeight;
      if (remaining <= SCROLL_LOAD_THRESHOLD * 5) {
        scheduleLoadMore();
      }
    };

    const handleScroll = () => {
      checkScrollForLoadMore();
      const items = virtualizerRef.current.getVirtualItems();
      const lastIndex = items[items.length - 1]?.index;
      if (
        lastIndex !== undefined &&
        lastIndex >= threadRowsRef.current.length - 5
      ) {
        scheduleLoadMore();
      }
    };

    element.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    const resizeObserver = new ResizeObserver(handleScroll);
    resizeObserver.observe(element);

    const timerRef = loadMoreTimerRef;
    return () => {
      element.removeEventListener("scroll", handleScroll);
      resizeObserver.disconnect();
      const pendingTimer = timerRef.current;
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        timerRef.current = null;
      }
    };
  }, [scrollRef, threadRows.length]);

  useEffect(() => {
    if (!selectedMessageId) return;
    const index = threadRowsRef.current.findIndex(
      (row) =>
        row.latestMessage.id === selectedMessageId ||
        row.messageIds.includes(selectedMessageId),
    );
    if (index >= 0) {
      virtualizerRef.current.scrollToIndex(index, { align: "auto" });
    }
  }, [selectedMessageId, threadRows]);

  return virtualizer;
}
