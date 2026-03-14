import React, { useEffect, useState, useRef } from "react";

interface TransitionContainerProps {
  direction: "forward" | "back";
  children: React.ReactNode;
  viewKey?: string;
}

export function TransitionContainer({
  direction,
  children,
  viewKey,
}: TransitionContainerProps) {
  const [displayChildren, setDisplayChildren] = useState(children);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [prevChildren, setPrevChildren] = useState<React.ReactNode>(null);
  const [currentDirection, setCurrentDirection] = useState<"forward" | "back">(
    "forward",
  );
  const lastViewKey = useRef(viewKey);

  useEffect(() => {
    if (viewKey === lastViewKey.current) {
      setDisplayChildren(children);
      return;
    }

    lastViewKey.current = viewKey;
    setIsTransitioning(true);
    setPrevChildren(displayChildren);
    setCurrentDirection(direction);

    // Swap at 50ms (during exit animation)
    const swapTimer = setTimeout(() => {
      setDisplayChildren(children);
    }, 50);

    // Clear at 150ms (after enter animation completes)
    const clearTimer = setTimeout(() => {
      setIsTransitioning(false);
      setPrevChildren(null);
    }, 150);

    return () => {
      clearTimeout(swapTimer);
      clearTimeout(clearTimer);
    };
  }, [children, direction, viewKey]);

  const enterClass =
    currentDirection === "forward" ? "slide-enter-forward" : "slide-enter-back";
  const exitClass =
    currentDirection === "forward" ? "slide-exit-forward" : "slide-exit-back";

  return (
    <div className="relative overflow-hidden">
      {isTransitioning && prevChildren && (
        <div className={`absolute inset-0 ${exitClass}`} aria-hidden="true">
          {prevChildren}
        </div>
      )}
      <div className={isTransitioning ? enterClass : ""}>{displayChildren}</div>
    </div>
  );
}
