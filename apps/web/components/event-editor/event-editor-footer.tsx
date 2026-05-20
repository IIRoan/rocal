import { Button } from "@workspace/ui/components/ui/button";
import { Download, Edit3, Loader2, Save, Trash2 } from "lucide-react";

import {
  canSaveEventEditor,
  isRecurringEventDeleteCandidate,
} from "@/lib/event-editor-view-model";
import type { EventEditorFooterProps } from "./types";

export function EventEditorFooter({
  desktop,
  eventForm,
  handleEventDelete,
  handleEventDownloadIcs,
  handleEventSave,
  isViewMode,
  onBack,
  onClose,
}: EventEditorFooterProps) {
  const handleDelete = () => {
    if (isRecurringEventDeleteCandidate(eventForm.selectedEvent)) {
      eventForm.setShowRecurringDeleteModal(true);
      return;
    }

    handleEventDelete();
  };

  const canSave = canSaveEventEditor({
    eventCalendarId: eventForm.eventCalendarId,
    eventSaving: eventForm.eventSaving,
    eventTitle: eventForm.eventTitle,
  });

  if (desktop) {
    return (
      <div className="px-3 py-2 border-t border-border/50 flex flex-row items-center gap-2 shrink-0">
        {isViewMode ? (
          <>
            {eventForm.selectedEvent?.id &&
              !eventForm.selectedEvent.isSynced && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDelete}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="size-4" /> Delete
                </Button>
              )}
            <div className="flex-1" />
            {eventForm.selectedEvent?.id && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleEventDownloadIcs}
              >
                <Download className="size-4" /> ICS
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
            {eventForm.selectedEvent?.id &&
              !eventForm.selectedEvent.isSynced && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => eventForm.setEventViewMode("edit")}
                  className="text-primary hover:bg-primary/10"
                >
                  <Edit3 className="size-4" /> Edit
                </Button>
              )}
          </>
        ) : (
          <>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleEventSave} disabled={!canSave}>
              {eventForm.eventSaving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="size-4" />
                  Save
                </>
              )}
            </Button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="px-4 py-3 border-t border-border/50 bg-muted/30 flex shrink-0 flex-row gap-3">
      {isViewMode ? (
        <>
          {eventForm.selectedEvent?.id && !eventForm.selectedEvent.isSynced && (
            <Button
              variant="outline"
              onClick={handleDelete}
              className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-4 mr-2" /> Delete
            </Button>
          )}
          <div className="flex-1" />
          {eventForm.selectedEvent?.id && (
            <Button variant="outline" onClick={handleEventDownloadIcs}>
              <Download className="size-4 mr-2" /> ICS
            </Button>
          )}
          <Button variant="outline" onClick={onBack}>
            Close
          </Button>
          {eventForm.selectedEvent?.id && !eventForm.selectedEvent.isSynced && (
            <Button onClick={() => eventForm.setEventViewMode("edit")}>
              <Edit3 className="size-4 mr-2" /> Edit
            </Button>
          )}
        </>
      ) : (
        <>
          <Button
            variant="outline"
            onClick={
              eventForm.selectedEvent?.id
                ? () => eventForm.setEventViewMode("view")
                : onBack
            }
          >
            Cancel
          </Button>
          <div className="flex-1" />
          <Button onClick={handleEventSave} disabled={!canSave}>
            {eventForm.eventSaving ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Saving…
              </>
            ) : (
              <>
                <Save className="size-4 mr-2" />
                Save
              </>
            )}
          </Button>
        </>
      )}
    </div>
  );
}
