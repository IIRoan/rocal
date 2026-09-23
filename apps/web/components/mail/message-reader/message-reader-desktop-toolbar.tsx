"use client";

import { Separator } from "@workspace/ui/components/ui/separator";
import {
  Dropdown,
  DropdownItem,
  DropdownPanel,
  DropdownSection,
  FilledVariant,
  Icon,
  IconButton,
  Size,
  Type,
  WarmTooltipGroup,
} from "@workspace/ui/solace";
import { getMailboxDisplayName } from "@/lib/mail/mail-mailbox-roles";
import { LabelPickerPanel } from "../label-picker-panel";
import type {
  MessageReaderController,
  MessageReaderViewModel,
} from "../use-message-reader-controller";
import { MessageReaderMoreActionsPopover } from "./message-reader-more-actions-popover";

export function MessageReaderDesktopToolbar({
  controller,
  view,
}: {
  controller: MessageReaderController;
  view: MessageReaderViewModel;
}) {
  const { hasPrev, hasNext, isBusy, labelPopoverOpen, dispatchChrome, message, props } =
    controller;
  const {
    onClose,
    onNavigatePrev,
    onNavigateNext,
    onArchive,
    onReportSpam,
    onNotSpam,
    onReply,
    onDelete,
    onMove,
    onSetLabel,
    onCreateLabel,
    onUpdateLabel,
    onDeleteLabel,
    labels,
  } = props;
  const { isInTrash, isInSpam, canReportSpam, canNotSpam, otherMailboxes } = view;
  const canLabel = Boolean((onSetLabel && labels.length > 0) || onCreateLabel);

  return (
    <WarmTooltipGroup lean={8}>
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--border-tertiary)] px-4">
      <div className="flex items-center gap-0.5">
        {onClose ? (
          <IconButton
            icon={Icon.Close}
            onClick={onClose}
            size={Size.SMALL}
            tooltip="Close message"
            type={Type.TERTIARY}
            variant={FilledVariant.UNFILLED}
          />
        ) : null}
        <Separator orientation="vertical" className="mx-1 h-4" />
        <IconButton
          disabled={!hasPrev}
          icon={Icon.ChevronLeft}
          onClick={onNavigatePrev}
          size={Size.SMALL}
          tooltip="Previous message"
          type={Type.TERTIARY}
          variant={FilledVariant.UNFILLED}
        />
        <IconButton
          disabled={!hasNext}
          icon={Icon.ChevronRight}
          onClick={onNavigateNext}
          size={Size.SMALL}
          tooltip="Next message"
          type={Type.TERTIARY}
          variant={FilledVariant.UNFILLED}
        />
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        {canLabel ? (
          <DropdownPanel
            open={labelPopoverOpen}
            onOpenChange={(open) =>
              dispatchChrome({ type: "patch", patch: { labelPopoverOpen: open } })
            }
            width={240}
            trigger={
              <IconButton
                active={labelPopoverOpen}
                disabled={isBusy}
                icon={Icon.Tag}
                size={Size.SMALL}
                tooltip="Labels"
                type={Type.SECONDARY}
              />
            }
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
        {otherMailboxes.length > 0 ? (
          <Dropdown
            width={208}
            trigger={
              <IconButton
                disabled={isBusy}
                icon={Icon.MoveMailbox}
                size={Size.SMALL}
                tooltip="Move to"
                type={Type.SECONDARY}
              />
            }
          >
            <DropdownSection label="Move to">
              {otherMailboxes.map((mailbox) => (
                <DropdownItem
                  key={mailbox.id}
                  label={getMailboxDisplayName(mailbox)}
                  onSelect={() => onMove(mailbox.id)}
                />
              ))}
            </DropdownSection>
          </Dropdown>
        ) : null}
        {onArchive && !isInSpam && !isInTrash ? (
          <IconButton
            disabled={isBusy}
            icon={Icon.Archive}
            onClick={onArchive}
            size={Size.SMALL}
            tooltip="Archive"
            type={Type.SECONDARY}
          />
        ) : null}
        {canReportSpam ? (
          <IconButton
            disabled={isBusy}
            icon={Icon.Spam}
            onClick={onReportSpam}
            size={Size.SMALL}
            tooltip="Report spam"
            type={Type.SECONDARY}
          />
        ) : null}
        {canNotSpam ? (
          <IconButton
            disabled={isBusy}
            icon={Icon.Inbox}
            onClick={onNotSpam}
            size={Size.SMALL}
            tooltip="Not spam"
            type={Type.SECONDARY}
          />
        ) : null}
        <IconButton
          disabled={isBusy}
          icon={Icon.Reply}
          onClick={onReply}
          size={Size.SMALL}
          tooltip="Reply"
          type={Type.SECONDARY}
        />
        <MessageReaderMoreActionsPopover controller={controller} view={view} />
        <IconButton
          disabled={isBusy}
          icon={Icon.Trash}
          iconColor="destructive"
          onClick={onDelete}
          size={Size.SMALL}
          tooltip={isInTrash ? "Delete permanently" : "Move to trash"}
          type={Type.SECONDARY}
        />
      </div>
    </div>
    </WarmTooltipGroup>
  );
}
