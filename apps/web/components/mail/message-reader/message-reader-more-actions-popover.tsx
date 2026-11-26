"use client";

import { useRef } from "react";
import { afterPaint, resolveLabelDisplayColor } from "@workspace/calendar-core";
import {
  Dropdown,
  DropdownDivider,
  DropdownItem,
  DropdownPanel,
  DropdownSubmenu,
  Icon,
  IconButton,
  Size,
  Type,
} from "@workspace/ui/solace";
import { getMailboxDisplayName } from "@/lib/mail/mail-mailbox-roles";
import { LabelPickerPanel } from "../label-picker-panel";
import type {
  MessageReaderController,
  MessageReaderViewModel,
} from "../use-message-reader-controller";

function Shortcut({ keys }: { keys: string }) {
  return <kbd className="font-sans text-xs text-[var(--text-tertiary)]">{keys}</kbd>;
}

/** Every reader action that is not on the toolbar: reply all, forward, labels, moving, marking, spam and the view options. */
export function MessageReaderMoreActionsPopover({
  controller,
  view,
}: {
  controller: MessageReaderController;
  view: MessageReaderViewModel;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const {
    morePopoverOpen,
    labelPopoverOpen,
    dispatchChrome,
    isBusy,
    canReply,
    isFlagged,
    canShowOriginalLook,
    showOriginalLook,
    toggleOriginalLook,
    message,
    props,
  } = controller;
  const {
    onReplyAll,
    onForward,
    onToggleFlagged,
    onMarkAsUnread,
    onUntrash,
    onReportSpam,
    onNotSpam,
    onMove,
    onSetLabel,
    onCreateLabel,
    onUpdateLabel,
    onDeleteLabel,
    labels,
  } = props;
  const { isInTrash, isInSpam, canReportSpam, canNotSpam, otherMailboxes, displayHtml } = view;
  const canLabel = Boolean((onSetLabel && labels.length > 0) || onCreateLabel);

  // The label editor opens once the menu has closed, so the menu's focus return does not land on top of it.
  const openLabelEditor = () =>
    afterPaint(() => dispatchChrome({ type: "patch", patch: { labelPopoverOpen: true } }));

  return (
    <span ref={anchorRef} className="relative inline-flex">
      <Dropdown
        open={morePopoverOpen}
        onOpenChange={(open) =>
          dispatchChrome({ type: "patch", patch: { morePopoverOpen: open } })
        }
        width={240}
        trigger={
          <IconButton
            active={morePopoverOpen || labelPopoverOpen}
            disabled={isBusy}
            icon={Icon.OverflowH}
            size={Size.SMALL}
            tooltip="More actions"
            type={Type.SECONDARY}
          />
        }
      >
        {onReplyAll ? (
          <DropdownItem
            icon={Icon.ReplyAll}
            label="Reply all"
            disabled={!canReply}
            onSelect={onReplyAll}
            endElement={<Shortcut keys="⇧R" />}
          />
        ) : null}
        <DropdownItem
          icon={Icon.Forward}
          label="Forward"
          disabled={!canReply}
          onSelect={onForward}
          endElement={<Shortcut keys="F" />}
        />
        <DropdownDivider />
        {canLabel ? (
          <DropdownSubmenu label="Label as" icon={Icon.Tag} disabled={isBusy} width={220}>
            {onSetLabel
              ? labels.map((label) => {
                  const assigned = message?.keywords?.[`label:${label.id}`] === true;
                  return (
                    <DropdownItem
                      key={label.id}
                      label={label.name}
                      active={assigned}
                      startElement={
                        <span
                          aria-hidden
                          className="mx-1 size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: resolveLabelDisplayColor(label.color) }}
                        />
                      }
                      onSelect={() => onSetLabel(label.id, !assigned)}
                    />
                  );
                })
              : null}
            {onSetLabel && labels.length > 0 ? <DropdownDivider /> : null}
            <DropdownItem icon={Icon.Edit} label="Edit labels…" onSelect={openLabelEditor} />
          </DropdownSubmenu>
        ) : null}
        {otherMailboxes.length > 0 ? (
          <DropdownSubmenu label="Move to" icon={Icon.MoveMailbox} disabled={isBusy} width={208}>
            {otherMailboxes.map((mailbox) => (
              <DropdownItem
                key={mailbox.id}
                label={getMailboxDisplayName(mailbox)}
                onSelect={() => onMove(mailbox.id)}
              />
            ))}
          </DropdownSubmenu>
        ) : null}
        <DropdownItem
          icon={Icon.EnvelopeUnread}
          label="Mark as unread"
          disabled={isBusy}
          onSelect={onMarkAsUnread}
          endElement={<Shortcut keys="U" />}
        />
        {onToggleFlagged ? (
          <DropdownItem
            icon={Icon.Star}
            label={isFlagged ? "Unstar" : "Star"}
            disabled={isBusy}
            onSelect={onToggleFlagged}
            endElement={<Shortcut keys="S" />}
          />
        ) : null}
        {canNotSpam ? (
          <DropdownItem icon={Icon.Inbox} label="Not spam" disabled={isBusy} onSelect={() => onNotSpam?.()} />
        ) : (isInTrash || isInSpam) && onUntrash ? (
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
            {canShowOriginalLook ? (
              <DropdownItem
                icon={showOriginalLook ? Icon.Moon : Icon.Sun}
                label={showOriginalLook ? "Show in dark mode" : "Show original"}
                onSelect={() => {
                  toggleOriginalLook();
                  dispatchChrome({ type: "patch", patch: { morePopoverOpen: false } });
                }}
              />
            ) : null}
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
      {canLabel ? (
        <DropdownPanel
          open={labelPopoverOpen}
          onOpenChange={(open) =>
            dispatchChrome({ type: "patch", patch: { labelPopoverOpen: open } })
          }
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            anchorRef.current?.querySelector("button")?.focus();
          }}
          width={240}
          trigger={<span aria-hidden className="pointer-events-none absolute inset-0" />}
        >
          <LabelPickerPanel
            labels={labels}
            messageKeywords={message?.keywords}
            onToggleLabel={
              onSetLabel
                ? (labelId, assigned) => onSetLabel(labelId, assigned)
                : undefined
            }
            onCreateLabel={onCreateLabel}
            onUpdateLabel={onUpdateLabel}
            onDeleteLabel={onDeleteLabel}
          />
        </DropdownPanel>
      ) : null}
    </span>
  );
}
