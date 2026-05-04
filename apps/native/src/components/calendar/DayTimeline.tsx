import type { ReactNode } from "react";
import type { DecoratedCalendarEvent } from "@workspace/calendar-core";
import { TimelinePager, type TimelinePage } from "./TimelinePager";

// ─── Props ───────────────────────────────────────────────────────────────────

interface DayTimelineProps {
  /** The date to display */
  currentDate: Date;
  /** Events to display as positioned blocks */
  events: DecoratedCalendarEvent[];
  /** Time format: "12h" or "24h" */
  timeFormat?: "12h" | "24h";
  /** Callback when an event block is tapped */
  onEventPress?: (event: DecoratedCalendarEvent) => void;
  /** Callback when an empty time slot is tapped */
  onTimeSlotPress?: (date: Date, hour: number) => void;
  /** Callback when a swipe has committed and the header can preview the target day */
  onSwipeCommit?: (direction: 1 | -1) => void;
  /** Callback when the user swipes to the adjacent day */
  onNavigate?: (direction: 1 | -1) => void;
  /** Whether horizontal swipe gestures are enabled */
  swipeEnabled?: boolean;
  /** Renders one header per timeline page so it moves with the grid. */
  renderHeaderPage?: (page: TimelinePage) => ReactNode;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DayTimeline({
  currentDate,
  events,
  timeFormat = "12h",
  onEventPress,
  onTimeSlotPress,
  onSwipeCommit,
  onNavigate,
  swipeEnabled = true,
  renderHeaderPage,
}: DayTimelineProps) {
  return (
    <TimelinePager
      currentDate={currentDate}
      events={events}
      view="day"
      timeFormat={timeFormat}
      swipeEnabled={swipeEnabled}
      onSwipeCommit={onSwipeCommit}
      onNavigate={onNavigate}
      onEventPress={onEventPress}
      onTimeSlotPress={onTimeSlotPress}
      renderHeaderPage={renderHeaderPage}
    />
  );
}

export type { DayTimelineProps };
