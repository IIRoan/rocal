import React from "react";

interface TransitionContainerProps {
  direction: "forward" | "back";
  children: React.ReactNode;
}

export function TransitionContainer({
  direction,
  children,
}: TransitionContainerProps) {
  return (
    <div className="relative overflow-hidden">
      <div
        className={[
          "animate-slide-fade",
          direction === "forward" ? "enter-left" : "enter-right",
        ].join(" ")}
      >
        {children}
      </div>
    </div>
  );
}