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

function calculateEqualColumns(columnCount: number, columnIndex: number) {
  const width = 1 / columnCount;
  return {
    width,
    left: columnIndex * width,
  };
}

function buildOverlapClusters(
  events: CalendarEvent[],
  day: Date,
): Map<CalendarEvent, CalendarEvent[]> {
  const parent = new Map<CalendarEvent, CalendarEvent>();

  function find(event: CalendarEvent): CalendarEvent {
    let root = event;
    while (parent.get(root) !== root) {
      root = parent.get(root)!;
    }
    return root;
  }

  function union(a: CalendarEvent, b: CalendarEvent) {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) {
      parent.set(rootB, rootA);
    }
  }

  for (const event of events) {
    parent.set(event, event);
  }

  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const left = events[i]!;
      const right = events[j]!;

      if (
        areIntervalsOverlapping(
          getAdjustedEventInterval(left, day),
          getAdjustedEventInterval(right, day),
        )
      ) {
        union(left, right);
      }
    }
  }

  const clustersByRoot = new Map<CalendarEvent, CalendarEvent[]>();
  for (const event of events) {
    const root = find(event);
    const cluster = clustersByRoot.get(root) ?? [];
    cluster.push(event);
    clustersByRoot.set(root, cluster);
  }

  const eventCluster = new Map<CalendarEvent, CalendarEvent[]>();
  for (const event of events) {
    eventCluster.set(event, clustersByRoot.get(find(event)) ?? [event]);
  }

  return eventCluster;
}

function getClusterColumnCount(
  cluster: CalendarEvent[],
  eventColumnMapping: Map<CalendarEvent, number>,
) {
  let maxColumnIndex = 0;

  for (const event of cluster) {
    maxColumnIndex = Math.max(
      maxColumnIndex,
      eventColumnMapping.get(event) ?? 0,
    );
  }

  return maxColumnIndex + 1;
}

function calculateWidth(
  strategy: TimelineWidthStrategy,
  columnCount: number,
  columnIndex: number,
) {
  if (columnCount === 1) {
    if (strategy === "mobile-cascade") {
      return { width: 0.95, left: 0.02 };
    }

    return { width: 1, left: 0 };
  }

  if (strategy === "no-overflow" || strategy === "simple-no-overflow") {
    return calculateEqualColumns(columnCount, columnIndex);
  }

  if (strategy === "desktop-cascade") {
    if (columnCount <= 3) {
      return {
        width: (1 / columnCount) * 0.95,
        left: columnIndex * (1 / columnCount) + columnIndex * 0.01,
      };
    }

    const baseWidth = 0.75;
    const widthDecrement = Math.min(0.1, 0.5 / columnCount);
    const offsetIncrement = Math.min(0.15, 0.8 / columnCount);

    return {
      width: baseWidth - columnIndex * widthDecrement,
      left: columnIndex * offsetIncrement,
    };
  }

  if (strategy === "mobile-cascade") {
    if (columnCount === 2) {
      return {
        width: columnIndex === 0 ? 0.92 : 0.78,
        left: columnIndex === 0 ? 0.02 : 0.18,
      };
    }

    if (columnCount === 3) {
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

  const gap = 0.005;
  const totalGap = (columnCount - 1) * gap;
  const availableWidth = 1 - totalGap;
  const width = availableWidth / columnCount;

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

  const eventClusters = buildOverlapClusters(sortedEvents, day);
  const clusterColumnCounts = new Map<CalendarEvent, number>();

  for (const event of sortedEvents) {
    const cluster = eventClusters.get(event) ?? [event];
    clusterColumnCounts.set(
      event,
      getClusterColumnCount(cluster, eventColumnMapping),
    );
  }

  return sortedEvents.map((event) => {
    const adjustedInterval = getAdjustedEventInterval(event, day);
    const dayStart = startOfDay(day);
    const start = differenceInMinutes(adjustedInterval.start, dayStart) / 60;
    const end = differenceInMinutes(adjustedInterval.end, dayStart) / 60;
    const top = (start - startHour) * cellHeight;
    const height = Math.max((end - start) * cellHeight, minHeight);
    const columnIndex = eventColumnMapping.get(event) ?? 0;
    const columnCount = clusterColumnCounts.get(event) ?? 1;
    const { width, left } = calculateWidth(
      widthStrategy,
      columnCount,
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
