import type { CSSProperties } from "react";

/** Shared by the main search view and every subview so the palette keeps its height while navigating. */
export const PALETTE_VIEW_STYLE: CSSProperties = {
  minHeight: "clamp(280px, 50svh, 420px)",
  maxHeight: "calc(100dvh - 80px)",
};

export const PALETTE_ROW_CLASS =
  "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-left outline-none transition-colors hover:bg-muted focus-visible:bg-muted disabled:pointer-events-none disabled:opacity-40 sm:min-h-9";

export const PALETTE_INPUT_CLASS =
  "h-9 w-full rounded-lg border-0 bg-muted px-3 text-[15px] text-foreground shadow-none outline-none transition-shadow placeholder:text-muted-foreground/60 focus:border-0 focus:shadow-none focus:ring-2 focus:ring-ring/25 disabled:opacity-50";
