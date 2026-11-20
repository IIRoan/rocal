import React from "react";
import type {
  ListDensity,
  MailSwipeAction,
  TimeFormat,
} from "@workspace/calendar-core";
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
import {
  resolveMailSwipeAccessibilityActions,
  resolveMailSwipeSpec,
  type MailSwipeHandlers,
} from "../../lib/mail/mail-swipe-actions";
import { MailMessageRow } from "./MailMessageRow";
import { MailSwipeRow } from "./MailSwipeRow";

export interface MailThreadRowHandlers extends MailSwipeHandlers {
  onOpen: (message: JmapEmailMessage) => void;
  onToggleSelect: (message: JmapEmailMessage, selectableIds: string[]) => void;
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
  scheduledSendAt?: string;
  density: ListDensity;
  showLabelChips: boolean;
  threadExpandable: boolean;
  swipeRight: MailSwipeAction;
  swipeLeft: MailSwipeAction;
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
  scheduledSendAt,
  density,
  showLabelChips,
  threadExpandable,
  swipeRight,
  swipeLeft,
  handlers,
}: MailThreadListRowProps) {
  const { onOpen, onToggleSelect } = handlers;
  const latestId = row.latestMessage.id;
  const swipeRow = {
    ids: selectableIds.length > 0 ? selectableIds : [latestId],
    latestId,
    read: unreadCount === 0,
    flagged: Boolean(row.latestMessage.keywords?.["$flagged"]),
  };

  const handleToggleSelect = (message: JmapEmailMessage) => onToggleSelect(message, selectableIds);

  return (
    <MailSwipeRow
      enabled={!selectionActive}
      right={resolveMailSwipeSpec(swipeRight, swipeRow, handlers)}
      left={resolveMailSwipeSpec(swipeLeft, swipeRow, handlers)}
      accessibilityActions={resolveMailSwipeAccessibilityActions(
        swipeRight,
        swipeLeft,
        swipeRow,
        handlers,
      )}
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
        scheduledSendAt={scheduledSendAt}
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
