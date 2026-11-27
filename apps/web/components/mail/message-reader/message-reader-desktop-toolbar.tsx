"use client";

import { Separator } from "@workspace/ui/components/ui/separator";
import {
  FilledVariant,
  Icon,
  Type,
  WarmTooltipGroup,
} from "@workspace/ui/solace";
import type {
  MessageReaderController,
  MessageReaderViewModel,
} from "../use-message-reader-controller";
import { ReaderActionButton, ReaderActionIcon } from "./message-reader-action-button";
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
            <ReaderActionIcon
              icon={Icon.Close}
              onClick={onClose}
              tooltip="Close message"
              tone={Type.TERTIARY}
              variant={FilledVariant.UNFILLED}
            />
          ) : null}
          <Separator orientation="vertical" className="mx-1 h-4" />
          <ReaderActionIcon
            disabled={!hasPrev}
            icon={Icon.ChevronLeft}
            onClick={onNavigatePrev}
            tooltip="Previous message"
            tone={Type.TERTIARY}
            variant={FilledVariant.UNFILLED}
          />
          <ReaderActionIcon
            disabled={!hasNext}
            icon={Icon.ChevronRight}
            onClick={onNavigateNext}
            tooltip="Next message"
            tone={Type.TERTIARY}
            variant={FilledVariant.UNFILLED}
          />
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <ReaderActionButton
            disabled={!canReply}
            icon={Icon.Reply}
            onClick={onReply}
          >
            Reply
          </ReaderActionButton>
          {onArchive && !isInSpam && !isInTrash ? (
            <ReaderActionIcon
              disabled={isBusy}
              icon={Icon.Archive}
              onClick={onArchive}
              tooltip="Archive"
            />
          ) : null}
          <ReaderActionIcon
            disabled={isBusy}
            icon={Icon.Trash}
            iconColor="destructive"
            onClick={onDelete}
            tooltip={isInTrash ? "Delete permanently" : "Move to trash"}
          />
          <MessageReaderMoreActionsPopover controller={controller} view={view} />
        </div>
      </div>
    </WarmTooltipGroup>
  );
}
