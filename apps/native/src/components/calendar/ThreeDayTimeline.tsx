import type { ReactNode } from "react";
import type { DecoratedCalendarEvent } from "@workspace/calendar-core";
import { TimelinePager, type TimelinePage } from "./TimelinePager";

// ─── Props ───────────────────────────────────────────────────────────────────

interface ThreeDayTimelineProps {
  /** The center date of the 3-day range */
  currentDate: Date;
  /** Events to display as positioned blocks */
  events: DecoratedCalendarEvent[];
  /** Time format: "12h" or "24h" */
  timeFormat?: "12h" | "24h";
  timezone?: string;
  /** Callback when an event block is tapped */
  onEventPress?: (event: DecoratedCalendarEvent) => void;
  /** Callback when an empty time slot is tapped */
  onTimeSlotPress?: (date: Date, hour: number) => void;
  /** Callback when a swipe has committed and the header can preview the target page */
  onSwipeCommit?: (direction: 1 | -1) => void;
  /** Callback when the user swipes to the adjacent 3-day page */
  onNavigate?: (direction: 1 | -1) => void;
  /** Whether horizontal swipe gestures are enabled */
  swipeEnabled?: boolean;
  /** Renders one header per timeline page so it moves with the grid. */
  renderHeaderPage?: (page: TimelinePage) => ReactNode;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ThreeDayTimeline({
  currentDate,
  events,
  timeFormat = "12h",
  timezone,
  onEventPress,
  onTimeSlotPress,
  onSwipeCommit,
  onNavigate,
  swipeEnabled = true,
  renderHeaderPage,
}: ThreeDayTimelineProps) {
  return (
    <TimelinePager
      currentDate={currentDate}
      events={events}
      view="3day"
      timeFormat={timeFormat}
      timezone={timezone}
      swipeEnabled={swipeEnabled}
      onSwipeCommit={onSwipeCommit}
      onNavigate={onNavigate}
      onEventPress={onEventPress}
      onTimeSlotPress={onTimeSlotPress}
      renderHeaderPage={renderHeaderPage}
    />
  );
}

export type { ThreeDayTimelineProps };
