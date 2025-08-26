interface SkeletonProps extends React.ComponentProps<"div"> {
    variant?: "default" | "shimmer" | "wave";
    animate?: boolean;
}
declare function Skeleton({ className, variant, animate, ...props }: SkeletonProps): import("react").JSX.Element;
export { Skeleton, type SkeletonProps };
//# sourceMappingURL=skeleton.d.ts.map