import React, { useEffect, useState, useRef, useCallback } from "react";

interface TransitionContainerProps {
  children: React.ReactNode;
  viewKey?: string;
}

const ENTER_MS = 160;
const HEIGHT_MS = 180;
const TRANSITION_EASING = "cubic-bezier(0, 0, 0.2, 1)";
const ENTER_OFFSET_PX = 4;

type Phase = "idle" | "pre-enter" | "entering";

export function TransitionContainer({
  children,
  viewKey,
}: TransitionContainerProps) {
  const [displayChildren, setDisplayChildren] = useState(children);
  const [phase, setPhase] = useState<Phase>("idle");
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const contentRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState<number | undefined>(
    undefined,
  );
  const [heightAnimating, setHeightAnimating] = useState(false);

  const measureHeight = useCallback(() => {
    return contentRef.current?.scrollHeight;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => {
      setPrefersReducedMotion(mediaQuery.matches);
    };

    updatePreference();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updatePreference);
      return () => mediaQuery.removeEventListener("change", updatePreference);
    }

    mediaQuery.addListener(updatePreference);
    return () => mediaQuery.removeListener(updatePreference);
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
  // without interrupting the initial fade-in frame of a view switch.
  const prevChildrenRef = useRef(children);
  useEffect(() => {
    if (children === prevChildrenRef.current) {
      return;
    }

    prevChildrenRef.current = children;

    if (phase !== "pre-enter") {
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

    const frameIds: number[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];

    const prevH = measureHeight();
    if (prevH !== undefined) {
      const frameId = requestAnimationFrame(() => {
        setContainerHeight(prevH);
      });
      frameIds.push(frameId);
    }

    setDisplayChildren(latestChildren.current);

    if (prefersReducedMotion) {
      const frameId = requestAnimationFrame(() => {
        const nextH = measureHeight();
        if (nextH !== undefined) {
          setContainerHeight(nextH);
        }
        setHeightAnimating(false);
        setPhase("idle");
      });
      frameIds.push(frameId);

      return () => {
        for (const queuedFrameId of frameIds) {
          cancelAnimationFrame(queuedFrameId);
        }
      };
    }

    setHeightAnimating(false);
    setPhase("pre-enter");

    const enterFrameId = requestAnimationFrame(() => {
      const measureFrameId = requestAnimationFrame(() => {
        const nextH = measureHeight();
        if (nextH !== undefined) {
          setHeightAnimating(true);
          setContainerHeight(nextH);
        }
        setPhase("entering");
      });

      frameIds.push(measureFrameId);
    });
    frameIds.push(enterFrameId);

    timers.push(
      setTimeout(() => {
        setPhase("idle");
        setHeightAnimating(false);
        const settledHeight = measureHeight();
        if (settledHeight !== undefined) {
          setContainerHeight(settledHeight);
        }
      }, Math.max(ENTER_MS, HEIGHT_MS)),
    );

    return () => {
      for (const queuedFrameId of frameIds) {
        cancelAnimationFrame(queuedFrameId);
      }
      for (const timer of timers) {
        clearTimeout(timer);
      }
    };
  }, [measureHeight, prefersReducedMotion, viewKey]);

  const contentStyle: React.CSSProperties =
    phase === "pre-enter"
      ? {
          opacity: 0,
          transform: `translateY(${ENTER_OFFSET_PX}px)`,
          willChange: "opacity, transform",
        }
      : phase === "entering"
        ? {
            opacity: 1,
            transform: "translateY(0)",
            willChange: "opacity, transform",
            transition: `opacity ${ENTER_MS}ms ${TRANSITION_EASING}, transform ${ENTER_MS}ms ${TRANSITION_EASING}`,
          }
        : { opacity: 1, transform: "translateY(0)" };

  return (
    <div
      className="relative overflow-hidden"
      style={{
        height: containerHeight !== undefined ? `${containerHeight}px` : "auto",
        transition:
          heightAnimating && !prefersReducedMotion
            ? `height ${HEIGHT_MS}ms ${TRANSITION_EASING}`
            : "none",
      }}
    >
      <div ref={contentRef} style={contentStyle}>
        {displayChildren}
      </div>
    </div>
  );
}
