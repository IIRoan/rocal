"use client";

import { Separator } from "@workspace/ui/components/ui/separator";
import {
  FilledVariant,
  Icon,
  IconButton,
  Size,
  Type,
  WarmTooltipGroup,
} from "@workspace/ui/solace";
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
  const { hasPrev, hasNext, isBusy, props } = controller;
  const {
    onClose,
    onNavigatePrev,
    onNavigateNext,
    onArchive,
    onReportSpam,
    onNotSpam,
    onReply,
    onDelete,
  } = props;
  const { isInTrash, isInSpam, canReportSpam, canNotSpam } = view;

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

      <div className="ml-auto flex items-center gap-1">
        {onArchive && !isInSpam && !isInTrash ? (
          <IconButton
            disabled={isBusy}
            icon={Icon.Archive}
            onClick={onArchive}
            size={Size.SMALL}
            tooltip="Archive"
            type={Type.TERTIARY}
            variant={FilledVariant.UNFILLED}
          />
        ) : null}
        {canReportSpam ? (
          <IconButton
            disabled={isBusy}
            icon={Icon.Spam}
            onClick={onReportSpam}
            size={Size.SMALL}
            tooltip="Report spam"
            type={Type.TERTIARY}
            variant={FilledVariant.UNFILLED}
          />
        ) : null}
        {canNotSpam ? (
          <IconButton
            disabled={isBusy}
            icon={Icon.Inbox}
            onClick={onNotSpam}
            size={Size.SMALL}
            tooltip="Not spam"
            type={Type.TERTIARY}
            variant={FilledVariant.UNFILLED}
          />
        ) : null}
        <IconButton
          disabled={isBusy}
          icon={Icon.Reply}
          onClick={onReply}
          size={Size.SMALL}
          tooltip="Reply"
          type={Type.TERTIARY}
          variant={FilledVariant.UNFILLED}
        />
        <IconButton
          disabled={isBusy}
          icon={Icon.Trash}
          onClick={onDelete}
          size={Size.SMALL}
          tooltip={isInTrash ? "Delete permanently" : "Move to trash"}
          type={Type.DESTRUCTIVE}
          variant={FilledVariant.UNFILLED}
        />
        <MessageReaderMoreActionsPopover controller={controller} view={view} />
      </div>
    </div>
    </WarmTooltipGroup>
  );
}
