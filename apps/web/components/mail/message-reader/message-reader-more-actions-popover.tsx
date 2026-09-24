"use client";

import {
  Dropdown,
  DropdownDivider,
  DropdownItem,
  Icon,
  IconButton,
  Size,
  Type,
} from "@workspace/ui/solace";
import type {
  MessageReaderController,
  MessageReaderViewModel,
} from "../use-message-reader-controller";

export function MessageReaderMoreActionsPopover({
  controller,
  view,
}: {
  controller: MessageReaderController;
  view: MessageReaderViewModel;
}) {
  const {
    morePopoverOpen,
    dispatchChrome,
    isBusy,
    canReply,
    isFlagged,
    props,
  } = controller;
  const {
    onForward,
    onToggleFlagged,
    onMarkAsUnread,
    onUntrash,
    onReportSpam,
  } = props;
  const { isInTrash, isInSpam, canReportSpam, displayHtml } = view;

  return (
    <Dropdown
      open={morePopoverOpen}
      onOpenChange={(open) =>
        dispatchChrome({ type: "patch", patch: { morePopoverOpen: open } })
      }
      width={220}
      trigger={
        <IconButton
          active={morePopoverOpen}
          disabled={isBusy}
          icon={Icon.OverflowH}
          size={Size.SMALL}
          tooltip="More actions"
          type={Type.SECONDARY}
        />
      }
    >
      <DropdownItem
        icon={Icon.Forward}
        label="Forward"
        disabled={!canReply}
        onSelect={onForward}
      />
      {onToggleFlagged ? (
        <DropdownItem
          icon={Icon.Star}
          label={isFlagged ? "Unstar" : "Star"}
          disabled={isBusy}
          onSelect={onToggleFlagged}
        />
      ) : null}
      <DropdownItem
        icon={Icon.EnvelopeUnread}
        label="Mark as unread"
        disabled={isBusy}
        onSelect={onMarkAsUnread}
      />
      {(isInTrash || isInSpam) && onUntrash ? (
        <DropdownItem
          icon={Icon.Inbox}
          label={isInTrash ? "Restore to inbox" : "Not spam"}
          onSelect={onUntrash}
        />
      ) : null}
      {canReportSpam ? (
        <DropdownItem
          icon={Icon.Spam}
          label="Report spam"
          disabled={isBusy}
          onSelect={() => onReportSpam?.()}
        />
      ) : null}
      {displayHtml ? (
        <>
          <DropdownDivider />
          <DropdownItem
            icon={Icon.Edit}
            label="View HTML source"
            onSelect={() =>
              dispatchChrome({
                type: "patch",
                patch: { morePopoverOpen: false, showRawHtmlDialog: true },
              })
            }
          />
        </>
      ) : null}
    </Dropdown>
  );
}
