import {
  useEventTrash as useSharedEventTrash,
  useRestoreTrashedEvent as useSharedRestoreTrashedEvent,
  type EventTrashPlatform,
} from "@workspace/calendar-client/use-event-trash";
import { calendarApiService } from "@workspace/native-core/lib/api";
import { useToast } from "@workspace/native-core/providers/ToastProvider";
import { parseEventsQueryRange } from "../lib/optimistic-events";

function useTrashPlatform(): EventTrashPlatform {
  const { toast } = useToast();
  return {
    api: calendarApiService,
    notify: (message, kind) => toast(message, kind),
    eventsQueryRange: parseEventsQueryRange,
  };
}

/** Mutation-level callbacks, so an Undo from a closed event sheet still refreshes and reports. */
export function useRestoreTrashedEvent() {
  return useSharedRestoreTrashedEvent(useTrashPlatform());
}

export function useEventTrash() {
  return useSharedEventTrash(useTrashPlatform());
}
