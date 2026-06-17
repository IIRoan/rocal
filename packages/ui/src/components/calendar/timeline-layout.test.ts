import { describe, expect, it } from "@jest/globals";

import type { CalendarEvent } from "./types";
import { layoutTimelineEvents } from "./timeline-layout";

function makeEvent(
  id: string,
  start: string,
  end: string,
): CalendarEvent {
  return {
    id,
    title: id,
    start: new Date(start),
    end: new Date(end),
    calendarId: "cal-1",
  };
}

function assertNoHorizontalOverlap(
  positioned: ReturnType<typeof layoutTimelineEvents>,
) {
  for (let i = 0; i < positioned.length; i++) {
    for (let j = i + 1; j < positioned.length; j++) {
      const a = positioned[i]!;
      const b = positioned[j]!;

      const aTop = a.top;
      const aBottom = a.top + a.height;
      const bTop = b.top;
      const bBottom = b.top + b.height;
      const verticallyOverlapping = aTop < bBottom && bTop < aBottom;

      if (!verticallyOverlapping) continue;

      const aRight = a.left + a.width;
      const bRight = b.left + b.width;
      const horizontallyOverlapping = a.left < bRight && b.left < aRight;

      expect(horizontallyOverlapping).toBe(false);
    }
  }
}

describe("layoutTimelineEvents", () => {
  const day = new Date("2026-06-16T00:00:00");
  const layoutOptions = {
    cellHeight: 72,
    widthStrategy: "no-overflow" as const,
  };

  it("uses equal 50% columns when one long event spans two non-overlapping events", () => {
    const events = [
      makeEvent("long", "2026-06-16T07:00:00", "2026-06-16T17:15:00"),
      makeEvent("short-a", "2026-06-16T07:00:00", "2026-06-16T09:30:00"),
      makeEvent("short-b", "2026-06-16T15:00:00", "2026-06-16T16:00:00"),
    ];

    const positioned = layoutTimelineEvents(events, day, layoutOptions);
    const byId = Object.fromEntries(
      positioned.map((item) => [item.event.id, item]),
    );

    expect(byId.long).toMatchObject({ left: 0, width: 0.5 });
    expect(byId["short-a"]).toMatchObject({ left: 0.5, width: 0.5 });
    expect(byId["short-b"]).toMatchObject({ left: 0.5, width: 0.5 });
    assertNoHorizontalOverlap(positioned);
  });

  it("uses equal thirds for three simultaneously overlapping events", () => {
    const events = [
      makeEvent("a", "2026-06-16T14:00:00", "2026-06-16T15:00:00"),
      makeEvent("b", "2026-06-16T14:15:00", "2026-06-16T17:15:00"),
      makeEvent("c", "2026-06-16T14:00:00", "2026-06-16T16:00:00"),
    ];

    const positioned = layoutTimelineEvents(events, day, layoutOptions);

    expect(positioned).toHaveLength(3);
    for (const item of positioned) {
      expect(item.width).toBeCloseTo(1 / 3, 5);
    }

    const leftPositions = positioned.map((item) => item.left).sort((a, b) => a - b);
    expect(leftPositions[0]).toBeCloseTo(0, 5);
    expect(leftPositions[1]).toBeCloseTo(1 / 3, 5);
    expect(leftPositions[2]).toBeCloseTo(2 / 3, 5);
    assertNoHorizontalOverlap(positioned);
  });

  it("keeps isolated events full width", () => {
    const events = [
      makeEvent("solo", "2026-06-16T09:00:00", "2026-06-16T10:00:00"),
    ];

    const positioned = layoutTimelineEvents(events, day, layoutOptions);

    expect(positioned[0]).toMatchObject({ left: 0, width: 1 });
  });
});
