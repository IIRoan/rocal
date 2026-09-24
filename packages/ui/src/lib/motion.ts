/** GSAP curve equivalents as CSS cubic-beziers so WAAPI can run them on the compositor. */
export const MOTION_EASING = {
  /** power3.out */
  reveal: "cubic-bezier(0.215, 0.61, 0.355, 1)",
  /** power2.out */
  soft: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
  /** power2.in */
  exit: "cubic-bezier(0.55, 0.085, 0.68, 0.53)",
  /** back.out(1.55) */
  overshoot: "cubic-bezier(0.34, 1.56, 0.64, 1)",
} as const;

export interface MotionOffset {
  x?: number;
  y?: number;
  scale?: number;
}

function offsetTransform({ x = 0, y = 0, scale = 1 }: MotionOffset) {
  return `translate(${x}px, ${y}px) scale(${scale})`;
}

function canAnimate(element: Element) {
  return typeof element.animate === "function";
}

/** Fades and slides `element` in from `offset` using only opacity and transform, which Firefox and Safari composite off the main thread. */
export function slideFadeIn(
  element: HTMLElement,
  offset: MotionOffset | null,
  options: { duration: number; easing?: string },
): Animation | null {
  if (!canAnimate(element)) return null;
  const from: Keyframe = { opacity: 0, visibility: "visible" };
  const to: Keyframe = { opacity: 1, visibility: "visible" };
  if (offset) {
    from.transform = offsetTransform(offset);
    to.transform = "none";
  }
  return element.animate([from, to], {
    duration: options.duration,
    easing: options.easing ?? MOTION_EASING.reveal,
  });
}

/** Mirror of `slideFadeIn` that holds the hidden end state; cancel it before showing the element again. */
export function slideFadeOut(
  element: HTMLElement,
  offset: MotionOffset | null,
  options: { duration: number; easing?: string },
): Animation | null {
  if (!canAnimate(element)) return null;
  const from: Keyframe = { opacity: 1, visibility: "visible" };
  const to: Keyframe = { opacity: 0, visibility: "hidden" };
  if (offset) {
    from.transform = "none";
    to.transform = offsetTransform(offset);
  }
  return element.animate([from, to], {
    duration: options.duration,
    easing: options.easing ?? MOTION_EASING.exit,
    fill: "forwards",
  });
}
