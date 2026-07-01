"use client";

import {
  Archive,
  ChevronLeft,
  ChevronRight,
  FolderInput,
  Forward,
  Inbox,
  MailOpen,
  OctagonAlert,
  Reply,
  Tag,
  Trash2,
} from "lucide-react";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@workspace/ui/components/ui/drawer";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/ui/popover";
import { LabelPickerPanel } from "../label-picker-panel";
import { getMailboxDisplayName } from "@/lib/mail/mail-mailbox-roles";
import type {
  MessageReaderController,
  MessageReaderViewModel,
} from "../use-message-reader-controller";

export function MessageReaderMobileActionsDrawer({
  controller,
  view,
}: {
  controller: MessageReaderController;
  view: MessageReaderViewModel;
}) {
  const {
    moreActionsOpen,
    labelPopoverOpen,
    dispatchChrome,
    isBusy,
    props,
  } = controller;
  const {
    onNavigatePrev,
    onNavigateNext,
    onReply,
    onForward,
    onArchive,
    onMarkAsUnread,
    onMove,
    onSetLabel,
    onCreateLabel,
    onUpdateLabel,
    onDeleteLabel,
    onReportSpam,
    onNotSpam,
    onDelete,
    labels,
  } = props;
  const { hasPrev, hasNext } = controller;
  const {
    otherMailboxes,
    canReportSpam,
    canNotSpam,
    isInTrash,
  } = view;
  const { message } = controller;

  const labelPopoverContent = (
    <PopoverContent
      side="top"
      align="start"
      sideOffset={6}
      className="w-56 p-0 overflow-hidden"
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
    </PopoverContent>
  );

  return (
    <Drawer
          open={moreActionsOpen}
          onOpenChange={(open) =>
            dispatchChrome({ type: "patch", patch: { moreActionsOpen: open } })
          }
        >
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Message actions</DrawerTitle>
            </DrawerHeader>
            <div className="flex flex-col gap-1 overflow-y-auto px-4 pb-6">
              {hasPrev && onNavigatePrev && (
                <button
                  type="button"
                  onClick={() => {
                    onNavigatePrev();
                    dispatchChrome({ type: "patch", patch: { moreActionsOpen: false } });
                  }}
                  disabled={isBusy}
                  className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-foreground/80 transition-colors hover:bg-accent/40 active:bg-accent/60 disabled:opacity-40"
                >
                  <ChevronLeft className="size-4 text-muted-foreground" />
                  Previous message
                </button>
              )}
              {hasNext && onNavigateNext && (
                <button
                  type="button"
                  onClick={() => {
                    onNavigateNext();
                    dispatchChrome({ type: "patch", patch: { moreActionsOpen: false } });
                  }}
                  disabled={isBusy}
                  className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-foreground/80 transition-colors hover:bg-accent/40 active:bg-accent/60 disabled:opacity-40"
                >
                  <ChevronRight className="size-4 text-muted-foreground" />
                  Next message
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  onReply();
                  dispatchChrome({ type: "patch", patch: { moreActionsOpen: false } });
                }}
                disabled={isBusy}
                className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-foreground/80 transition-colors hover:bg-accent/40 active:bg-accent/60 disabled:opacity-40"
              >
                <Reply
                  className="size-4 text-muted-foreground"
                  strokeWidth={2.25}
                />
                Reply
              </button>
              <button
                type="button"
                onClick={() => {
                  onForward();
                  dispatchChrome({ type: "patch", patch: { moreActionsOpen: false } });
                }}
                disabled={isBusy}
                className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-foreground/80 transition-colors hover:bg-accent/40 active:bg-accent/60 disabled:opacity-40"
              >
                <Forward
                  className="size-4 text-muted-foreground"
                  strokeWidth={2.25}
                />
                Forward
              </button>
              {onArchive && (
                <button
                  type="button"
                  onClick={() => {
                    onArchive();
                    dispatchChrome({ type: "patch", patch: { moreActionsOpen: false } });
                  }}
                  disabled={isBusy}
                  className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-foreground/80 transition-colors hover:bg-accent/40 active:bg-accent/60 disabled:opacity-40"
                >
                  <Archive
                    className="size-4 text-muted-foreground"
                    strokeWidth={2.25}
                  />
                  Archive
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  onMarkAsUnread();
                  dispatchChrome({ type: "patch", patch: { moreActionsOpen: false } });
                }}
                disabled={isBusy}
                className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-foreground/80 transition-colors hover:bg-accent/40 active:bg-accent/60 disabled:opacity-40"
              >
                <MailOpen
                  className="size-4 text-muted-foreground"
                  strokeWidth={2}
                />
                Mark as unread
              </button>
              {otherMailboxes.length > 0 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      disabled={isBusy}
                      className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-foreground/80 transition-colors hover:bg-accent/40 active:bg-accent/60 disabled:opacity-40"
                    >
                      <FolderInput
                        className="size-4 text-muted-foreground"
                        strokeWidth={2}
                      />
                      Move to…
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    side="top"
                    align="start"
                    sideOffset={6}
                    className="w-48 p-1"
                  >
                    {otherMailboxes.map((mailbox) => (
                      <button
                        key={mailbox.id}
                        type="button"
                        onClick={() => {
                          onMove(mailbox.id);
                          dispatchChrome({ type: "patch", patch: { moreActionsOpen: false } });
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-sm text-foreground/80 hover:bg-accent/50 transition-colors text-left"
                      >
                        {getMailboxDisplayName(mailbox)}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
              )}
              {((onSetLabel && labels.length > 0) || onCreateLabel) && (
                <Popover
                  open={labelPopoverOpen}
                  onOpenChange={(open) =>
                    dispatchChrome({
                      type: "patch",
                      patch: { labelPopoverOpen: open },
                    })
                  }
                >
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      disabled={isBusy}
                      className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-foreground/80 transition-colors hover:bg-accent/40 active:bg-accent/60 disabled:opacity-40"
                    >
                      <Tag
                        className="size-4 text-muted-foreground"
                        strokeWidth={2}
                      />
                      Labels
                    </button>
                  </PopoverTrigger>
                  {labelPopoverContent}
                </Popover>
              )}
              {canReportSpam && (
                <button
                  type="button"
                  onClick={() => {
                    onReportSpam?.();
                    dispatchChrome({ type: "patch", patch: { moreActionsOpen: false } });
                  }}
                  disabled={isBusy}
                  className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-foreground/80 transition-colors hover:bg-accent/40 active:bg-accent/60 disabled:opacity-40"
                >
                  <OctagonAlert
                    className="size-4 text-muted-foreground"
                    strokeWidth={2.25}
                  />
                  Report spam
                </button>
              )}
              {canNotSpam && onNotSpam && (
                <button
                  type="button"
                  onClick={() => {
                    onNotSpam();
                    dispatchChrome({ type: "patch", patch: { moreActionsOpen: false } });
                  }}
                  disabled={isBusy}
                  className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-foreground/80 transition-colors hover:bg-accent/40 active:bg-accent/60 disabled:opacity-40"
                >
                  <Inbox
                    className="size-4 text-muted-foreground"
                    strokeWidth={2.25}
                  />
                  Not spam
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  onDelete();
                  dispatchChrome({ type: "patch", patch: { moreActionsOpen: false } });
                }}
                disabled={isBusy}
                className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-destructive/80 transition-colors hover:bg-destructive/10 active:bg-destructive/20 disabled:opacity-40"
              >
                <Trash2 className="size-4" strokeWidth={2} />
                {isInTrash ? "Delete permanently" : "Move to trash"}
              </button>
              <DrawerClose asChild>
                <button
                  type="button"
                  className="mt-2 flex h-11 w-full items-center justify-center rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-accent/40"
                >
                  Cancel
                </button>
              </DrawerClose>
            </div>
          </DrawerContent>
        </Drawer>
  );
}
