"use client";

import React from "react";
import { Button } from "@workspace/ui/components/ui/button";
import { Trash2, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";

interface RecurringDeleteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventTitle: string;
  onDeleteThis?: () => void;
  onDeleteAll: () => void;
  loading?: boolean;
}

export function RecurringDeleteModal({
  open,
  onOpenChange,
  eventTitle,
  onDeleteThis,
  onDeleteAll,
  loading = false,
}: RecurringDeleteModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100dvw-1rem)] sm:w-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-destructive" />
            Delete Recurring Event
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              &quot;{eventTitle}&quot; is a recurring event.
            </p>
            <p className="text-sm text-muted-foreground">
              Would you like to delete just this occurrence or the entire
              series?
            </p>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-4 border-t">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            {onDeleteThis && (
              <Button
                variant="outline"
                onClick={() => {
                  onDeleteThis();
                }}
                disabled={loading}
                className="w-full sm:w-auto"
              >
                <Trash2 className="size-4 mr-2" />
                {loading ? "Deleting..." : "Delete This Only"}
              </Button>
            )}
            <Button
              variant="destructive"
              onClick={() => {
                onDeleteAll();
              }}
              disabled={loading}
              className="w-full sm:w-auto"
            >
              <Trash2 className="size-4 mr-2" />
              {loading ? "Deleting..." : "Delete All"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
