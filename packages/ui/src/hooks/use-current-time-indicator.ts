"use client";

import { useSyncExternalStore } from "react";
import {
  getZonedDateParts,
  isSamePickerDay,
  resolveTimezone,
  utcToPickerDate,
} from "@workspace/calendar-core";
import { StartHour } from "../components/calendar/constants";

const MINUTE_MS = 60_000;

function subscribeToMinutes(onChange: () => void) {
  const interval = window.setInterval(onChange, MINUTE_MS);
  return () => window.clearInterval(interval);
}

const getCurrentMinute = () => Math.floor(Date.now() / MINUTE_MS);
// The server renders no line, so hydration never mismatches the client clock.
const getServerMinute = () => null;

/** Line position and visibility for the account-zone days a timeline renders. */
export function getCurrentTimeIndicator(
  now: Date,
  days: readonly Date[],
  timezone?: string | null,
) {
  const resolvedTimezone = resolveTimezone(timezone);
  const { hours, minutes } = getZonedDateParts(now, resolvedTimezone);
  const today = utcToPickerDate(now, resolvedTimezone);

  return {
    currentTimePosition: (((hours - StartHour) * 60 + minutes) / (24 * 60)) * 100,
    currentTimeVisible: days.some((day) => isSamePickerDay(day, today)),
    currentTime: { hours, minutes },
  };
}

export function useCurrentTimeIndicator(
  days: readonly Date[],
  timezone?: string | null,
) {
  const minute = useSyncExternalStore(
    subscribeToMinutes,
    getCurrentMinute,
    getServerMinute,
  );

  if (minute === null) {
    return { currentTimePosition: 0, currentTimeVisible: false, currentTime: null };
  }

  return getCurrentTimeIndicator(new Date(minute * MINUTE_MS), days, timezone);
}
