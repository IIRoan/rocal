import React, { useEffect, useState, useRef, useCallback } from "react";

interface TransitionContainerProps {
  direction: "forward" | "back";
  children: React.ReactNode;
  viewKey?: string;
}

// Timing constants
const EXIT_MS = 70; // old content fades out
const ENTER_MS = 140; // new content fades in
const HEIGHT_MS = 300; // container height animates
const HEIGHT_EASING = "cubic-bezier(0.25, 1, 0.5, 1)"; // fast start, gentle settle

type Phase = "idle" | "exiting" | "entering";

export function TransitionContainer({
  direction,
  children,
  viewKey,
}: TransitionContainerProps) {
  const [displayChildren, setDisplayChildren] = useState(children);
  const [phase, setPhase] = useState<Phase>("idle");

  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const lastViewKey = useRef(viewKey);
  const [containerHeight, setContainerHeight] = useState<number | undefined>(
    undefined
  );
  const heightAnimating = useRef(false);

  const measureHeight = useCallback(() => {
    return contentRef.current?.scrollHeight;
  }, []);

  // Keep a ref to latest children so transition timers can read fresh content
  const latestChildren = useRef(children);
  latestChildren.current = children;

  // Track height passively when idle (handles within-view resizes)
  useEffect(() => {
    if (phase !== "idle" || !contentRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h =
          entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
        if (h > 0) setContainerHeight(h);
      }
    });
    observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, [phase]);

  // Update displayed content for same-view changes (e.g. data refetch)
  // Only when not in the middle of an exit transition
  useEffect(() => {
    if (phase !== "exiting") {
      setDisplayChildren(children);
    }
  }, [children, phase]);

  // Handle view transitions — only runs when viewKey changes
  useEffect(() => {
    if (viewKey === lastViewKey.current) return;

    lastViewKey.current = viewKey;

    // Lock current height before anything changes
    const prevH = measureHeight();
    if (prevH !== undefined) {
      heightAnimating.current = false;
      setContainerHeight(prevH);
    }

    // Phase 1: Fade out current content
    setPhase("exiting");

    const timers: ReturnType<typeof setTimeout>[] = [];

    // Phase 2: After exit, swap content + start height animation + fade in
    timers.push(
      setTimeout(() => {
        setDisplayChildren(latestChildren.current);
        setPhase("entering");

        // Measure new content height after React renders it
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const newH = measureHeight();
            if (newH !== undefined) {
              heightAnimating.current = true;
              setContainerHeight(newH);
            }
          });
        });
      }, EXIT_MS)
    );

    // Phase 3: Settle — transition complete
    timers.push(
      setTimeout(() => {
        setPhase("idle");
        heightAnimating.current = false;
        const h = measureHeight();
        if (h !== undefined) setContainerHeight(h);
      }, EXIT_MS + Math.max(ENTER_MS, HEIGHT_MS))
    );

    return () => timers.forEach(clearTimeout);
  }, [viewKey, measureHeight]);

  // Compute inline styles for the content based on phase
  const contentStyle: React.CSSProperties =
    phase === "exiting"
      ? { opacity: 0, transition: `opacity ${EXIT_MS}ms ease-out` }
      : phase === "entering"
        ? { opacity: 1, transition: `opacity ${ENTER_MS}ms ease-in` }
        : { opacity: 1 };

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden"
      style={{
        height:
          containerHeight !== undefined ? `${containerHeight}px` : "auto",
        transition: heightAnimating.current
          ? `height ${HEIGHT_MS}ms ${HEIGHT_EASING}`
          : "none",
      }}
    >
      <div ref={contentRef} style={contentStyle}>
        {displayChildren}
      </div>
    </div>
  );
}
