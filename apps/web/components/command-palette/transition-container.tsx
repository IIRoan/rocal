import React, { useEffect, useState, useRef } from "react";

interface TransitionContainerProps {
  direction: "forward" | "back";
  children: React.ReactNode;
  viewKey?: string; // Key to identify when the actual view changes
}

export function TransitionContainer({
  direction,
  children,
  viewKey,
}: TransitionContainerProps) {
  const [displayChildren, setDisplayChildren] = useState(children);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [prevChildren, setPrevChildren] = useState<React.ReactNode>(null);
  const lastViewKey = useRef(viewKey);

  useEffect(() => {
    // Only transition when viewKey changes (actual navigation), not content updates
    if (viewKey === lastViewKey.current) {
      // Same view, just update children without transition
      setDisplayChildren(children);
      return;
    }

    lastViewKey.current = viewKey;
    setIsTransitioning(true);
    setPrevChildren(displayChildren);

    const swapTimer = setTimeout(() => {
      setDisplayChildren(children);
    }, 80);

    const clearTimer = setTimeout(() => {
      setIsTransitioning(false);
      setPrevChildren(null);
    }, 160);

    return () => {
      clearTimeout(swapTimer);
      clearTimeout(clearTimer);
    };
  }, [children, direction, viewKey]);

  return (
    <div className="relative overflow-hidden">
      {isTransitioning && prevChildren && (
        <div
          className="absolute inset-0 crossfade-exit"
          aria-hidden="true"
        >
          {prevChildren}
        </div>
      )}
      <div className={isTransitioning ? "crossfade-enter" : ""}>
        {displayChildren}
      </div>
    </div>
  );
}