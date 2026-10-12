import { afterPaint } from "@workspace/calendar-core";

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

/** Set while a CSS entrance waits for its first paint; globals.css pauses the animation on its first keyframe. */
export const MOTION_PENDING_ATTRIBUTE = "data-motion-pending";

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

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/** Reduced motion keeps the end state but skips the movement, matching Reanimated's default on native. */
function motionDuration(duration: number) {
  return prefersReducedMotion() ? 0 : duration;
}

/** Holds a WAAPI entrance on its first keyframe until its content has painted; `canPlay` false then skips to the end state. */
export function playAfterPaint(
  animation: Animation,
  canPlay?: () => boolean,
): Animation {
  if (prefersReducedMotion()) return animation;
  animation.pause();
  const cancelWait = afterPaint(() => {
    if (animation.playState !== "paused") return;
    if (canPlay && !canPlay()) animation.cancel();
    else animation.play();
  });
  animation.addEventListener("cancel", cancelWait, { once: true });
  return animation;
}

/** CSS-keyframe twin of `playAfterPaint`; call the returned release when a close must not wait. */
export function holdUntilPainted(element: HTMLElement): () => void {
  element.setAttribute(MOTION_PENDING_ATTRIBUTE, "");
  let cancelWait = () => {};
  const release = () => {
    cancelWait();
    element.removeAttribute(MOTION_PENDING_ATTRIBUTE);
  };
  cancelWait = afterPaint(release);
  return release;
}

/** Opacity/transform-only entrance, so Firefox and Safari composite it. */
export function slideFadeIn(
  element: HTMLElement,
  offset: MotionOffset | null,
  options: { duration: number; easing?: string; delay?: number },
): Animation | null {
  if (!canAnimate(element)) return null;
  const from: Keyframe = { opacity: 0, visibility: "visible" };
  // An inline 0 is a pre-hide, so drop it or the element vanishes again once the fade ends.
  if (Number(element.style.opacity) === 0) element.style.removeProperty("opacity");
  // Ends on the element's own inline opacity (e.g. 0.85 previews) instead of snapping there after the fade.
  const to: Keyframe = { opacity: element.style.opacity || 1, visibility: "visible" };
  if (offset) {
    from.transform = offsetTransform(offset);
    to.transform = "none";
  }
  const delay = prefersReducedMotion() ? 0 : (options.delay ?? 0);
  return playAfterPaint(
    element.animate([from, to], {
      duration: motionDuration(options.duration),
      easing: options.easing ?? MOTION_EASING.reveal,
      delay,
      fill: delay > 0 ? "backwards" : "none",
    }),
  );
}

/** FLIP: animates a reposition with transform instead of geometry. */
export function moveFrom(
  element: HTMLElement,
  offset: MotionOffset,
  options: { duration: number; easing?: string },
): Animation | null {
  if (!canAnimate(element)) return null;
  return playAfterPaint(
    element.animate([{ transform: offsetTransform(offset) }, { transform: "none" }], {
      duration: motionDuration(options.duration),
      easing: options.easing ?? MOTION_EASING.soft,
    }),
  );
}

export interface RevealStep {
  selector: string;
  offset: MotionOffset | null;
  duration: number;
  delay?: number;
  stagger?: number;
  easing?: string;
}

export function revealSequence(root: ParentNode, steps: RevealStep[]): () => void {
  const animations = steps.flatMap((step) =>
    Array.from(root.querySelectorAll<HTMLElement>(step.selector), (element, index) =>
      slideFadeIn(element, step.offset, {
        duration: step.duration,
        easing: step.easing,
        delay: (step.delay ?? 0) + index * (step.stagger ?? 0),
      }),
    ),
  );
  return () => {
    for (const animation of animations) animation?.cancel();
  };
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
    duration: motionDuration(options.duration),
    easing: options.easing ?? MOTION_EASING.exit,
    fill: "forwards",
  });
}
