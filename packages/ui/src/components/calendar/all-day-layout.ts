import {
  comparePickerDays,
  getInclusiveCalendarDayRange,
} from "@workspace/calendar-core";

import type { CalendarEvent } from "./types";
import { eventOverlapsRange, isAllDayRowEvent } from "./utils";

export type AllDayPlacement = {
  event: CalendarEvent;
  startIndex: number;
  span: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
};

export type AllDayLayout = {
  placements: AllDayPlacement[];
  laneCount: number;
};

function clipEventToVisibleDays(
  event: CalendarEvent,
  days: Date[],
  timezone: string,
): Omit<AllDayPlacement, "lane"> | null {
  if (days.length === 0) return null;

  const firstVisible = days[0]!;
  const lastVisible = days[days.length - 1]!;
  const { firstDay, lastDay } = getInclusiveCalendarDayRange(
    new Date(event.start),
    new Date(event.end),
    timezone,
    { allDay: event.allDay },
  );

  let startIndex = 0;
  while (
    startIndex < days.length &&
    comparePickerDays(days[startIndex]!, firstDay) < 0
  ) {
    startIndex += 1;
  }

  let endIndex = days.length - 1;
  while (
    endIndex >= 0 &&
    comparePickerDays(days[endIndex]!, lastDay) > 0
  ) {
    endIndex -= 1;
  }

  if (startIndex > endIndex) {
    return null;
  }

  return {
    event,
    startIndex,
    span: endIndex - startIndex + 1,
    continuesBefore: comparePickerDays(firstDay, firstVisible) < 0,
    continuesAfter: comparePickerDays(lastDay, lastVisible) > 0,
  };
}

function rangesOverlap(
  leftStart: number,
  leftSpan: number,
  rightStart: number,
  rightSpan: number,
): boolean {
  return leftStart < rightStart + rightSpan && rightStart < leftStart + leftSpan;
}

/**
 * Pack all-day / multi-day events into non-overlapping lanes across a visible
 * day range so a single card can span consecutive columns.
 */
export function layoutAllDayRowEvents(
  events: CalendarEvent[],
  days: Date[],
  timezone: string,
): AllDayLayout {
  if (days.length === 0) {
    return { placements: [], laneCount: 0 };
  }

  const firstVisible = days[0]!;
  const lastVisible = days[days.length - 1]!;
  const drafts: Array<Omit<AllDayPlacement, "lane">> = [];

  for (const event of events) {
    if (
      !isAllDayRowEvent(event, timezone) ||
      !eventOverlapsRange(event, firstVisible, lastVisible, "day", timezone)
    ) {
      continue;
    }

    const clipped = clipEventToVisibleDays(event, days, timezone);
    if (clipped) {
      drafts.push(clipped);
    }
  }

  drafts.sort((left, right) => {
    if (left.startIndex !== right.startIndex) {
      return left.startIndex - right.startIndex;
    }
    if (left.span !== right.span) {
      return right.span - left.span;
    }
    return (
      new Date(left.event.start).getTime() - new Date(right.event.start).getTime()
    );
  });

  const laneOccupancy: Array<Array<{ startIndex: number; span: number }>> = [];
  const placements: AllDayPlacement[] = drafts.map((draft) => {
    let lane = laneOccupancy.findIndex((occupied) =>
      occupied.every(
        (item) =>
          !rangesOverlap(
            item.startIndex,
            item.span,
            draft.startIndex,
            draft.span,
          ),
      ),
    );

    if (lane === -1) {
      lane = laneOccupancy.length;
      laneOccupancy.push([]);
    }

    laneOccupancy[lane]!.push({
      startIndex: draft.startIndex,
      span: draft.span,
    });

    return { ...draft, lane };
  });

  return {
    placements,
    laneCount: laneOccupancy.length,
  };
}
