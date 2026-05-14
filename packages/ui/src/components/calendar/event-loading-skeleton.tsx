"use client";

import { AppLoadingState } from "../ui/app-loading-state";
import { cn } from "../../lib/utils";
import type { CalendarView } from "./types";

interface EventLoadingSkeletonProps {
  view?: CalendarView;
  className?: string;
  showSpinner?: boolean;
  compactView?: boolean;
}

export function EventLoadingSkeleton({ className }: EventLoadingSkeletonProps) {
  return (
    <div
      className={cn(
        "absolute inset-0 z-10 flex items-center justify-center bg-background/50 backdrop-blur-[1px]",
        className,
      )}
    >
      <AppLoadingState variant="centered" text="Loading your workspace..." />
    </div>
  );
}
