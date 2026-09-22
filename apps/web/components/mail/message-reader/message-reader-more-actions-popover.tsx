"use client";

import { EllipsisVertical } from "lucide-react";
import { Button } from "@workspace/ui/components/ui/button";
import {
  Dropdown,
  DropdownDivider,
  DropdownItem,
  DropdownSubmenu,
  Icon,
} from "@workspace/ui/solace";
import { getMailboxDisplayName } from "@/lib/mail/mail-mailbox-roles";
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
    isFlagged,
    props,
  } = controller;
  const {
    onForward,
    onToggleFlagged,
    onMarkAsUnread,
    onUntrash,
    onReportSpam,
    onMove,
    onSetLabel,
    onCreateLabel,
    labels,
  } = props;
  const {
    isInTrash,
    isInSpam,
    canReportSpam,
    otherMailboxes,
    displayHtml,
  } = view;

  const close = () =>
    dispatchChrome({ type: "patch", patch: { morePopoverOpen: false } });

  return (
    <Dropdown
      open={morePopoverOpen}
      onOpenChange={(open) =>
        dispatchChrome({ type: "patch", patch: { morePopoverOpen: open } })
      }
      width={220}
      trigger={
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="More actions"
          title="More actions"
          disabled={isBusy}
        >
          <EllipsisVertical />
        </Button>
      }
    >
      <DropdownItem
        icon={Icon.Forward}
        label="Forward"
        disabled={isBusy}
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
      <DropdownDivider />
      {otherMailboxes.length > 0 ? (
        <DropdownSubmenu
          icon={Icon.MoveMailbox}
          label="Move to"
          disabled={isBusy}
          width={200}
        >
          {otherMailboxes.map((mailbox) => (
            <DropdownItem
              key={mailbox.id}
              label={getMailboxDisplayName(mailbox)}
              onSelect={() => onMove(mailbox.id)}
            />
          ))}
        </DropdownSubmenu>
      ) : null}
      {(onSetLabel && labels.length > 0) || onCreateLabel ? (
        <DropdownItem
          icon={Icon.Tag}
          label="Labels"
          onSelect={() => {
            close();
            setTimeout(
              () =>
                dispatchChrome({
                  type: "patch",
                  patch: { labelPopoverOpen: true },
                }),
              80,
            );
          }}
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
