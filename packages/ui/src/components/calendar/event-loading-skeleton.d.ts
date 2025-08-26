interface EventLoadingSkeletonProps {
    view?: "month" | "week" | "day" | "agenda";
    className?: string;
    showSpinner?: boolean;
    compactView?: boolean;
}
export declare function EventLoadingSkeleton({ view, className, showSpinner, compactView }: EventLoadingSkeletonProps): import("react").JSX.Element | null;
export declare function QuickEventSkeleton({ count, className }: {
    count?: number;
    className?: string;
}): import("react").JSX.Element;
export {};
//# sourceMappingURL=event-loading-skeleton.d.ts.map