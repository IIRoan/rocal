import { useCallback } from "react";
import {
  setPickerDatePart,
  setPickerTimePart,
  shiftEndWithStart,
} from "./event-form-utils";
import type { UpdateFields, UpdateUi } from "./use-event-form-state";

export function useEventFormDateTime({
  start,
  end,
  allDay,
  timezone,
  updateFields,
  updateUi,
}: {
  start: string;
  end: string;
  allDay: boolean;
  timezone: string;
  updateFields: UpdateFields;
  updateUi: UpdateUi;
}) {
  const updateStart = useCallback(
    (nextStart: string) =>
      updateFields({
        start: nextStart,
        end: shiftEndWithStart(start, nextStart, end, allDay, timezone),
      }),
    [allDay, end, start, timezone, updateFields],
  );

  const handleStartDateSelect = useCallback(
    (date: Date) => {
      updateStart(setPickerDatePart(start, date, timezone));
      updateUi({ dateTimePickerOpen: false });
    },
    [start, timezone, updateStart, updateUi],
  );

  const handleEndDateSelect = useCallback(
    (date: Date) => {
      updateFields({ end: setPickerDatePart(end, date, timezone) });
      updateUi({ dateTimePickerOpen: false });
    },
    [end, timezone, updateFields, updateUi],
  );

  const handleStartTimeChange = useCallback(
    (time: Date) => updateStart(setPickerTimePart(start, time)),
    [start, updateStart],
  );

  const handleEndTimeChange = useCallback(
    (time: Date) => updateFields({ end: setPickerTimePart(end, time) }),
    [end, updateFields],
  );

  return {
    handleStartDateSelect,
    handleEndDateSelect,
    handleStartTimeChange,
    handleEndTimeChange,
  };
}
