import React from "react";

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
  const enterClass =
    direction === "forward" ? "slide-enter-forward" : "slide-enter-back";

  return (
    <div className="relative overflow-hidden">
      <div key={viewKey ?? "default"} className={enterClass}>
        {children}
      </div>
    </div>
  );
}
