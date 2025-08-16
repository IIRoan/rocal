"use client";

import React from "react";
import { Button } from "@workspace/ui/components/ui/button";
import { 
  Trash2,
  AlertTriangle
} from "lucide-react";
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
  onDeleteAll: () => void;
  loading?: boolean;
}

export function RecurringDeleteModal({
  open,
  onOpenChange,
  eventTitle,
  onDeleteAll,
  loading = false,
}: RecurringDeleteModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Delete Recurring Event
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete "{eventTitle}"?
            </p>
            <p className="text-sm text-muted-foreground">
              This will delete all occurrences of this recurring event and cannot be undone.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                onDeleteAll();
              }}
              disabled={loading}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {loading ? "Deleting..." : "Delete Event"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}