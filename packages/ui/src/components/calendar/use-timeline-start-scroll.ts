import { useLayoutEffect, type RefObject } from "react";
import { DefaultStartHour, StartHour, WeekCellsHeight } from "./constants";

/** Jumps a timeline to the default start hour whenever its date changes. */
export function useTimelineStartScroll(
  scrollContainerRef: RefObject<HTMLDivElement | null>,
  currentDate: Date,
) {
  useLayoutEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop =
        (DefaultStartHour - StartHour) * WeekCellsHeight;
    }
  }, [scrollContainerRef, currentDate]);
}
