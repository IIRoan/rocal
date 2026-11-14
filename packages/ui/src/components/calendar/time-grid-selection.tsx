import type { TimeGridQuarterRange } from "./timeline-layout";

/** The range a pointer drag covers; it follows the pointer directly, so it has no transition. */
export function TimeGridSelection({ startQuarter, endQuarter }: TimeGridQuarterRange) {
  return (
    <div
      aria-hidden="true"
      data-time-grid-selection=""
      className="pointer-events-none absolute inset-x-0.5 top-0 z-40 rounded-sm border border-accent bg-accent/15"
      style={{
        transform: `translateY(calc(var(--week-cells-height) / 4 * ${startQuarter}))`,
        height: `calc(var(--week-cells-height) / 4 * ${endQuarter - startQuarter})`,
      }}
    />
  );
}
