"use client";

import type { TimeFormat } from "@workspace/calendar-core";
import { useLayoutEffect, useReducer, useRef } from "react";
import { useIsMobile } from "@workspace/ui/hooks";
import {
  MOTION_EASING,
  slideFadeIn,
  slideFadeOut,
} from "@workspace/ui/lib/motion";
import type { JmapEmailMessage, JmapMailbox, LabelDef } from "@/lib/mail/types";
import {
  findSpamMailbox,
  isSpamMailboxRole,
  isTrashMailboxRole,
} from "@/lib/mail/mail-mailbox-roles";
import { MessageListBulkBar } from "./message-list/message-list-bulk-bar";
import { MessageListVirtualized } from "./message-list/message-list-virtualized";
import {
  initialMessageListState,
  messageListReducer,
} from "./message-list/message-list-state";
import type {
  MessageListRowInteraction,
  MessageListRowPresentation,
} from "./message-list/message-list-types";
import { buildMessageListThreadRows } from "./message-list/message-list-utils";

const MOVE_EXCLUDED_ROLES = new Set(["sent", "drafts"]);
const EMPTY_RELATED_MESSAGES: JmapEmailMessage[] = [];
const EMPTY_LABELS: LabelDef[] = [];

export interface MessageListProps {
  messages: JmapEmailMessage[];
  /** Cross-mailbox messages (sent, etc.) used to augment thread grouping */
  relatedMessages?: JmapEmailMessage[];
  selectedMessageId: string | null;
  onSelect: (id: string) => void;
  mailboxes?: JmapMailbox[];
  currentMailboxId?: string | null;
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
  onBulkReportSpam?: (ids: string[]) => void;
  onSetLabel?: (messageId: string, labelId: string, assigned: boolean) => void;
  labels?: LabelDef[];
  timeFormat: TimeFormat;
  timezone?: string;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  density?: "compact" | "comfortable";
  showLabelChips?: boolean;
  threadExpandEnabled?: boolean;
  onExpandThread?: (threadId: string) => Promise<JmapEmailMessage[]> | void;
  /** Keep search relevance order instead of re-sorting threads by date. */
  preserveMessageOrder?: boolean;
  /** Stack rows and collapse hover actions into a menu when the reader is open beside the list. */
  narrow?: boolean;
}

