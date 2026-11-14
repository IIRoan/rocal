import { useMutation } from "@tanstack/react-query";
import { loadCalendarIcsExport } from "@workspace/calendar-client";
import { getErrorMessage, type Calendar } from "@workspace/calendar-core";
import { EventIcsExportError } from "@workspace/calendar-core/event-ics-export";
import { useUserTimezone } from "@workspace/native-core/hooks/use-user-timezone";
import { calendarApiService } from "@workspace/native-core/lib/api";
import { useToast } from "@workspace/native-core/providers/ToastProvider";
import { shareIcsFile } from "../lib/event-ics-share";

/** Shares one or more calendars as a single .ics built on the device from the decrypted events. */
export function useCalendarIcsExport() {
  const { toast } = useToast();
  const timezone = useUserTimezone();
  return useMutation({
    mutationFn: async (calendars: Calendar[]) =>
      shareIcsFile(await loadCalendarIcsExport(calendarApiService, { calendars, timezone })),
    onError: (error) =>
      toast(
        error instanceof EventIcsExportError
          ? error.message
          : getErrorMessage(error, "Failed to export the calendar"),
        "error",
      ),
  });
}
