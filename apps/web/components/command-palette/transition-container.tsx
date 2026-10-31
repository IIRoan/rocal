"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { usePrefersReducedMotion } from "@workspace/ui/hooks/use-prefers-reduced-motion";
import { slideFadeIn } from "@workspace/ui/lib/motion";
import { cn } from "@workspace/ui/lib/utils";

interface TransitionContainerProps {
  children: ReactNode;
  viewKey?: string;
  navigationDepth?: number;
  fill?: boolean;
}

const ENTER_MS = 200;
const ENTER_OFFSET_PX = 12;

export function TransitionContainer({
  children,
  viewKey,
  navigationDepth = 0,
  fill = false,
}: TransitionContainerProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const contentRef = useRef<HTMLDivElement>(null);
  const previousPageRef = useRef({ viewKey, navigationDepth });

  useLayoutEffect(() => {
    const previousPage = previousPageRef.current;
    previousPageRef.current = { viewKey, navigationDepth };

    if (
      viewKey === previousPage.viewKey ||
      prefersReducedMotion ||
      !contentRef.current
    ) {
      return;
    }

    const direction = navigationDepth < previousPage.navigationDepth ? -1 : 1;
    const animation = slideFadeIn(
      contentRef.current,
      { x: direction * ENTER_OFFSET_PX },
      { duration: ENTER_MS },
    );

    return () => animation?.cancel();
  }, [navigationDepth, prefersReducedMotion, viewKey]);

  return (
    <div className={cn("relative overflow-hidden", fill && "min-h-0 flex-1")}>
      <div ref={contentRef} className={fill ? "h-full min-h-0" : undefined}>
        {children}
      </div>
    </div>
  );
}
