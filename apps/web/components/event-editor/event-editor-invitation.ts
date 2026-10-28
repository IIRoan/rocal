import type { QueryClient } from "@tanstack/react-query";
import {
  getCurrentUserInvitationStatus,
  invitationByExternalIdQueryKey,
} from "@workspace/calendar-core";
import {
  buildEventIcsExport,
  EventIcsExportError,
} from "@workspace/calendar-core/event-ics-export";
import type { CalendarEvent } from "@workspace/ui/components/calendar";
import { toast } from "sonner";

import { calendarApiService } from "@/lib/calendar-api-service";

import type { EventEditorInvitationResponseStatus } from "./types";

export function getInvitationResponseStatus(
  event: CalendarEvent | null | undefined,
  canEdit: boolean,
): EventEditorInvitationResponseStatus | null {
  if (!event || canEdit) {
    return null;
  }

  const status = getCurrentUserInvitationStatus(event);
  return status === "accepted" ||
    status === "declined" ||
    status === "tentative"
    ? status
    : null;
}

/** Builds the .ics from the decrypted event in the browser, so the server never sees its content. */
export function downloadEventIcs(
  event: CalendarEvent,
  options: { calendarName?: string | null; timezone?: string | null },
): void {
  try {
    const { icsContent, filename } = buildEventIcsExport(event, options);
    const objectUrl = URL.createObjectURL(
      new Blob([icsContent], { type: "text/calendar" }),
    );
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  } catch (error: unknown) {
    toast.error(
      error instanceof EventIcsExportError
        ? error.message
        : "Failed to download event as ICS file",
    );
  }
}

export async function respondToEventInvitation(input: {
  event: CalendarEvent;
  status: EventEditorInvitationResponseStatus;
  refetchEvents: () => Promise<unknown>;
  queryClient: QueryClient;
  loadEventData: (event: CalendarEvent) => void;
  onEventSaved?: () => void;
  onClose: () => void;
  setPending: (status: EventEditorInvitationResponseStatus | null) => void;
}): Promise<void> {
  input.setPending(input.status);
  try {
    const result = await calendarApiService.respondToInvitation(
      input.event.id,
      input.status,
    );
    // Best-effort refresh; the cache also refetches when the affected queries invalidate.
    void input.refetchEvents().catch(() => undefined);
    if ("deleted" in result && result.deleted) {
      if (input.event.externalId) {
        void input.queryClient.invalidateQueries({
          queryKey: invitationByExternalIdQueryKey(input.event.externalId),
        });
      }
      input.onEventSaved?.();
      input.onClose();
      toast.success("Invitation declined and removed from your calendar.");
      return;
    }

    input.loadEventData(result as CalendarEvent);
    input.onEventSaved?.();
    toast.success(
      input.status === "accepted"
        ? "Invitation accepted."
        : "Marked as tentative.",
    );
  } catch (error: unknown) {
    const message =
      error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "Failed to update invitation response.";
    toast.error(message);
  } finally {
    input.setPending(null);
  }
}
