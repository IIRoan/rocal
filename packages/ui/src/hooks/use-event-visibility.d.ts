interface EventVisibilityOptions {
    eventHeight: number;
    eventGap: number;
}
interface EventVisibilityResult {
    contentRef: React.RefObject<HTMLDivElement>;
    contentHeight: number | null;
    getVisibleEventCount: (totalEvents: number) => number;
}
/**
 * Hook for calculating event visibility based on container height
 * Uses ResizeObserver for efficient updates
 */
export declare function useEventVisibility({ eventHeight, eventGap, }: EventVisibilityOptions): EventVisibilityResult;
export {};
//# sourceMappingURL=use-event-visibility.d.ts.map