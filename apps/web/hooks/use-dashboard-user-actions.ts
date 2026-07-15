"use client";

import { createLogger } from "@workspace/logger";
import type { CalendarEvent } from "@workspace/ui/components/calendar";

import { signOutAndClearLocalState } from "@/lib/auth-local-state";
import { createDraftCalendarEvent } from "@/lib/calendar-event-drafts";

const log = createLogger("dashboard-user-actions");

async function handleLogout() {
  try {
    await signOutAndClearLocalState();
    window.location.href = "/";
  } catch (error) {
    log.error("Logout failed:", error);
  }
}

type UseDashboardUserActionsOptions = {
  defaultCalendarId?: string | null;
  fallbackCalendarId?: string | null;
  openEventEditor: (event: CalendarEvent) => void;
};

export function useDashboardUserActions({
  defaultCalendarId,
  fallbackCalendarId,
  openEventEditor,
}: UseDashboardUserActionsOptions) {
  function openNewEventEditor() {
    openEventEditor(
      createDraftCalendarEvent({
        defaultCalendarId,
        fallbackCalendarId,
      }),
    );
  }

  return {
    handleLogout,
    openNewEventEditor,
  };
}
