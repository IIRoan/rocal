"use client";

import { Button } from "@workspace/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";

export function EventDeleteConfirmDialog({
  eventTitle,
  onConfirm,
  onOpenChange,
  open,
  removeOnly,
}: {
  eventTitle: string;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  removeOnly: boolean;
}) {
  const title = eventTitle || "Untitled event";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showClose={false}
        className="w-[calc(100dvw-1rem)] sm:w-auto sm:max-w-sm"
      >
        <DialogHeader>
          <DialogTitle>
            {removeOnly
              ? `Remove “${title}” from your calendar?`
              : `Delete “${title}”?`}
          </DialogTitle>
          <DialogDescription>
            {removeOnly
              ? "The cancelled event leaves your calendar. You can’t undo this."
              : "This permanently deletes the event. You can’t undo this."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm}>
            {removeOnly ? "Remove event" : "Delete event"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
