"use client";

import * as React from "react";

import { cn } from "@workspace/ui/lib/utils";

export interface SurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  level?: 1 | 2 | 3;
}

export function Surface({
  className,
  level = 2,
  ...props
}: SurfaceProps) {
  const bg =
    level === 1
      ? "bg-[var(--bg-l1-solid)]"
      : level === 3
        ? "bg-[var(--bg-l3-solid)]"
        : "bg-[var(--bg-l2-solid)]";
  return (
    <div
      className={cn(
        bg,
        "border border-[var(--border-secondary)] shadow-[var(--shadow-l1)]",
        className,
      )}
      {...props}
    />
  );
}

export default Surface;
