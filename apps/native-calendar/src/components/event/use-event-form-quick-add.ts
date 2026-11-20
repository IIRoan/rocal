import { useCallback, useMemo, useState } from "react";
import {
  formatQuickAddSummary,
  parseQuickAdd,
  type TimeFormat,
} from "@workspace/calendar-core";
import { toTimezonePickerISOString } from "./event-form-utils";
import type { UpdateFields } from "./use-event-form-state";

/** The date and time typed into a new event's title, as a label and an apply action; editing offers none. */
export function useEventFormQuickAdd({
  enabled,
  title,
  timezone,
  timeFormat,
  defaultDurationMinutes,
  updateFields,
}: {
  enabled: boolean;
  title: string;
  timezone: string;
  timeFormat: TimeFormat;
  defaultDurationMinutes: number;
  updateFields: UpdateFields;
}) {
  const [openedAt] = useState(() => new Date());
  const result = useMemo(
    () =>
      enabled
        ? parseQuickAdd(title, { now: openedAt, timezone, defaultDurationMinutes })
        : null,
    [defaultDurationMinutes, enabled, openedAt, timezone, title],
  );
  const apply = useCallback(() => {
    if (!result) return;
    updateFields({
      title: result.title,
      allDay: result.allDay,
      start: toTimezonePickerISOString(result.start, timezone),
      end: toTimezonePickerISOString(result.end, timezone),
    });
  }, [result, timezone, updateFields]);
  return {
    label: result ? formatQuickAddSummary(result, timezone, timeFormat) : null,
    apply,
  };
}
