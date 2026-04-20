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

  const contentRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState<number | undefined>(
    undefined,
  );
  const [heightAnimating, setHeightAnimating] = useState(false);

  const measureHeight = useCallback(() => {
    return contentRef.current?.scrollHeight;
  }, []);

  // Keep a ref to latest children so transition timers can read fresh content
  const latestChildren = useRef(children);
  useEffect(() => {
    latestChildren.current = children;
  }, [children]);

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
  const prevChildrenRef = useRef(children);
  useEffect(() => {
    if (children === prevChildrenRef.current) {
      return;
    }

    prevChildrenRef.current = children;

    if (phase !== "exiting") {
      const frameId = requestAnimationFrame(() => {
        setDisplayChildren(children);
      });
      return () => cancelAnimationFrame(frameId);
    }
  }, [children, phase]);

  // Handle view transitions — only runs when viewKey changes
  const prevViewKeyRef = useRef(viewKey);
  useEffect(() => {
    if (viewKey === prevViewKeyRef.current) {
      return;
    }

    prevViewKeyRef.current = viewKey;

    const frameId = requestAnimationFrame(() => {
      setHeightAnimating(false);
      setPhase("exiting");
    });

    return () => cancelAnimationFrame(frameId);
  }, [viewKey]);

  // Lock height when entering exiting phase, then schedule the transition timers
  useEffect(() => {
    if (phase !== "exiting") return;

    const frameIds: number[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];

    // Lock current height before anything changes
    const prevH = measureHeight();
    if (prevH !== undefined) {
      const frameId = requestAnimationFrame(() => {
        setContainerHeight(prevH);
      });
      frameIds.push(frameId);
    }

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
              setHeightAnimating(true);
              setContainerHeight(newH);
            }
          });
        });
      }, EXIT_MS),
    );

    // Phase 3: Settle — transition complete
    timers.push(
      setTimeout(
        () => {
          setPhase("idle");
          setHeightAnimating(false);
          const h = measureHeight();
          if (h !== undefined) setContainerHeight(h);
        },
        EXIT_MS + Math.max(ENTER_MS, HEIGHT_MS),
      ),
    );
    return () => {
      for (const frameId of frameIds) {
        cancelAnimationFrame(frameId);
      }
      for (const timer of timers) {
        clearTimeout(timer);
      }
    };
  }, [phase, measureHeight]);

  // Compute inline styles for the content based on phase
  const contentStyle: React.CSSProperties =
    phase === "exiting"
      ? {
          opacity: 0,
          transform: `translateX(${direction === "forward" ? "-8px" : "8px"})`,
          transition: `opacity ${EXIT_MS}ms ease-out, transform ${EXIT_MS}ms ease-out`,
        }
      : phase === "entering"
        ? {
            opacity: 1,
            transform: "translateX(0)",
            transition: `opacity ${ENTER_MS}ms ease-in, transform ${ENTER_MS}ms ease-in`,
          }
        : { opacity: 1, transform: "translateX(0)" };

  return (
    <div
      className="relative overflow-hidden"
      style={{
        height: containerHeight !== undefined ? `${containerHeight}px` : "auto",
        transition: heightAnimating
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
