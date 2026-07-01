"use client";

import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Inbox,
  OctagonAlert,
  Reply,
  Trash2,
  X,
} from "lucide-react";
import { Separator } from "@workspace/ui/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/ui/tooltip";
import { Button } from "@workspace/ui/components/ui/button";
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
<div className="shrink-0 flex items-center gap-0.5 px-3 h-12 border-b border-border/40">
      {/* Left: close + separator + prev/next */}
      <div className="flex items-center gap-0.5">
        {onClose && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Close message"
                onClick={onClose}
              >
                <X />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Close message</TooltipContent>
          </Tooltip>
        )}
        <Separator orientation="vertical" className="h-4 mx-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Previous message"
              disabled={!hasPrev}
              onClick={onNavigatePrev}
            >
              <ChevronLeft />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Previous message</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Next message"
              disabled={!hasNext}
              onClick={onNavigateNext}
            >
              <ChevronRight />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Next message</TooltipContent>
        </Tooltip>
      </div>

      {/* Right: archive, reply, delete */}
      <div className="ml-auto flex items-center gap-0">
        {onArchive && !isInSpam && !isInTrash && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Archive message"
                disabled={isBusy}
                onClick={onArchive}
              >
                <Archive />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="z-[200]">Archive</TooltipContent>
          </Tooltip>
        )}
        {canReportSpam && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Report spam"
                title="Report spam"
                disabled={isBusy}
                onClick={onReportSpam}
              >
                <OctagonAlert className="text-muted-foreground" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="z-[200]">
              Report spam
            </TooltipContent>
          </Tooltip>
        )}
        {canNotSpam && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Not spam"
                title="Not spam"
                disabled={isBusy}
                onClick={onNotSpam}
              >
                <Inbox />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="z-[200]">
              Not spam
            </TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Reply"
              title="Reply"
              disabled={isBusy}
              onClick={onReply}
            >
              <Reply />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="z-[200]">Reply</TooltipContent>
        </Tooltip>

        {/* Delete — direct button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={isInTrash ? "Delete permanently" : "Move to trash"}
              title={isInTrash ? "Delete permanently" : "Move to trash"}
              disabled={isBusy}
              onClick={onDelete}
            >
              <Trash2 className="text-destructive" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="z-[200]">
            {isInTrash ? "Delete permanently" : "Move to trash"}
          </TooltipContent>
        </Tooltip>
        {/* More actions panel */}
        <MessageReaderMoreActionsPopover controller={controller} view={view} />
      </div>
    </div>
  );
}
