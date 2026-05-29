import {
  addHours,
  areIntervalsOverlapping,
  differenceInMinutes,
  isSameDay,
  startOfDay,
} from "date-fns";

import { CalendarEvent } from "./types";

type TimelineWidthStrategy =
  | "desktop-cascade"
  | "no-overflow"
  | "simple-no-overflow"
  | "mobile-cascade";

interface TimelineLayoutOptions {
  cellHeight: number;
  startHour?: number;
  minHeight?: number;
  sortByDurationOnTie?: boolean;
  widthStrategy: TimelineWidthStrategy;
}

export interface PositionedTimelineEvent {
  event: CalendarEvent;
  top: number;
  height: number;
  left: number;
  width: number;
  zIndex: number;
}

interface TimelineColumnEvent {
  event: CalendarEvent;
  start: Date;
  end: Date;
}

function getAdjustedEventInterval(event: CalendarEvent, day: Date) {
  const dayStart = startOfDay(day);
  const eventStart = new Date(event.start);
  const eventEnd = new Date(event.end);

  return {
    start: isSameDay(day, eventStart) ? eventStart : dayStart,
    end: isSameDay(day, eventEnd) ? eventEnd : addHours(dayStart, 24),
  };
}

function sortTimelineEvents(
  events: CalendarEvent[],
  sortByDurationOnTie: boolean,
) {
  return events.slice().sort((a, b) => {
    const aStart = new Date(a.start);
    const bStart = new Date(b.start);

    if (aStart < bStart) return -1;
    if (aStart > bStart) return 1;

    if (!sortByDurationOnTie) return 0;

    const aEnd = new Date(a.end);
    const bEnd = new Date(b.end);
    return differenceInMinutes(bEnd, bStart) - differenceInMinutes(aEnd, aStart);
  });
}

function calculateWidth(
  strategy: TimelineWidthStrategy,
  overlappingColumns: number,
  columnIndex: number,
) {
  if (strategy === "desktop-cascade") {
    if (overlappingColumns === 1) {
      return { width: 1, left: 0 };
    }

    if (overlappingColumns <= 3) {
      return {
        width: (1 / overlappingColumns) * 0.95,
        left: columnIndex * (1 / overlappingColumns) + columnIndex * 0.01,
      };
    }

    const baseWidth = 0.75;
    const widthDecrement = Math.min(0.1, 0.5 / overlappingColumns);
    const offsetIncrement = Math.min(0.15, 0.8 / overlappingColumns);

    return {
      width: baseWidth - columnIndex * widthDecrement,
      left: columnIndex * offsetIncrement,
    };
  }

  if (strategy === "mobile-cascade") {
    if (overlappingColumns === 1) {
      return { width: 0.95, left: 0.02 };
    }

    if (overlappingColumns === 2) {
      return {
        width: columnIndex === 0 ? 0.92 : 0.78,
        left: columnIndex === 0 ? 0.02 : 0.18,
      };
    }

    if (overlappingColumns === 3) {
      const widths = [0.88, 0.74, 0.6];
      const positions = [0.02, 0.12, 0.28];

      return {
        width: widths[columnIndex] ?? 0.55,
        left: positions[columnIndex] ?? 0.38,
      };
    }

    return {
      width: Math.max(0.55, 0.72 - columnIndex * 0.06),
      left: Math.min(columnIndex * 0.1, 0.35),
    };
  }

  if (strategy === "no-overflow") {
    if (overlappingColumns === 1) {
      return { width: 1, left: 0 };
    }

    if (overlappingColumns === 2) {
      return { width: 0.495, left: columnIndex === 0 ? 0 : 0.505 };
    }

    if (overlappingColumns === 3) {
      return {
        width: 0.33,
        left: columnIndex === 0 ? 0 : columnIndex === 1 ? 0.34 : 0.67,
      };
    }

    if (overlappingColumns === 4) {
      return {
        width: 0.2475,
        left:
          columnIndex === 0
            ? 0
            : columnIndex === 1
              ? 0.255
              : columnIndex === 2
                ? 0.51
                : 0.765,
      };
    }
  }

  if (strategy === "simple-no-overflow" && overlappingColumns === 1) {
    return { width: 1, left: 0 };
  }

  if (strategy === "simple-no-overflow" && overlappingColumns === 2) {
    return { width: 0.495, left: columnIndex === 0 ? 0 : 0.505 };
  }

  const gap = 0.005;
  const totalGap = (overlappingColumns - 1) * gap;
  const availableWidth = 1 - totalGap;
  const width = availableWidth / overlappingColumns;

  return {
    width,
    left: columnIndex === 0 ? 0 : columnIndex * (width + gap),
  };
}

export function layoutTimelineEvents(
  events: CalendarEvent[],
  day: Date,
  {
    cellHeight,
    startHour = 0,
    minHeight = 22,
    sortByDurationOnTie = false,
    widthStrategy,
  }: TimelineLayoutOptions,
): PositionedTimelineEvent[] {
  const sortedEvents = sortTimelineEvents(events, sortByDurationOnTie);
  const columns: TimelineColumnEvent[][] = [];
  const eventColumnMapping = new Map<CalendarEvent, number>();

  sortedEvents.forEach((event) => {
    const adjustedInterval = getAdjustedEventInterval(event, day);
    let columnIndex = 0;
    let placed = false;

    while (!placed) {
      const column = columns[columnIndex] ?? [];

      if (column.length === 0) {
        columns[columnIndex] = column;
        placed = true;
      } else {
        const overlaps = column.some((columnEvent) =>
          areIntervalsOverlapping(adjustedInterval, {
            start: columnEvent.start,
            end: columnEvent.end,
          }),
        );

        if (!overlaps) {
          placed = true;
        } else {
          columnIndex++;
        }
      }
    }

    const currentColumn = columns[columnIndex] ?? [];
    columns[columnIndex] = currentColumn;
    currentColumn.push({ event, ...adjustedInterval });
    eventColumnMapping.set(event, columnIndex);
  });

  return sortedEvents.map((event) => {
    const adjustedInterval = getAdjustedEventInterval(event, day);
    const dayStart = startOfDay(day);
    const start = differenceInMinutes(adjustedInterval.start, dayStart) / 60;
    const end = differenceInMinutes(adjustedInterval.end, dayStart) / 60;
    const top = (start - startHour) * cellHeight;
    const height = Math.max((end - start) * cellHeight, minHeight);
    const columnIndex = eventColumnMapping.get(event) ?? 0;
    const overlappingColumns =
      sortedEvents.filter((otherEvent) => {
        if (otherEvent === event || otherEvent.id === event.id) return false;

        const otherInterval = getAdjustedEventInterval(otherEvent, day);
        return areIntervalsOverlapping(adjustedInterval, otherInterval);
      }).length + 1;
    const { width, left } = calculateWidth(
      widthStrategy,
      overlappingColumns,
      columnIndex,
    );

    return {
      event,
      top,
      height,
      left,
      width,
      zIndex: 10 + columnIndex,
    };
  });
}
