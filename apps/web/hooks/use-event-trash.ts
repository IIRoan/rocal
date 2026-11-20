"use client";

import {
  useEventTrash as useSharedEventTrash,
  useRestoreTrashedEvent as useSharedRestoreTrashedEvent,
  type EventTrashPlatform,
  type TrashRestoreTarget,
} from "@workspace/calendar-client/use-event-trash";
import { resolveTimezone } from "@workspace/calendar-core";
import { toast } from "@workspace/ui/lib/toast";

import { calendarApiService } from "@/lib/calendar-api-service";
import { monthFetchRange } from "./use-calendar-events-loader";
import { useSettings } from "./use-settings";

const MONTH_KEY = /^\d{4}-\d{2}$/;

function useTrashPlatform(): EventTrashPlatform {
  const timezone = resolveTimezone(useSettings().settings?.timezone);
  return {
    api: calendarApiService,
    notify: (message, kind) => (kind === "error" ? toast.error(message) : toast.success(message)),
    eventsQueryRange: ([, month, zone]) =>
      typeof month === "string" && MONTH_KEY.test(month)
        ? monthFetchRange(month, typeof zone === "string" ? zone : timezone)
        : null,
  };
}

/** Mutation-level callbacks, so an Undo from a closed editor still refreshes and reports. */
export function useRestoreTrashedEvent() {
  return useSharedRestoreTrashedEvent(useTrashPlatform());
}

/** Shows the Undo toast for a delete that left a trash entry; action toasts stay until dismissed. */
export function useEventTrashUndo() {
  const { mutate: restore } = useRestoreTrashedEvent();
  return (target: TrashRestoreTarget) =>
    toast.success("Event moved to Trash", {
      action: { label: "Undo", onClick: () => restore(target) },
    });
}

export function useEventTrash() {
  return useSharedEventTrash(useTrashPlatform());
}
