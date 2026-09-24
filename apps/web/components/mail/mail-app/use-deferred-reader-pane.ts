"use client";

import { useEffect, useState } from "react";

/** Moves the reader two frames late so the heavy render (reader on open, wide list on close) is painted before the slide starts. */
export function useDeferredReaderPane(wantsOpen: boolean): boolean {
  const [open, setOpen] = useState(wantsOpen);

  useEffect(() => {
    if (wantsOpen === open) return;
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => setOpen(wantsOpen));
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [wantsOpen, open]);

  return open;
}
