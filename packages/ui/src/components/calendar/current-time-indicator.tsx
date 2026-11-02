"use client";

import React from "react";

import { cn } from "../../lib/utils";

type CurrentTimeIndicatorVariant = "primary" | "destructive" | "calendar-accent";

interface CurrentTimeIndicatorProps {
  position: number;
  variant?: CurrentTimeIndicatorVariant;
  label?: string;
  showEndDot?: boolean;
  className?: string;
}

const indicatorVariantClass: Record<CurrentTimeIndicatorVariant, string> = {
  primary: "bg-accent",
  destructive: "bg-destructive",
  "calendar-accent": "bg-[var(--calendar-accent)]",
};

export function CurrentTimeIndicator({
  position,
  variant = "primary",
  label,
  showEndDot = false,
  className,
}: CurrentTimeIndicatorProps) {
  const indicatorClassName = indicatorVariantClass[variant];

  return (
    <div
      className={cn(
        "pointer-events-none absolute right-0 left-0 z-20",
        className,
      )}
      style={{ top: `${position}%` }}
    >
      <div className="relative flex items-center">
        {label ? (
          <div
            className={cn(
              indicatorClassName,
              "text-accent-foreground absolute -left-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums shadow-sm",
            )}
          >
            {label}
          </div>
        ) : (
          <div
            className={cn(
              indicatorClassName,
              "absolute -left-1 size-2 rounded-full",
            )}
          />
        )}
        <div className={cn(indicatorClassName, "h-[2px] w-full shadow-sm")} />
        {showEndDot && (
          <div
            className={cn(
              indicatorClassName,
              "absolute -right-1 size-2.5 rounded-full shadow-sm",
            )}
          />
        )}
      </div>
    </div>
  );
}