export function MessageList({
  messages,
  relatedMessages = EMPTY_RELATED_MESSAGES,
  selectedMessageId,
  onSelect,
  mailboxes,
  currentMailboxId,
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
  onBulkReportSpam,
  onSetLabel,
  labels = EMPTY_LABELS,
  timeFormat,
  timezone,
  onLoadMore,
  hasMore,
  isLoadingMore,
  density = "compact",
  showLabelChips = true,
  threadExpandEnabled = true,
  onExpandThread,
  preserveMessageOrder = false,
  narrow = false,
}: MessageListProps) {
  const [state, dispatch] = useReducer(
    messageListReducer,
    initialMessageListState,
  );
  const barRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const currentMailbox = mailboxes?.find(
    (mailbox) => mailbox.id === currentMailboxId,
  );
  const currentMailboxRole = currentMailbox?.role;
  const isInSpam = isSpamMailboxRole(currentMailboxRole);
  const isInTrash = isTrashMailboxRole(currentMailboxRole);
  const spamMailbox = findSpamMailbox(mailboxes ?? []);
  const canReportSpam =
    Boolean(onReportSpam) && !isInSpam && !isInTrash && Boolean(spamMailbox);
  const canNotSpam = Boolean(onNotSpam) && isInSpam;

  const moveTargets = (mailboxes ?? []).filter(
    (mailbox) =>
      mailbox.id !== currentMailboxId &&
      !MOVE_EXCLUDED_ROLES.has(mailbox.role?.toLowerCase() ?? ""),
  );

  const threadRows = buildMessageListThreadRows(
    messages,
    relatedMessages,
    preserveMessageOrder,
  );
  const visibleIds = new Set(threadRows.flatMap((row) => row.messageIds));
  // Filters, labels and search hide rows without clearing selection; bulk actions must only hit shown messages.
  const bulkIds = Array.from(state.selectedIds).filter((id) => visibleIds.has(id));
  const selectedIds = new Set(bulkIds);
  const hasBulkSelection = bulkIds.length > 0;

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    if (hasBulkSelection) {
      const enter = slideFadeIn(bar, { y: -6 }, {
        duration: 220,
        easing: MOTION_EASING.soft,
      });
      return () => enter?.cancel();
    }
    if (!state.isBarVisible) return;
    const exit = slideFadeOut(bar, { y: -6 }, { duration: 160 });
    if (!exit) {
      dispatch({ type: "hideBar" });
      return;
    }
    exit.onfinish = () => dispatch({ type: "hideBar" });
    return () => {
      exit.onfinish = null;
      exit.cancel();
    };
  }, [hasBulkSelection, state.isBarVisible]);

  const primaryIds = new Set(messages.map((message) => message.id));

  const handleToggleSelect = (event: React.MouseEvent, ids: string[]) => {
    event.stopPropagation();
    dispatch({ type: "toggleSelect", ids });
  };

  const handleToggleThreadExpand = (threadId: string) => {
    const isExpanded = state.expandedThreads.has(threadId);
    dispatch({ type: "toggleThread", threadId });
    if (
      !isExpanded &&
      onExpandThread &&
      !state.expandedThreadMessages[threadId]
    ) {
      dispatch({ type: "setThreadLoading", threadId, loading: true });
      void Promise.resolve(onExpandThread(threadId))
        .then((threadMessages) => {
          if (threadMessages && threadMessages.length > 0) {
            dispatch({
              type: "setThreadMessages",
              threadId,
              messages: threadMessages,
            });
          }
        })
        .catch(() => {
          // Non-critical
        })
        .finally(() => {
          dispatch({ type: "setThreadLoading", threadId, loading: false });
        });
    }
  };

  if (messages.length === 0 && !hasMore) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">No messages</p>
      </div>
    );
  }

  const interaction: MessageListRowInteraction = {
    selectedMessageId,
    selectedIds,
    onSelect,
    onToggleSelect: handleToggleSelect,
    onToggleThreadExpand: handleToggleThreadExpand,
  };
  const presentation: MessageListRowPresentation = {
    labels,
    moveTargets,
    spamActions: { canReportSpam, canNotSpam },
    display: {
      isMobile,
      narrow: narrow && !isMobile,
      density,
      showLabelChips,
      threadExpandEnabled,
    },
    threadUi: {
      expandedThreads: state.expandedThreads,
      expandedThreadMessages: state.expandedThreadMessages,
      loadingThreadIds: state.isLoadingThread,
    },
    timeFormat,
    timezone,
    mailboxActions: {
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
    },
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {state.isBarVisible && (
        <MessageListBulkBar
          barRef={barRef}
          selectedCount={bulkIds.length}
          messageIds={bulkIds}
          allMessageIds={messages.map((message) => message.id)}
          moveTargets={moveTargets}
          canReportSpam={canReportSpam && Boolean(onBulkReportSpam)}
          bulkActionsOpen={state.bulkActionsOpen}
          onBulkActionsOpenChange={(open) =>
            dispatch({ type: "setBulkActionsOpen", open })
          }
          onClearSelection={() => dispatch({ type: "clearSelection" })}
          onSelectAll={() =>
            dispatch({
              type: "selectAll",
              ids: messages.map((message) => message.id),
            })
          }
          onBulkMarkAsRead={onBulkMarkAsRead}
          onBulkMarkAsUnread={onBulkMarkAsUnread}
          onBulkDelete={onBulkDelete}
          onBulkReportSpam={onBulkReportSpam}
          onBulkMove={onBulkMove}
        />
      )}
      <MessageListVirtualized
        threadRows={threadRows}
        primaryIds={primaryIds}
        interaction={interaction}
        presentation={presentation}
        pagination={{ hasMore, isLoadingMore, onLoadMore }}
      />
    </div>
  );
}
