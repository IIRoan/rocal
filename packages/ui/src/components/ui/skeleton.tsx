import { cn } from "@workspace/ui/lib/utils";

interface SkeletonProps extends React.ComponentProps<"div"> {
  variant?: "default" | "shimmer" | "wave";
  animate?: boolean;
}

function Skeleton({
  className,
  variant = "default",
  animate = true,
  ...props
}: SkeletonProps) {
  const animationClass = animate
    ? {
        default: "[animation:pulse_1.8s_ease-in-out_infinite]",
        shimmer: "motion-safe:[animation:shimmer_1.5s_ease-in-out_infinite]",
        wave: "motion-safe:[animation:wave_2.4s_ease-in-out_infinite]",
      }[variant]
    : "";

  return (
    <div
      data-slot="skeleton"
      className={cn(
        "bg-hover rounded-md",
        variant === "shimmer" &&
          // repo-rules-allow theme-tokens-only: shimmer sweep is inherently a moving accent gradient, not a flat surface.
          "bg-gradient-to-r from-hover/40 via-hover/80 to-hover/40 bg-[length:200%_100%]",
        variant === "wave" && "relative overflow-hidden bg-hover",
        animationClass,
        className,
      )}
      {...props}
    >
      {variant === "wave" && (
        // repo-rules-allow theme-tokens-only: wave highlight streak must read lighter than the surface in both themes, which no token provides.
        <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent motion-safe:[animation:wave_2.4s_ease-in-out_infinite]" />
      )}
    </div>
  );
}

export { Skeleton, type SkeletonProps };
