import {
  formatInUserTimezone,
  getZonedDateParts,
  resolveTimezone,
} from "@workspace/calendar-core";
import { KIT_HOUR_HEIGHT } from "./calendar-kit-adapter";

export type TimelineEventDensity = "compact" | "small" | "stacked";

const COMPACT_HEIGHT_PX = 22;
const TIME_VISIBLE_HEIGHT_PX = 28;

/** Smallest on-screen height for a timed event; at 1.2px/minute a 5-minute one would be a 6px sliver. */
export const TIMELINE_MIN_EVENT_HEIGHT_PX = 30;

/** Minimum minutes calendar-kit lays a timed event out with. */
export function timelineMinEventMinutes(
  hourHeight: number = KIT_HOUR_HEIGHT,
): number {
  return Math.ceil((TIMELINE_MIN_EVENT_HEIGHT_PX / hourHeight) * 60);
}

/** Duration an event occupies on screen once the minimum height applies. */
export function timelineDisplayMinutes(
  durationMinutes: number,
  hourHeight: number = KIT_HOUR_HEIGHT,
): number {
  return Math.max(durationMinutes, timelineMinEventMinutes(hourHeight));
}

export function shouldShowEncryptionIcon(item: {
  encryptionState?: string | null;
  encryptedContent?: string | null;
  calendar?: { forceFullEncryption?: boolean | null } | null;
}): boolean {
  if (item.calendar?.forceFullEncryption) {
    return true;
  }

  if (item.encryptionState === "encrypted") {
    return true;
  }

  if (item.encryptionState === "shadow_write") {
    return true;
  }

  return Boolean(item.encryptedContent);
}

export function timelineEventHeight(
  durationMinutes: number,
  hourHeight: number = KIT_HOUR_HEIGHT,
): number {
  return (durationMinutes / 60) * hourHeight;
}

export function resolveTimelineEventDensity(input: {
  durationMinutes: number;
  hourHeight?: number;
  allDay?: boolean;
}): TimelineEventDensity {
  if (input.allDay) {
    return "compact";
  }

  const height = timelineEventHeight(
    input.durationMinutes,
    input.hourHeight ?? KIT_HOUR_HEIGHT,
  );

  if (height < COMPACT_HEIGHT_PX) {
    return "compact";
  }

  if (height < TIME_VISIBLE_HEIGHT_PX) {
    return "small";
  }

  return "stacked";
}

export function timelineEventTitleLines(
  density: TimelineEventDensity,
  durationMinutes: number,
  hourHeight: number = KIT_HOUR_HEIGHT,
): number {
  if (density !== "stacked") {
    return 1;
  }

  const height = timelineEventHeight(durationMinutes, hourHeight);
  const padding = 2;
  const lineHeight = 12;
  return Math.max(
    1,
    Math.min(4, Math.floor((height - padding) / lineHeight)),
  );
}

export function formatTimelineEventTime(
  instant: Date,
  timeFormat: "12h" | "24h",
  timezone: string,
): string {
  const resolvedTimezone = resolveTimezone(timezone);
  const { minutes } = getZonedDateParts(instant, resolvedTimezone);

  if (timeFormat === "24h") {
    return formatInUserTimezone(
      instant,
      resolvedTimezone,
      minutes === 0 ? "H" : "H:mm",
    );
  }

  return formatInUserTimezone(
    instant,
    resolvedTimezone,
    minutes === 0 ? "ha" : "h:mma",
  ).toLowerCase();
}
