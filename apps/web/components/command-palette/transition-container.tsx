import React, { useEffect, useState, useRef } from "react";
import { gsap } from "@workspace/ui/lib/gsap";
import { usePrefersReducedMotion } from "@workspace/ui/hooks";

interface TransitionContainerProps {
  children: React.ReactNode;
  viewKey?: string;
}

const ENTER_MS = 160;
const HEIGHT_MS = 180;
const ENTER_OFFSET_PX = 4;

export function TransitionContainer({
  children,
  viewKey,
}: TransitionContainerProps) {
  const [displayChildren, setDisplayChildren] = useState(children);
  const prefersReducedMotion = usePrefersReducedMotion();

  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const activeTimelineRef = useRef<gsap.core.Timeline | null>(null);

  // Keep a ref to latest children so transition timers can read fresh content
  const latestChildren = useRef(children);
  useEffect(() => {
    latestChildren.current = children;
  }, [children]);

  // Passive height tracking: when the active view's content resizes (e.g.
  // async list growth, expanding a row) without a viewKey change, smoothly
  // animate the container height instead of snapping. Skipped while a
  // viewKey transition timeline is in flight, since that timeline owns the
  // height.
  const isTransitioningRef = useRef(false);
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const container = containerRef.current;
    const content = contentRef.current;

    if (!container || !content) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      if (isTransitioningRef.current) {
        return;
      }

      const entry = entries[0];
      if (!entry) {
        return;
      }

      const nextHeight =
        entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;

      if (nextHeight <= 0) {
        return;
      }

      const currentHeight = container.getBoundingClientRect().height;

      if (Math.abs(currentHeight - nextHeight) < 0.5) {
        return;
      }

      if (prefersReducedMotion) {
        gsap.set(container, { height: "auto" });
        return;
      }

      gsap.to(container, {
        height: nextHeight,
        duration: HEIGHT_MS / 1000,
        ease: "power2.out",
        overwrite: "auto",
        onComplete: () => {
          gsap.set(container, { height: "auto" });
        },
      });
    });

    observer.observe(content);

    return () => {
      observer.disconnect();
    };
  }, [prefersReducedMotion]);

  // Update displayed content for same-view changes (e.g. data refetch)
  // without interrupting the initial fade-in frame of a view switch.
  const prevChildrenRef = useRef(children);
  useEffect(() => {
    if (children === prevChildrenRef.current) {
      return;
    }

    prevChildrenRef.current = children;

    const frameId = requestAnimationFrame(() => {
      setDisplayChildren(children);
    });
    return () => cancelAnimationFrame(frameId);
  }, [children]);

  // Handle view transitions — only runs when viewKey changes
  const prevViewKeyRef = useRef(viewKey);
  useEffect(() => {
    if (viewKey === prevViewKeyRef.current) {
      return;
    }

    prevViewKeyRef.current = viewKey;

    const container = containerRef.current;
    const currentContent = contentRef.current;

    setDisplayChildren(latestChildren.current);

    if (!container || !currentContent) {
      return;
    }

    activeTimelineRef.current?.kill();

    const previousHeight = currentContent.scrollHeight;
    isTransitioningRef.current = true;
    gsap.set(container, { height: previousHeight, overflow: "hidden" });

    const frameId = requestAnimationFrame(() => {
      const nextContent = contentRef.current;

      if (!nextContent) {
        isTransitioningRef.current = false;
        return;
      }

      const nextHeight = nextContent.scrollHeight;

      if (prefersReducedMotion) {
        gsap.set(container, { height: "auto", clearProps: "overflow" });
        isTransitioningRef.current = false;
        return;
      }

      activeTimelineRef.current = gsap.timeline({
        defaults: { ease: "power2.out" },
        onComplete: () => {
          gsap.set(container, { height: "auto", clearProps: "overflow" });
          isTransitioningRef.current = false;
        },
      });

      activeTimelineRef.current
        .fromTo(
          nextContent,
          { autoAlpha: 0, y: ENTER_OFFSET_PX },
          {
            autoAlpha: 1,
            y: 0,
            duration: ENTER_MS / 1000,
            clearProps: "opacity,transform",
          },
          0,
        )
        .to(
          container,
          {
            height: nextHeight,
            duration: HEIGHT_MS / 1000,
          },
          0,
        );
    });

    return () => {
      cancelAnimationFrame(frameId);
      activeTimelineRef.current?.kill();
      isTransitioningRef.current = false;
    };
  }, [prefersReducedMotion, viewKey]);

  return (
    <div ref={containerRef} className="relative overflow-hidden">
      <div ref={contentRef}>{displayChildren}</div>
    </div>
  );
}
