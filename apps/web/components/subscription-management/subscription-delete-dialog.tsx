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

import type { PendingSubscriptionDeletion } from "./subscription-shared";

export function SubscriptionDeleteDialog({
  pendingDelete,
  setPendingDelete,
  onConfirm,
}: {
  pendingDelete: PendingSubscriptionDeletion;
  setPendingDelete: (value: PendingSubscriptionDeletion) => void;
  onConfirm: (id: string) => void;
}) {
  return (
    <Dialog
      open={!!pendingDelete}
      onOpenChange={(open) => !open && setPendingDelete(null)}
    >
      <DialogContent
        showClose={false}
        className="max-w-md p-0 overflow-hidden bg-popover border-border/50 shadow-2xl"
      >
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle>Remove &ldquo;{pendingDelete?.name}&rdquo;?</DialogTitle>
          <DialogDescription>
            The read-only calendar and its synced events will be deleted.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="px-5 py-4 border-t border-border/50 gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPendingDelete(null)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              if (pendingDelete) {
                onConfirm(pendingDelete.id);
              }
              setPendingDelete(null);
            }}
          >
            Remove subscription
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
