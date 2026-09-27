"use client";

import type {
  RecurrenceDeleteScope,
  RecurrenceEditScope,
} from "@workspace/calendar-core";
import { Button } from "@workspace/ui/components/ui/button";
import { Repeat } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";

export type RecurringScope = RecurrenceEditScope & RecurrenceDeleteScope;

const RECURRING_SCOPE_OPTIONS: { scope: RecurringScope; label: string }[] =
  [
    { scope: "this_only", label: "This event" },
    { scope: "this_and_future", label: "This and following events" },
    { scope: "all", label: "All events" },
  ];

interface RecurringScopeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: "edit" | "delete";
  eventTitle: string;
  onSelect: (scope: RecurringScope) => void;
  loading?: boolean;
}

export function RecurringScopeModal({
  open,
  onOpenChange,
  action,
  eventTitle,
  onSelect,
  loading = false,
}: RecurringScopeModalProps) {
  const isDelete = action === "delete";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100dvw-1rem)] sm:w-auto sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Repeat className="size-4 text-muted-foreground" />
            {isDelete ? "Delete recurring event" : "Save recurring event"}
          </DialogTitle>
          <DialogDescription>
            &quot;{eventTitle || "Untitled event"}&quot; repeats. Which events
            should {isDelete ? "be deleted" : "change"}?
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {RECURRING_SCOPE_OPTIONS.map((option) => (
            <Button
              key={option.scope}
              variant={isDelete && option.scope === "all" ? "destructive" : "outline"}
              onClick={() => onSelect(option.scope)}
              disabled={loading}
              className="w-full justify-start"
            >
              {option.label}
            </Button>
          ))}
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="w-full"
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
