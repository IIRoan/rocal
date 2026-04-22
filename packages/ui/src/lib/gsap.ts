"use client";

import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";

gsap.registerPlugin(useGSAP);

export const GSAP_EASES = {
  reveal: "power3.out",
  emphatic: "expo.out",
  exit: "power2.in",
  gentle: "sine.inOut",
  linear: "none",
} as const;

export function getGsapDirectionOffset(side: string | null, distance = 12) {
  switch (side) {
    case "top":
      return { x: 0, y: distance };
    case "bottom":
      return { x: 0, y: -distance };
    case "left":
      return { x: distance, y: 0 };
    case "right":
      return { x: -distance, y: 0 };
    default:
      return { x: 0, y: distance };
  }
}

export function getGsapDurationFromSpring(options?: {
  stiffness?: number;
  damping?: number;
  mass?: number;
  duration?: number;
}) {
  if (options?.duration && options.duration > 0) {
    return options.duration;
  }

  const stiffness = Math.max(options?.stiffness ?? 180, 40);
  const damping = Math.max(options?.damping ?? 20, 8);
  const mass = Math.max(options?.mass ?? 0.5, 0.2);
  const estimatedSeconds = (mass * damping) / stiffness;

  return Number(
    Math.min(Math.max(estimatedSeconds * 2.8, 0.24), 0.7).toFixed(3),
  );
}

export { gsap, useGSAP };
