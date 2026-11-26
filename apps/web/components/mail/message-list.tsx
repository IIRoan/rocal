"use client";

import { mailListDayLabel, type TimeFormat } from "@workspace/calendar-core";
import { useLayoutEffect, useReducer, useRef, useState } from "react";
import { useIsMobile } from "@workspace/ui/hooks";
import { MOTION_EASING, slideFadeIn } from "@workspace/ui/lib/motion";
import type { JmapEmailMessage, JmapMailbox, LabelDef } from "@/lib/mail/types";
import {
  findSpamMailbox,
  isSpamMailboxRole,
  isTrashMailboxRole,
} from "@/lib/mail/mail-mailbox-roles";
import {
  MessageListBulkBar,
  type MessageListBarTarget,
} from "./message-list/message-list-bulk-bar";
import { MessageListVirtualized } from "./message-list/message-list-virtualized";
import {
  initialMessageListState,
  messageListReducer,
  type MessageListAction,
  type MessageListState,
} from "./message-list/message-list-state";
import type {
  MessageListRowInteraction,
  MessageListRowPresentation,
} from "./message-list/message-list-types";
import {
  buildMessageListItems,
  buildMessageListThreadRows,
  type MessageListThreadRow,
} from "./message-list/message-list-utils";

const MOVE_EXCLUDED_ROLES = new Set(["sent", "drafts"]);
const EMPTY_RELATED_MESSAGES: JmapEmailMessage[] = [];
const EMPTY_LABELS: LabelDef[] = [];

/** Where the current mailbox lets messages go, and whether they can be reported as spam or rescued from it. */
function resolveMailboxActions(
  mailboxes: JmapMailbox[] | undefined,
  currentMailboxId: string | null | undefined,
  canReport: boolean,
  canRescue: boolean,
) {
  const role = mailboxes?.find((mailbox) => mailbox.id === currentMailboxId)?.role;
  const isInSpam = isSpamMailboxRole(role);
  const hasSpamMailbox = Boolean(findSpamMailbox(mailboxes ?? []));
  return {
    moveTargets: (mailboxes ?? []).filter(
      (mailbox) =>
        mailbox.id !== currentMailboxId &&
        !MOVE_EXCLUDED_ROLES.has(mailbox.role?.toLowerCase() ?? ""),
    ),
    canReportSpam: canReport && !isInSpam && !isTrashMailboxRole(role) && hasSpamMailbox,
    canNotSpam: canRescue && isInSpam,
  };
}

/** The bar acts on the checked conversations, else on the one open in the reader, else it is hidden. */
function resolveBarTarget(
  threadRows: MessageListThreadRow[],
  selectedMessageId: string | null,
  checkedIds: string[],
  primaryIds: Set<string>,
): MessageListBarTarget | null {
  if (checkedIds.length > 0) return { kind: "selection", messageIds: checkedIds };
  const openRow = selectedMessageId
    ? threadRows.find((row) => row.messageIds.includes(selectedMessageId))
    : undefined;
  if (!openRow) return null;
  return {
    kind: "open",
    messageIds: openRow.messageIds,
    subject: openRow.latestMessage.subject || "(No subject)",
    isRead: openRow.messages.every(
      (entry) => !primaryIds.has(entry.id) || entry.keywords?.["$seen"],
    ),
  };
}

