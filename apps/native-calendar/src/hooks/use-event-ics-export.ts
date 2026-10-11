import { useState } from "react";
import { getErrorMessage, type CalendarEvent } from "@workspace/calendar-core";
import { EventIcsExportError } from "@workspace/calendar-core/event-ics-export";
import { useToast } from "@workspace/native-core/providers/ToastProvider";
import { shareEventIcs } from "../lib/event-ics-share";

export function useEventIcsExport(
  event: CalendarEvent | undefined,
  calendarName: string | undefined,
  timezone: string,
) {
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);

  const exportIcs = () => {
    if (!event) return;
    setExporting(true);
    shareEventIcs(event, { calendarName, timezone })
      .catch((err: unknown) =>
        toast(
          err instanceof EventIcsExportError
            ? err.message
            : getErrorMessage(err, "Failed to export event"),
          "error",
        ),
      )
      .finally(() => setExporting(false));
  };

  return { exporting, exportIcs };
}
