"use client";

import { useMutation } from "@tanstack/react-query";
import { loadCalendarIcsExport } from "@workspace/calendar-client";
import type { Calendar } from "@workspace/calendar-core";
import {
  calendarIcsExportSkippedNotice,
  EventIcsExportError,
} from "@workspace/calendar-core/event-ics-export";
import { toast } from "@workspace/ui/lib/toast";

import { calendarApiService } from "@/lib/calendar-api-service";
import { saveIcsFile } from "@/lib/ics-download";
import { useSettings } from "./use-settings";

/** Downloads one or more calendars as a single .ics built in the browser from the decrypted events. */
export function useCalendarIcsExport() {
  const timezone = useSettings().settings?.timezone;
  return useMutation({
    mutationFn: async (calendars: Calendar[]) => {
      const file = await loadCalendarIcsExport(calendarApiService, { calendars, timezone });
      saveIcsFile(file);
      return file.skipped;
    },
    onSuccess: (skipped) => {
      if (skipped > 0) toast.warning(calendarIcsExportSkippedNotice(skipped));
    },
    onError: (error) =>
      toast.error(
        error instanceof EventIcsExportError
          ? error.message
          : "Failed to export the calendar",
      ),
  });
}
