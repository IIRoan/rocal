"use client";

import { createLogger } from "@workspace/logger";
import type { CalendarEvent } from "@workspace/ui/components/calendar";

import { signOutAndClearLocalState } from "@/lib/auth-local-state";
import { beginAuthNavigation } from "@/lib/auth-navigation";
import { createDraftCalendarEvent } from "@/lib/calendar-event-drafts";

const log = createLogger("dashboard-user-actions");

async function handleLogout() {
  const finishNavigation = beginAuthNavigation("/");
  if (!finishNavigation) return;
  try {
    await signOutAndClearLocalState();
  } catch (error) {
    log.error("Logout failed:", error);
  } finally {
    finishNavigation();
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
