"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { MOTION_EASING, slideFadeIn } from "../../lib/motion";

/** Snaps open then fades in; closes instantly so siblings never reflow under a fading ghost. */
export function AnimatedCollapse({
  isOpen,
  children,
}: {
  isOpen: boolean;
  children: ReactNode;
}) {
  const sectionRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!isOpen || !section) return;
    const animation = slideFadeIn(section, { y: -8 }, {
      duration: 220,
      easing: MOTION_EASING.soft,
    });
    return () => animation?.cancel();
  }, [isOpen]);

  if (!isOpen) return null;

  return <div ref={sectionRef}>{children}</div>;
}
