import * as fc from "fast-check";
import {
  getMiniCalendarPagerWindow,
  rubberBandPagerPosition,
  MINI_CALENDAR_WINDOW_RADIUS,
} from "./sidebar-mini-calendar-pager";
import { getMiniCalendarSwipeTarget } from "./sidebar-mini-calendar-utils";

const PAGE_WIDTH = 300;
const COMMIT_VELOCITY = 600;
const MOMENTUM_SECONDS = 0.16;
const RUBBER_BAND_FACTOR = 0.3;

describe("getMiniCalendarPagerWindow", () => {
  it("centers the rendered window on the committed index", () => {
    expect(getMiniCalendarPagerWindow(0, MINI_CALENDAR_WINDOW_RADIUS)).toEqual({
      start: -2,
      end: 2,
    });
    expect(
      getMiniCalendarPagerWindow(41, MINI_CALENDAR_WINDOW_RADIUS),
    ).toEqual({ start: 39, end: 43 });
    expect(
      getMiniCalendarPagerWindow(-7, MINI_CALENDAR_WINDOW_RADIUS),
    ).toEqual({ start: -9, end: -5 });
  });
});

describe("rubberBandPagerPosition", () => {
  it("is the identity inside the window", () => {
    expect(rubberBandPagerPosition(1.25, -2, 2, RUBBER_BAND_FACTOR)).toBe(1.25);
    expect(rubberBandPagerPosition(-2, -2, 2, RUBBER_BAND_FACTOR)).toBe(-2);
    expect(rubberBandPagerPosition(2, -2, 2, RUBBER_BAND_FACTOR)).toBe(2);
  });

  it("attenuates overshoot past either edge", () => {
    expect(rubberBandPagerPosition(3, -2, 2, RUBBER_BAND_FACTOR)).toBeCloseTo(
      2.3,
      10,
    );
    expect(rubberBandPagerPosition(-3, -2, 2, RUBBER_BAND_FACTOR)).toBeCloseTo(
      -2.3,
      10,
    );
  });
});

function settleTarget(
  committed: number,
  startIndex: number,
  currentIndex: number,
  translationX: number,
  velocityX: number,
) {
  return getMiniCalendarSwipeTarget({
    startIndex,
    currentIndex,
    translationX,
    velocityX,
    pageWidth: PAGE_WIDTH,
    minIndex: committed - MINI_CALENDAR_WINDOW_RADIUS,
    maxIndex: committed + MINI_CALENDAR_WINDOW_RADIUS,
    commitVelocity: COMMIT_VELOCITY,
    momentumSeconds: MOMENTUM_SECONDS,
  });
}

/**
 * Flicker regression: the pager commits by re-centering the rendered month
 * window, never by re-positioning the strip. These properties assert that,
 * for any realistic flick sequence — including settles interrupted mid-flight
 * by the next finger — every page the viewport can show is always inside the
 * rendered window, so no recycle can ever flash a wrong/blank month frame.
 */
describe("mini calendar pager window coverage", () => {
  const arbDragDelta = fc.double({ min: -3, max: 3, noNaN: true, noDefaultInfinity: true });
  const arbVelocity = fc.double({ min: -5000, max: 5000, noNaN: true, noDefaultInfinity: true });
  const arbSettleProgress = fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true });

  it("keeps the settle target inside the committed window", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -36, max: 36 }),
        arbDragDelta,
        arbVelocity,
        (committed, dragDelta, velocityX) => {
          const min = committed - MINI_CALENDAR_WINDOW_RADIUS;
          const max = committed + MINI_CALENDAR_WINDOW_RADIUS;
          const position = rubberBandPagerPosition(
            committed + dragDelta,
            min,
            max,
            RUBBER_BAND_FACTOR,
          );

          const target = settleTarget(
            committed,
            committed,
            position,
            -dragDelta * PAGE_WIDTH,
            velocityX,
          );

          expect(target).toBeGreaterThanOrEqual(min);
          expect(target).toBeLessThanOrEqual(max);
        },
      ),
      { numRuns: 2000 },
    );
  });

  it("keeps the viewport covered across rapid flicks with interrupted settles", () => {
    const arbFlick = fc.record({
      drag: arbDragDelta,
      velocity: arbVelocity,
      settleProgress: arbSettleProgress,
    });

    fc.assert(
      fc.property(
        fc.array(arbFlick, { minLength: 1, maxLength: 40 }),
        (flicks) => {
          let committed = 0;
          let position = 0;
          let window = getMiniCalendarPagerWindow(committed, MINI_CALENDAR_WINDOW_RADIUS);

          for (const flick of flicks) {
            // Drag — the gesture clamps the strip to the rendered window.
            const dragStart = position;
            const dragged = rubberBandPagerPosition(
              dragStart + flick.drag,
              window.start,
              window.end,
              RUBBER_BAND_FACTOR,
            );

            // Release — commit happens at release, inside the window bounds.
            const target = settleTarget(
              committed,
              dragStart,
              dragged,
              -flick.drag * PAGE_WIDTH,
              flick.velocity,
            );
            committed = target;

            // The settle may be interrupted by the next finger at any point.
            position = dragged + (target - dragged) * flick.settleProgress;

            // Re-render recenters the window; the strip itself does not move.
            window = getMiniCalendarPagerWindow(committed, MINI_CALENDAR_WINDOW_RADIUS);

            // Every page under and beside the viewport is rendered — a
            // necessary condition for the recycle to be invisible.
            expect(Math.floor(position)).toBeGreaterThanOrEqual(window.start - 1);
            expect(Math.ceil(position)).toBeLessThanOrEqual(window.end + 1);
            expect(committed).toBeGreaterThanOrEqual(window.start);
            expect(committed).toBeLessThanOrEqual(window.end);
          }
        },
      ),
      { numRuns: 500 },
    );
  });
});
