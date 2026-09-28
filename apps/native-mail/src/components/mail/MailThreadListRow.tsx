import React, { useCallback, useMemo } from "react";
import type { ListDensity, TimeFormat } from "@workspace/calendar-core";
import {
  sameItems,
  sameMailConversation,
  type MailConversation,
} from "../../lib/mail/conversation-thread";
import type {
  JmapEmailMessage,
  JmapIdentity,
  LabelDef,
} from "../../lib/mail/types";
import { MailMessageRow } from "./MailMessageRow";
import { MailSwipeRow } from "./MailSwipeRow";

export interface MailThreadRowHandlers {
  onOpen: (message: JmapEmailMessage) => void;
  onToggleSelect: (message: JmapEmailMessage, selectableIds: string[]) => void;
  onToggleRead: (ids: string[], read: boolean) => void;
  onTrash?: (ids: string[]) => void | Promise<unknown>;
}

interface MailThreadListRowProps {
  row: MailConversation;
  /** Row ids that belong to the open mailbox (companion-folder replies excluded). */
  selectableIds: string[];
  unreadCount: number;
  hasAttachments: boolean;
  selected: boolean;
  selectionActive: boolean;
  preview?: string;
  showRecipient: boolean;
  labels: LabelDef[];
  identities: JmapIdentity[];
  timeFormat: TimeFormat;
  timezone?: string;
  density: ListDensity;
  showLabelChips: boolean;
  threadExpandable: boolean;
  handlers: MailThreadRowHandlers;
}

function MailThreadListRowComponent({
  row,
  selectableIds,
  unreadCount,
  hasAttachments,
  selected,
  selectionActive,
  preview,
  showRecipient,
  labels,
  identities,
  timeFormat,
  timezone,
  density,
  showLabelChips,
  threadExpandable,
  handlers,
}: MailThreadListRowProps) {
  const { onOpen, onToggleSelect, onToggleRead, onTrash } = handlers;
  const read = unreadCount === 0;
  const latestId = row.latestMessage.id;
  const swipeIds = useMemo(
    () => (selectableIds.length > 0 ? selectableIds : [latestId]),
    [latestId, selectableIds],
  );

  const handleToggleRead = useCallback(
    () => onToggleRead(swipeIds, read),
    [onToggleRead, read, swipeIds],
  );
  const handleTrash = useCallback(() => onTrash?.(swipeIds), [onTrash, swipeIds]);
  const handleToggleSelect = useCallback(
    (message: JmapEmailMessage) => onToggleSelect(message, selectableIds),
    [onToggleSelect, selectableIds],
  );

  return (
    <MailSwipeRow
      enabled={!selectionActive}
      read={read}
      onToggleRead={handleToggleRead}
      onTrash={onTrash ? handleTrash : undefined}
    >
      <MailMessageRow
        message={row.latestMessage}
        threadMessages={row.messages}
        threadCount={row.messages.length}
        threadUnreadCount={unreadCount}
        hasAttachments={hasAttachments}
        showRecipient={showRecipient}
        labels={labels}
        identities={identities}
        preview={preview}
        selectionActive={selectionActive}
        selected={selected}
        timeFormat={timeFormat}
        timezone={timezone}
        density={density}
        showLabelChips={showLabelChips}
        threadExpandable={threadExpandable}
        onPress={onOpen}
        onLongPress={handleToggleSelect}
        onToggleSelect={handleToggleSelect}
      />
    </MailSwipeRow>
  );
}

function sameRowProps(
  prev: MailThreadListRowProps,
  next: MailThreadListRowProps,
): boolean {
  for (const key of Object.keys(next) as (keyof MailThreadListRowProps)[]) {
    if (key === "row") {
      if (!sameMailConversation(prev.row, next.row)) return false;
    } else if (key === "selectableIds") {
      if (!sameItems(prev.selectableIds, next.selectableIds)) return false;
    } else if (!Object.is(prev[key], next[key])) {
      return false;
    }
  }
  return true;
}

export const MailThreadListRow = React.memo(
  MailThreadListRowComponent,
  sameRowProps,
);
