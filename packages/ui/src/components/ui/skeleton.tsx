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
        default: "animate-pulse",
        shimmer: "animate-shimmer",
        wave: "animate-wave",
      }[variant]
    : "";

  return (
    <div
      data-slot="skeleton"
      className={cn(
        "bg-gradient-to-r from-accent/80 via-accent to-accent/80 rounded-md",
        variant === "shimmer" &&
          "bg-gradient-to-r from-accent/40 via-accent/80 to-accent/40 bg-[length:200%_100%]",
        variant === "wave" && "relative overflow-hidden bg-accent",
        animationClass,
        className,
      )}
      {...props}
    >
      {variant === "wave" && (
        <div className="absolute inset-0 -translate-x-full animate-wave bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      )}
    </div>
  );
}

export { Skeleton, type SkeletonProps };
