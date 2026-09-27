import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RecurrenceEditScope } from "@workspace/calendar-core";
import type { MoveRecurringCalendarEvent } from "@workspace/ui/components/calendar";

import {
  findEventInCache,
  type EditRecurringEventInput,
} from "./use-calendar-data";

type ScopeResolver = (scope: RecurrenceEditScope | null) => void;

export function useRecurringMovePrompt(
  editRecurringEvent: (input: EditRecurringEventInput) => Promise<unknown>,
) {
  const queryClient = useQueryClient();
  const resolverRef = useRef<ScopeResolver | null>(null);
  const [pendingTitle, setPendingTitle] = useState<string | null>(null);

  const settle = useCallback((scope: RecurrenceEditScope | null) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setPendingTitle(null);
    resolve?.(scope);
  }, []);

  const moveRecurringEvent = useCallback<MoveRecurringCalendarEvent>(
    async (originalEvent, update) => {
      const event = findEventInCache(queryClient, originalEvent.id);
      if (!event) throw new Error("Event not found");

      resolverRef.current?.(null);
      const scope = await new Promise<RecurrenceEditScope | null>((resolve) => {
        resolverRef.current = resolve;
        setPendingTitle(originalEvent.title);
      });
      if (!scope) return false;

      await editRecurringEvent({ event, scope, updates: update });
      return true;
    },
    [editRecurringEvent, queryClient],
  );

  return {
    moveRecurringEvent,
    scopePrompt: {
      open: pendingTitle !== null,
      eventTitle: pendingTitle ?? "",
      onSelect: settle,
      onOpenChange: (open: boolean) => {
        if (!open) settle(null);
      },
    },
  };
}
