"use client";

import React from "react";
import { Button } from "@workspace/ui/components/ui/button";
import { Label } from "@workspace/ui/components/ui/label";
import { RotateCcw, Edit3, Trash2, Calendar, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import type { CalendarEvent } from "@workspace/ui/components/calendar";

interface RecurringEventOptionsProps {
  event: CalendarEvent;
  isRecurringInstance: boolean;
  onEditSeries: () => void;
  onEditThisOnly: (occurrenceDate: string) => void;
  onEditThisAndFuture: (occurrenceDate: string) => void;
  onDeleteSeries: () => void;
  onDeleteThisOnly: (occurrenceDate: string) => void;
  onDeleteThisAndFuture: (occurrenceDate: string) => void;
  onCancel: () => void;
  mode: "edit" | "delete";
  onFallbackDelete?: () => void; // Fallback for non-recurring events
}

export function RecurringEventOptions({
  event,
  isRecurringInstance,
  onEditSeries,
  onEditThisOnly,
  onEditThisAndFuture,
  onDeleteSeries,
  onDeleteThisOnly,
  onDeleteThisAndFuture,
  onCancel,
  mode,
  onFallbackDelete,
}: RecurringEventOptionsProps) {
  const isEdit = mode === "edit";
  const Icon = isEdit ? Edit3 : Trash2;
  const actionWord = isEdit ? "Edit" : "Delete";
  const actionColor = isEdit ? "primary" : "destructive";

  // For recurring instances, we need the occurrence date
  // If this is a recurring instance with a synthetic ID, extract the date from the ID
  // Format: parentEventId_occurrenceDate
  let occurrenceDate = event.start.toISOString();

  if (isRecurringInstance && event.id.includes("_")) {
    // Extract the date part from the synthetic ID
    const parts = event.id.split("_");
    if (parts.length > 1) {
      // Join all parts after the first one in case the parent ID contains underscores
      const datePart = parts.slice(1).join("_");
      if (datePart) {
        occurrenceDate = datePart;
      }
    }
  }

  console.log("RecurringEventOptions:", {
    eventId: event.id,
    isRecurringInstance,
    occurrenceDate,
    eventStart: event.start,
    parentEventId: event.parentEventId,
  });

  // Check if this is actually a recurring event
  const actuallyRecurring = !!(
    event.recurrence ||
    event.isRecurringInstance ||
    event.parentEventId ||
    (event.id && event.id.includes("_"))
  );

  // If not actually recurring and we have fallback, show simple option
  if (!actuallyRecurring && onFallbackDelete && mode === "delete") {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 text-lg font-semibold">
            <Icon className="h-5 w-5 text-destructive" />
            Delete Event
          </div>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this event?
          </p>
        </div>

        <div className="space-y-3">
          <Button
            variant="destructive"
            className="w-full"
            onClick={onFallbackDelete}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Event
          </Button>
        </div>

        <div className="flex justify-center pt-4 border-t">
          <Button
            variant="ghost"
            onClick={onCancel}
            className="text-muted-foreground hover:text-foreground"
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2 text-lg font-semibold">
          <Icon
            className={`h-5 w-5 ${isEdit ? "text-primary" : "text-destructive"}`}
          />
          {actionWord} Recurring Event
        </div>
        <p className="text-sm text-muted-foreground">
          This is a recurring event. How would you like to{" "}
          {actionWord.toLowerCase()} it?
        </p>
      </div>

      <div className="space-y-3">
        {/* This occurrence only */}
        <Button
          variant="outline"
          className="w-full justify-start text-left h-auto py-4 px-4"
          onClick={() => {
            if (isEdit) {
              onEditThisOnly(occurrenceDate);
            } else {
              onDeleteThisOnly(occurrenceDate);
            }
          }}
        >
          <div className="flex items-center gap-3">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-medium">
                {actionWord} this occurrence only
              </div>
              <div className="text-xs text-muted-foreground">
                {format(event.start, "EEEE, MMMM d, yyyy")} at{" "}
                {format(event.start, "h:mm a")}
              </div>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 ml-auto text-muted-foreground" />
        </Button>

        {/* This and future occurrences */}
        <Button
          variant="outline"
          className="w-full justify-start text-left h-auto py-4 px-4"
          onClick={() => {
            if (isEdit) {
              onEditThisAndFuture(occurrenceDate);
            } else {
              onDeleteThisAndFuture(occurrenceDate);
            }
          }}
        >
          <div className="flex items-center gap-3">
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-medium">
                {actionWord} this and future occurrences
              </div>
              <div className="text-xs text-muted-foreground">
                Starting from {format(event.start, "MMMM d, yyyy")}
              </div>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 ml-auto text-muted-foreground" />
        </Button>

        {/* All occurrences (entire series) */}
        <Button
          variant="outline"
          className="w-full justify-start text-left h-auto py-4 px-4"
          onClick={() => {
            if (isEdit) {
              onEditSeries();
            } else {
              onDeleteSeries();
            }
          }}
        >
          <div className="flex items-center gap-3">
            <RotateCcw className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-medium">{actionWord} entire series</div>
              <div className="text-xs text-muted-foreground">
                All occurrences of this recurring event
              </div>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 ml-auto text-muted-foreground" />
        </Button>
      </div>

      <div className="flex justify-center pt-4 border-t">
        <Button
          variant="ghost"
          onClick={onCancel}
          className="text-muted-foreground hover:text-foreground"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

