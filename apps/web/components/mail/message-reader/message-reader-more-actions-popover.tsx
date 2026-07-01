"use client";

import {
  Check,
  ChevronDown,
  Code,
  FolderInput,
  Forward,
  Inbox,
  MailOpen,
  OctagonAlert,
  Star,
  Tag,
  EllipsisVertical,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/ui/tooltip";
import { Button } from "@workspace/ui/components/ui/button";
import { cn } from "@workspace/ui/lib/utils";
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
    moveToExpanded,
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

  return (
<Popover
          open={morePopoverOpen}
          onOpenChange={(open) => {
            dispatchChrome({
              type: "patch",
              patch: {
                morePopoverOpen: open,
                ...(open ? {} : { moveToExpanded: false }),
              },
            });
          }}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="More actions"
                  title="More actions"
                  disabled={isBusy}
                >
                  <EllipsisVertical />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="z-[200]">
              More actions
            </TooltipContent>
          </Tooltip>
          <PopoverContent
            align="end"
            sideOffset={6}
            className="w-52 p-0 overflow-hidden rounded-lg border border-border shadow-md"
          >
            {/* Quick-action icon strip */}
            <div className="flex border-b border-border/60">
              <button
                type="button"
                onClick={() => {
                  onForward();
                  dispatchChrome({ type: "patch", patch: { morePopoverOpen: false } });
                }}
                disabled={isBusy}
                className="flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-40"
              >
                <Forward className="size-3.5" strokeWidth={2.25} />
                Forward
              </button>
              <div className="w-px bg-border/60 self-stretch" />
              {onToggleFlagged && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onToggleFlagged();
                      dispatchChrome({ type: "patch", patch: { morePopoverOpen: false } });
                    }}
                    disabled={isBusy}
                    className="flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-40"
                  >
                    <Star
                      className={cn(
                        "size-3.5 transition-colors",
                        isFlagged ? "fill-amber-400 text-amber-400" : "",
                      )}
                      strokeWidth={2.25}
                    />
                    {isFlagged ? "Unstar" : "Star"}
                  </button>
                  <div className="w-px bg-border/60 self-stretch" />
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  onMarkAsUnread();
                  dispatchChrome({ type: "patch", patch: { morePopoverOpen: false } });
                }}
                disabled={isBusy}
                className="flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-40"
              >
                <MailOpen className="size-3.5" strokeWidth={2.25} />
                Unread
              </button>
            </div>

            {/* Restore — trash/spam only */}
            {(isInTrash || isInSpam) && onUntrash && (
              <button
                type="button"
                onClick={() => {
                  onUntrash();
                  dispatchChrome({ type: "patch", patch: { morePopoverOpen: false } });
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/8 transition-colors"
              >
                <Inbox className="size-3.5 shrink-0" />
                {isInTrash ? "Restore to inbox" : "Not spam"}
              </button>
            )}

            {canReportSpam && (
              <button
                type="button"
                onClick={() => {
                  onReportSpam?.();
                  dispatchChrome({ type: "patch", patch: { morePopoverOpen: false } });
                }}
                disabled={isBusy}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground/80 hover:bg-accent/50 transition-colors"
              >
                <OctagonAlert className="size-3.5 shrink-0 text-muted-foreground" />
                Report spam
              </button>
            )}

            {/* Move to */}
            {otherMailboxes.length > 0 && (
              <div
                className={
                  (isInTrash || isInSpam) && onUntrash
                    ? "border-t border-border/60"
                    : ""
                }
              >
                <button
                  type="button"
                  onClick={() =>
                    dispatchChrome({ type: "toggle", field: "moveToExpanded" })
                  }
                  disabled={isBusy}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground/80 hover:bg-accent/50 transition-colors"
                >
                  <FolderInput
                    className="size-3.5 shrink-0 text-muted-foreground"
                    strokeWidth={2}
                  />
                  Move to
                  <ChevronDown
                    className={cn(
                      "size-4 ml-auto text-muted-foreground transition-transform duration-200",
                      moveToExpanded ? "rotate-180" : "",
                    )}
                    strokeWidth={2.5}
                  />
                </button>
                {moveToExpanded && (
                  <div className="border-t border-border/40 bg-muted/30">
                    {otherMailboxes.map((mailbox, idx) => (
                      <div key={mailbox.id}>
                        {idx > 0 && <div className="mx-3 h-px bg-border/40" />}
                        <button
                          type="button"
                          onClick={() => {
                            onMove(mailbox.id);
                            dispatchChrome({
                              type: "patch",
                              patch: {
                                morePopoverOpen: false,
                                moveToExpanded: false,
                              },
                            });
                          }}
                          className="w-full flex items-center gap-2 px-4 py-2 text-[13px] text-foreground/75 hover:bg-accent/60 hover:text-foreground transition-colors text-left"
                        >
                          {getMailboxDisplayName(mailbox)}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Labels */}
            {((onSetLabel && labels.length > 0) || onCreateLabel) && (
              <div className={cn("border-t border-border/60")}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    dispatchChrome({
                      type: "patch",
                      patch: { morePopoverOpen: false },
                    });
                    setTimeout(
                      () =>
                        dispatchChrome({
                          type: "patch",
                          patch: { labelPopoverOpen: true },
                        }),
                      80,
                    );
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground/80 hover:bg-accent/50 transition-colors"
                >
                  <Tag
                    className="size-3.5 shrink-0 text-muted-foreground"
                    strokeWidth={2}
                  />
                  Labels
                </button>
              </div>
            )}

            {/* View HTML source */}
            {displayHtml && (
              <div className="border-t border-border/60">
                <button
                  type="button"
                  onClick={() => {
                    dispatchChrome({
                      type: "patch",
                      patch: {
                        morePopoverOpen: false,
                        showRawHtmlDialog: true,
                      },
                    });
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground/80 hover:bg-accent/50 transition-colors"
                >
                  <Code
                    className="size-3.5 shrink-0 text-muted-foreground"
                    strokeWidth={2}
                  />
                  View HTML source
                </button>
              </div>
            )}
          </PopoverContent>
        </Popover>
  );
}
