"use client";

import { cn } from "@workspace/ui/lib/utils";

export function Divider({ className }: { className?: string }) {
  return (
    <hr
      aria-hidden="true"
      className={cn(
        "h-px w-full border-0 bg-[var(--border-tertiary)]",
        className,
      )}
    />
  );
}

export default Divider;