/** Opens a thread in place, showing messages held from an earlier visit at once while they refresh. */
function expandThread(
  threadId: string,
  state: MessageListState,
  dispatch: (action: MessageListAction) => void,
  onExpandThread: MessageListProps["onExpandThread"],
  cachedThreadMessages: MessageListProps["cachedThreadMessages"],
) {
  const isExpanded = state.expandedThreads.has(threadId);
  dispatch({ type: "toggleThread", threadId });
  if (isExpanded || !onExpandThread || state.expandedThreadMessages[threadId]) return;
  const held = cachedThreadMessages?.(threadId);
  if (held?.length) {
    dispatch({ type: "setThreadMessages", threadId, messages: held });
  } else {
    dispatch({ type: "setThreadLoading", threadId, loading: true });
  }
  void Promise.resolve(onExpandThread(threadId))
    .then((threadMessages) => {
      if (threadMessages && threadMessages.length > 0) {
        dispatch({ type: "setThreadMessages", threadId, messages: threadMessages });
      }
    })
    .catch(() => {
      // Non-critical
    })
    .finally(() => {
      dispatch({ type: "setThreadLoading", threadId, loading: false });
    });
}

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
  /** First day of the account's week, for the "Earlier this week" heading. */
  weekStartsOn?: number;
  scheduledSendAtById?: ReadonlyMap<string, string>;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  density?: "compact" | "comfortable";
  showLabelChips?: boolean;
  threadExpandEnabled?: boolean;
  onExpandThread?: (threadId: string) => Promise<JmapEmailMessage[]> | void;
  /** Messages of a thread expanded before, shown at once while `onExpandThread` refreshes them. */
  cachedThreadMessages?: (threadId: string) => JmapEmailMessage[] | undefined;
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
  weekStartsOn = 1,
  scheduledSendAtById,
  onLoadMore,
  hasMore,
  isLoadingMore,
  density = "compact",
  showLabelChips = true,
  threadExpandEnabled = true,
  onExpandThread,
  cachedThreadMessages,
  preserveMessageOrder = false,
  narrow = false,
}: MessageListProps) {
  const [state, dispatch] = useReducer(
    messageListReducer,
    initialMessageListState,
  );
  const barRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  // Day headings are counted from when this mailbox opened; switching mailboxes remounts the list.
  const [openedAt] = useState(() => new Date());

  const { moveTargets, canReportSpam, canNotSpam } = resolveMailboxActions(
    mailboxes,
    currentMailboxId,
    Boolean(onReportSpam),
    Boolean(onNotSpam),
  );

  const threadRows = buildMessageListThreadRows(
    messages,
    relatedMessages,
    preserveMessageOrder,
  );
  // Search results keep relevance order, so only date-ordered lists sit under day headings.
  const items = buildMessageListItems(
    threadRows,
    preserveMessageOrder
      ? null
      : (row) => mailListDayLabel(row.latestMessage.receivedAt, openedAt, timezone, weekStartsOn),
  );
  const visibleIds = new Set(threadRows.flatMap((row) => row.messageIds));
  // Filters, labels and search hide rows without clearing selection; bulk actions must only hit shown messages.
  const bulkIds = Array.from(state.selectedIds).filter((id) => visibleIds.has(id));
  const selectedIds = new Set(bulkIds);
  const hasBulkSelection = bulkIds.length > 0;
  const primaryIds = new Set(messages.map((message) => message.id));
  const barTarget = resolveBarTarget(threadRows, selectedMessageId, bulkIds, primaryIds);
  const barShown = barTarget !== null;

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar || !barShown) return;
    const enter = slideFadeIn(bar, { y: 8 }, {
      duration: 220,
      easing: MOTION_EASING.soft,
    });
    return () => enter?.cancel();
  }, [barShown]);


  const handleToggleSelect = (event: React.MouseEvent, ids: string[]) => {
    event.stopPropagation();
    dispatch({ type: "toggleSelect", ids });
  };

  const handleToggleThreadExpand = (threadId: string) =>
    expandThread(threadId, state, dispatch, onExpandThread, cachedThreadMessages);

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
    scheduledSendAtById,
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
    <div className="@container/list relative flex min-h-0 flex-1 flex-col">
      <MessageListVirtualized
        items={items}
        primaryIds={primaryIds}
        interaction={interaction}
        presentation={presentation}
        pagination={{ hasMore, isLoadingMore, onLoadMore }}
        selectionActive={hasBulkSelection}
        reserveBarSpace={barShown}
      />
      {barTarget ? (
        <MessageListBulkBar
          barRef={barRef}
          target={barTarget}
          allMessageIds={messages.map((message) => message.id)}
          moveTargets={moveTargets}
          canReportSpam={canReportSpam}
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
          onMarkAsRead={onMarkAsRead}
          onMarkAsUnread={onMarkAsUnread}
          onDelete={onDelete}
          onReportSpam={onReportSpam}
          onMove={onMove}
        />
      ) : null}
    </div>
  );
}
