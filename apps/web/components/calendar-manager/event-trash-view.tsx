"use client";

import { useId, useState } from "react";
import {
  EVENT_TRASH_EMPTY_MESSAGE,
  formatTrashEntryDetail,
  getErrorMessage,
  resolveTimezone,
  type TrashedCalendarEvent,
} from "@workspace/calendar-core";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";

import { EventConfirmDialog } from "@/components/event-editor/event-confirm-dialog";
import { useEventTrash } from "@/hooks/use-event-trash";
import { useSettings } from "@/hooks/use-settings";
import {
  PaletteButton,
  PaletteEmptyState,
  PaletteView,
} from "../command-palette/palette-ui";

type PendingConfirm = { kind: "entry"; entry: TrashedCalendarEvent } | { kind: "all" };

function TrashRow({
  entry,
  timezone,
  onRestore,
  onDelete,
}: {
  entry: TrashedCalendarEvent;
  timezone: string;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const titleId = useId();
  return (
    <li className="flex flex-wrap items-center gap-x-1 gap-y-1 p-2">
      <div className="min-w-48 flex-1">
        <p id={titleId} className="truncate text-[15px] leading-[130%] text-foreground">
          {entry.title}
        </p>
        <p className="mt-0.5 text-[13px] leading-[130%] text-muted-foreground">
          {formatTrashEntryDetail(entry, timezone)}
        </p>
      </div>
      <PaletteButton variant="ghost" aria-describedby={titleId} onClick={onRestore}>
        <RotateCcw className="size-3.5" />
        Restore
      </PaletteButton>
      <PaletteButton variant="ghost" aria-describedby={titleId} onClick={onDelete}>
        <Trash2 className="size-3.5" />
        Delete forever
      </PaletteButton>
    </li>
  );
}

function confirmCopy(pending: PendingConfirm) {
  return pending.kind === "all"
    ? {
        title: "Empty the trash?",
        description: "Every event in the trash is deleted for good. You can’t undo this.",
        confirmLabel: "Empty trash",
      }
    : {
        title: `Delete “${pending.entry.title}” forever?`,
        description: "The event is deleted for good. You can’t undo this.",
        confirmLabel: "Delete forever",
      };
}

function TrashEntries({
  trash,
  timezone,
  onRestore,
  onDelete,
}: {
  trash: ReturnType<typeof useEventTrash>["trash"];
  timezone: string;
  onRestore: (entry: TrashedCalendarEvent) => void;
  onDelete: (entry: TrashedCalendarEvent) => void;
}) {
  if (trash.isPending) {
    return (
      <div role="status" className="flex items-center justify-center gap-2 py-8 text-[13px] text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading deleted events…
      </div>
    );
  }
  if (trash.isError) {
    return (
      <PaletteEmptyState>
        <p role="alert" className="text-destructive">
          {getErrorMessage(trash.error, "Failed to load deleted events")}
        </p>
        <PaletteButton onClick={() => trash.refetch()}>Try again</PaletteButton>
      </PaletteEmptyState>
    );
  }
  if (trash.data.length === 0) {
    return <PaletteEmptyState>{EVENT_TRASH_EMPTY_MESSAGE}</PaletteEmptyState>;
  }
  return (
    <ul aria-label="Deleted events" className="flex flex-col gap-px">
      {trash.data.map((entry) => (
        <TrashRow
          key={entry.id}
          entry={entry}
          timezone={timezone}
          onRestore={() => onRestore(entry)}
          onDelete={() => onDelete(entry)}
        />
      ))}
    </ul>
  );
}

/** Deleted events of the last 30 days, with titles opened on this device. */
export function EventTrashView({ onBack }: { onBack: () => void }) {
  const { trash, restore, deleteForever, empty } = useEventTrash();
  const timezone = resolveTimezone(useSettings().settings?.timezone);
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const entries = trash.data ?? [];

  const confirm = () => {
    if (pending?.kind === "all") empty.mutate();
    else if (pending) deleteForever.mutate(pending.entry.id);
    setPending(null);
  };

  return (
    <PaletteView
      title="Trash"
      onBack={onBack}
      footer={
        entries.length > 0 ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] leading-[130%] text-muted-foreground">
              Deleted events stay here for 30 days.
            </p>
            <PaletteButton
              variant="destructive"
              loading={empty.isPending}
              onClick={() => setPending({ kind: "all" })}
            >
              Empty trash
            </PaletteButton>
          </div>
        ) : undefined
      }
    >
      <TrashEntries
        trash={trash}
        timezone={timezone}
        onRestore={(entry) => restore.mutate({ trashId: entry.id, calendarId: entry.calendarId })}
        onDelete={(entry) => setPending({ kind: "entry", entry })}
      />
      {pending ? (
        <EventConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setPending(null);
          }}
          onConfirm={confirm}
          {...confirmCopy(pending)}
        />
      ) : null}
    </PaletteView>
  );
}
