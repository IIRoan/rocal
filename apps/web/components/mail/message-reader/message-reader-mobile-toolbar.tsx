"use client";

import { Icon, Type } from "@workspace/ui/solace";
import type {
  MessageReaderController,
  MessageReaderViewModel,
} from "../use-message-reader-controller";
import { ReaderActionIcon } from "./message-reader-action-button";

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
    <div className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--border-tertiary)] px-3">
      {onClose && (
        <ReaderActionIcon
          icon={Icon.Close}
          tone={Type.TERTIARY}
          aria-label="Close message"
          onClick={onClose}
        />
      )}
      <div className="min-w-0 flex-1 truncate text-sm font-medium leading-none">
        {message.subject || "(No subject)"}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {canReportSpam && (
          <ReaderActionIcon
            icon={Icon.Spam}
            tooltip="Report spam"
            disabled={isBusy}
            onClick={onReportSpam}
          />
        )}
        {canNotSpam && (
          <ReaderActionIcon
            icon={Icon.Inbox}
            tooltip="Not spam"
            disabled={isBusy}
            onClick={onNotSpam}
          />
        )}
        <ReaderActionIcon
          icon={Icon.Trash}
          iconColor="destructive"
          tooltip={isInTrash ? "Delete permanently" : "Move to trash"}
          disabled={isBusy}
          onClick={onDelete}
        />
        <ReaderActionIcon
          icon={Icon.OverflowH}
          tooltip="More actions"
          disabled={isBusy}
          onClick={() =>
            dispatchChrome({ type: "patch", patch: { moreActionsOpen: true } })
          }
        />
      </div>
    </div>
  );
}
