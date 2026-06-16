"use client";

import { cn } from "@workspace/ui/lib/utils";

const BODY_LINE_WIDTHS = [100, 94, 82, 90, 68, 76, 58] as const;

type MessageDecryptingSkeletonProps = {
  isDark?: boolean;
  attachedAbove?: boolean;
  className?: string;
};

export function MessageDecryptingSkeleton({
  isDark = false,
  attachedAbove = false,
  className,
}: MessageDecryptingSkeletonProps) {
  const bar = isDark ? "bg-white/10" : "bg-black/[0.06]";

  return (
    <div
      className={cn(
        "mx-4 mb-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/50",
        attachedAbove && "rounded-t-none border-t-0",
        className,
      )}
      aria-busy
      aria-label="Decrypting message"
    >
      <div
        className={cn(
          "relative min-h-[10rem] flex-1 px-5 py-4",
          isDark
            ? "bg-[#1a1a1a] [color-scheme:dark]"
            : "bg-white [color-scheme:light]",
        )}
      >
        <div
          className={cn(
            "pointer-events-none absolute inset-0 overflow-hidden",
            isDark ? "opacity-40" : "opacity-30",
          )}
          aria-hidden
        >
          <div className="decrypt-shimmer-band" />
        </div>

        <div className="relative space-y-2.5">
          {BODY_LINE_WIDTHS.map((width, index) => (
            <div
              key={width}
              className={cn("h-2.5 rounded-sm motion-safe:animate-pulse", bar)}
              style={{
                width: `${width}%`,
                animationDelay: `${index * 70}ms`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** @deprecated Use MessageDecryptingSkeleton */
export function MessageDecryptingLoader(props: MessageDecryptingSkeletonProps) {
  return <MessageDecryptingSkeleton {...props} />;
}

/** @deprecated Use MessageDecryptingSkeleton */
export function MessageDecryptingIndicator(props: MessageDecryptingSkeletonProps) {
  return <MessageDecryptingSkeleton {...props} />;
}
