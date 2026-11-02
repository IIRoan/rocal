"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { usePrefersReducedMotion } from "@workspace/ui/hooks";
import { followPageScroll } from "@workspace/ui/lib/motion";

/** Stays one viewport tall beside content of any length, with spare image height that drifts as the page scrolls. */
export function PublicPageWallpaper() {
  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const frame = frameRef.current;
    const image = imageRef.current;
    if (!frame || !image || prefersReducedMotion) return;
    return followPageScroll(image, frame);
  }, [prefersReducedMotion]);

  return (
    <div className="sticky top-0 h-dvh p-4">
      <div
        ref={frameRef}
        className="relative size-full overflow-hidden rounded-2xl border border-border"
      >
        <div
          ref={imageRef}
          className="absolute inset-x-0 top-0 h-[120%] transition-transform duration-300 ease-out will-change-transform"
        >
          <Image
            src="/wallpaper.jpg"
            alt=""
            className="size-full object-cover"
            fill
            sizes="50vw"
            unoptimized
          />
        </div>
      </div>
    </div>
  );
}
