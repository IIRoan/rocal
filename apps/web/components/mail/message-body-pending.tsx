"use client";

import { cn } from "@workspace/ui/lib/utils";
import { mailBodySurfaceClassName } from "./message-reader/constants";

/** The empty body surface a message fades into once it loads or decrypts; it holds the body's box so nothing moves. */
export function MessageBodyPending({
  isDark = false,
  label = "Decrypting message…",
}: {
  isDark?: boolean;
  label?: string;
}) {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--border-secondary)]"
      aria-busy
    >
      <output className="sr-only">{label}</output>
      <div className={cn("min-h-[10rem] flex-1", mailBodySurfaceClassName(isDark))} />
    </div>
  );
}
