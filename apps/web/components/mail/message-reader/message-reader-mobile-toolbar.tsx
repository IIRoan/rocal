"use client";

import {
  EllipsisVertical,
  Inbox,
  OctagonAlert,
  Trash2,
  X,
} from "lucide-react";
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

export function MessageReaderMobileToolbar({
  controller,
  view,
}: {
  controller: MessageReaderController;
  view: MessageReaderViewModel;
}) {
  const { dispatchChrome, isBusy, props } = controller;
  const { onClose, onReportSpam, onNotSpam, onDelete } = props;
  const { message, isInTrash, canReportSpam, canNotSpam } = view;

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border/40 px-3">
      {onClose && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close message"
          onClick={onClose}
        >
          <X />
        </Button>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium leading-none">
          {message.subject || "(No subject)"}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
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
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="More actions"
              title="More actions"
              disabled={isBusy}
              onClick={() =>
                dispatchChrome({ type: "patch", patch: { moreActionsOpen: true } })
              }
            >
              <EllipsisVertical />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="z-[200]">
            More actions
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
