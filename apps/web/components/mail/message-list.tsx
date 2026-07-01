"use client";

import { useReducer, useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useIsMobile } from "@workspace/ui/hooks";
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
  timeFormat?: "12h" | "24h";
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

  const hasBulkSelection = state.selectedIds.size > 0;
  const bulkIds = Array.from(state.selectedIds);

  useGSAP(() => {
    const bar = barRef.current;
    if (!bar) return;
    if (hasBulkSelection) {
      gsap.fromTo(
        bar,
        { y: -6, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.22, ease: "power2.out" },
      );
    } else if (state.isBarVisible) {
      gsap.to(bar, {
        y: -6,
        opacity: 0,
        duration: 0.16,
        ease: "power2.in",
        onComplete: () => dispatch({ type: "hideBar" }),
      });
    }
  }, [hasBulkSelection, state.isBarVisible]);

  const threadRows = buildMessageListThreadRows(
    messages,
    relatedMessages,
    preserveMessageOrder,
  );
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

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">No messages</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {state.isBarVisible && (
        <MessageListBulkBar
          barRef={barRef}
          selectedCount={state.selectedIds.size}
          messageIds={bulkIds}
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
        selectedMessageId={selectedMessageId}
        selectedIds={state.selectedIds}
        expandedThreads={state.expandedThreads}
        expandedThreadMessages={state.expandedThreadMessages}
        isLoadingThread={state.isLoadingThread}
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
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={onLoadMore}
        onSelect={onSelect}
        onToggleSelect={handleToggleSelect}
        onToggleThreadExpand={handleToggleThreadExpand}
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
}
