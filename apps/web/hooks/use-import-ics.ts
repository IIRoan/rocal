import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getErrorMessage } from "@workspace/calendar-core";
import { toast } from "sonner";

import { calendarApiService } from "../lib/calendar-api-service";
import type {
  ApiError,
  ImportICSRequest,
  ImportICSResponse,
} from "../lib/types/calendar";
import { EVENTS_QUERY_KEY } from "./use-calendar-events-loader";

export function formatIcsImportSummary(result: ImportICSResponse): string {
  return `Imported ${result.eventsCreated} of ${result.eventsTotal} events${
    result.calendarName ? ` into ${result.calendarName}` : ""
  }`;
}

export function useImportIcs() {
  const queryClient = useQueryClient();
  return useMutation<ImportICSResponse, ApiError, ImportICSRequest>({
    mutationFn: (request) => calendarApiService.importICS(request),
    onSuccess: (result) => {
      // Imported events can land in any month, so every cached range is stale.
      void queryClient.invalidateQueries({ queryKey: EVENTS_QUERY_KEY });
      toast.success(formatIcsImportSummary(result));
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Failed to import .ics file"));
    },
  });
}
