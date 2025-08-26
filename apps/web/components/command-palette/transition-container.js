import React from "react";
export function TransitionContainer({ direction, children, }) {
    return (<div className="relative overflow-hidden">
      <div className={[
            "animate-slide-fade",
            direction === "forward" ? "enter-left" : "enter-right",
        ].join(" ")}>
        {children}
      </div>
    </div>);
}
