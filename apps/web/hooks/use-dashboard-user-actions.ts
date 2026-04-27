"use client";

import { useCallback } from "react";
import { createLogger } from "@workspace/logger";
import type { CalendarEvent } from "@workspace/ui/components/calendar";

import { signOut } from "@/lib/auth-client";
import { createDraftCalendarEvent } from "@/lib/calendar-event-drafts";

const log = createLogger("dashboard-user-actions");

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
  const handleLogout = useCallback(async () => {
    try {
      await signOut();
      window.location.href = "/";
    } catch (error) {
      log.error("Logout failed:", error);
    }
  }, []);

  const openNewEventEditor = useCallback(() => {
    openEventEditor(
      createDraftCalendarEvent({
        defaultCalendarId,
        fallbackCalendarId,
      }),
    );
  }, [defaultCalendarId, fallbackCalendarId, openEventEditor]);

  return {
    handleLogout,
    openNewEventEditor,
  };
}