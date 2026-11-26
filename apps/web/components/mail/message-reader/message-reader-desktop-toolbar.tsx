"use client";

import { Separator } from "@workspace/ui/components/ui/separator";
import {
  Button,
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

/** Close and previous/next on the left; Reply, Archive and Delete beside one More menu that holds everything else. */
export function MessageReaderDesktopToolbar({
  controller,
  view,
}: {
  controller: MessageReaderController;
  view: MessageReaderViewModel;
}) {
  const { hasPrev, hasNext, isBusy, canReply, props } = controller;
  const { onClose, onNavigatePrev, onNavigateNext, onArchive, onReply, onDelete } = props;
  const { isInTrash, isInSpam } = view;

  return (
    <WarmTooltipGroup lean={8}>
    <div className="box-content flex h-12 shrink-0 items-center gap-2 border-b border-[var(--border-tertiary)] px-4">
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
        <Button
          disabled={!canReply}
          icon={Icon.Reply}
          onClick={onReply}
          size={Size.SMALL}
          type={Type.SECONDARY}
          className="h-8 rounded-lg px-3"
        >
          Reply
        </Button>
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
        <IconButton
          disabled={isBusy}
          icon={Icon.Trash}
          iconColor="destructive"
          onClick={onDelete}
          size={Size.SMALL}
          tooltip={isInTrash ? "Delete permanently" : "Move to trash"}
          type={Type.SECONDARY}
        />
        <MessageReaderMoreActionsPopover controller={controller} view={view} />
      </div>
    </div>
    </WarmTooltipGroup>
  );
}
