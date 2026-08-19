import type { EventsResponse } from "@workspace/calendar-core";
import {
  getMiniCalendarSwipeTarget,
  retainMonthEvents,
  type MiniCalendarSwipeTargetInput,
} from "./sidebar-mini-calendar-utils";

function createResponse(eventId: string): EventsResponse {
  return {
    events: [
      {
        id: eventId,
        title: eventId,
        start: new Date(2026, 7, 12, 9, 0, 0),
        end: new Date(2026, 7, 12, 10, 0, 0),
        calendarId: "calendar-1",
        userId: "user-1",
        createdAt: new Date(2026, 7, 1),
        updatedAt: new Date(2026, 7, 1),
      },
    ],
    calendars: [
      {
        id: "calendar-1",
        name: "Personal",
        color: "teal",
        kind: "owned",
        isPublic: false,
        isVisible: true,
        isDefault: false,
        isSyncOnly: false,
        userId: "user-1",
        createdAt: new Date(2026, 7, 1),
        updatedAt: new Date(2026, 7, 1),
      },
    ],
    categories: [],
  };
}

describe("retainMonthEvents", () => {
  it("keeps a month's events while its next fetch is still empty", () => {
    const cache = new Map();
    const retained = retainMonthEvents(cache, "2026-08", createResponse("aug"));

    expect(retainMonthEvents(cache, "2026-08", undefined)).toBe(retained);
    expect(retained.map((event) => event.id)).toEqual(["aug"]);
  });

  it("does not paint another month's events onto a page that has not loaded yet", () => {
    const cache = new Map();
    retainMonthEvents(cache, "2026-08", createResponse("aug"));

    expect(retainMonthEvents(cache, "2026-09", undefined)).toEqual([]);
  });
});

const PAGE_WIDTH = 300;
const MIN_INDEX = 0;
const MAX_INDEX = 4;

function swipe(overrides: Partial<MiniCalendarSwipeTargetInput>) {
  return getMiniCalendarSwipeTarget({
    startIndex: 2,
    currentIndex: 2,
    translationX: 0,
    velocityX: 0,
    pageWidth: PAGE_WIDTH,
    minIndex: MIN_INDEX,
    maxIndex: MAX_INDEX,
    commitVelocity: 600,
    momentumSeconds: 0.16,
    ...overrides,
  });
}

describe("getMiniCalendarSwipeTarget", () => {
  it("snaps back to the nearest page for a slow release before halfway", () => {
    expect(
      swipe({ currentIndex: 2.4, translationX: -0.4 * PAGE_WIDTH }),
    ).toBe(2);
  });

  it("commits one page for a slow release past halfway", () => {
    expect(
      swipe({ currentIndex: 2.6, translationX: -0.6 * PAGE_WIDTH }),
    ).toBe(3);
  });

  it("commits one page on a decisive flick even with little travel", () => {
    expect(swipe({ currentIndex: 2.05, translationX: -15, velocityX: -1200 })).toBe(3);
    expect(swipe({ currentIndex: 1.95, translationX: 15, velocityX: 1200 })).toBe(1);
  });

  it("carries a hard flick across more than one page", () => {
    expect(
      swipe({ currentIndex: 2.5, translationX: -150, velocityX: -3000 }),
    ).toBe(4);
  });

  it("never settles outside the rendered window", () => {
    expect(
      swipe({
        startIndex: 3.5,
        currentIndex: 3.9,
        translationX: -120,
        velocityX: -2400,
      }),
    ).toBe(4);
    expect(swipe({ startIndex: 0.2, currentIndex: 0.1, velocityX: 2400, translationX: 30 })).toBe(0);
  });

  it("clamps extreme flicks to the window bounds on absolute indices", () => {
    // Hard flick toward next months clamps to the window's max index. The
    // release point sits within a radius of the edge so the window (not the
    // near-release clamp) is what bites.
    expect(
      swipe({
        startIndex: -11.5,
        currentIndex: -11.5,
        translationX: -120,
        velocityX: -6000,
        minIndex: -14,
        maxIndex: -10,
      }),
    ).toBe(-10);
    // Hard flick toward previous months clamps to the window's min index.
    expect(
      swipe({
        startIndex: -12.5,
        currentIndex: -12.5,
        translationX: 60,
        velocityX: 6000,
        minIndex: -14,
        maxIndex: -10,
      }),
    ).toBe(-14);
  });

  it("never settles more than a window radius from the release point", () => {
    // From the middle of the window a hard flick is capped two pages forward,
    // keeping the committed month inside the next rendered window.
    expect(
      swipe({
        startIndex: -12,
        currentIndex: -12,
        translationX: -10,
        velocityX: -6000,
        minIndex: -14,
        maxIndex: -10,
      }),
    ).toBe(-10);
    expect(
      swipe({
        startIndex: -13.9,
        currentIndex: -13.9,
        translationX: -10,
        velocityX: -6000,
        minIndex: -14,
        maxIndex: -10,
      }),
    ).toBe(-12);
  });

  it("finishes an interrupted settle before continuing on the next flick", () => {
    const finishing = swipe({
      startIndex: 2.6,
      currentIndex: 2.55,
      translationX: -15,
      velocityX: -800,
    });
    expect(finishing).toBe(3);

    const continuing = swipe({
      startIndex: 2.6,
      currentIndex: 2.62,
      translationX: -20,
      velocityX: -2000,
    });
    expect(continuing).toBe(4);
  });

  it("lets a throw-back release give the interrupted page back", () => {
    expect(
      swipe({ startIndex: 2.4, currentIndex: 2.2, translationX: 60, velocityX: 700 }),
    ).toBe(2);
  });
});
