import { playAfterPaint } from "@workspace/ui/lib/motion";

/** The desktop list column; the reader takes the rest of the row beside it. */
export const MAIL_LIST_NARROW_WIDTH_CLASS = "w-[clamp(300px,32cqw,420px)]";

export const MAIL_READER_CONTENT_FADE_KEYFRAMES: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];

/** easeInOutSine over 200ms for swapping message content inside the reader. */
export const MAIL_READER_CONTENT_FADE_OPTIONS: KeyframeAnimationOptions = {
  duration: 200,
  easing: "cubic-bezier(0.37, 0, 0.63, 1)",
};

/** Opening from the empty reader slides the conversation across like a drawer, and closing slides it off at the same pace. */
export const MAIL_READER_DRAWER_MS = 240;

/** Fades nested inside the conversation while it slides in would stack on a moving layer, which stutters in Firefox, so they are skipped then. */
function isMailReaderContentMoving(element: Element) {
  const content = element.closest("[data-mail-reader-content]");
  if (!content || typeof content.getAnimations !== "function") return false;
  // A slide held for its first paint is paused, and it is about to move.
  return content.getAnimations().some((animation) => animation.playState === "running" || animation.playState === "paused");
}

/** Fades `element` in on the compositor once it has painted, unless motion is reduced, it sits in an inert subtree, or the conversation around it is sliding in. */
export function fadeInMailReaderContent(
  element: HTMLElement,
  prefersReducedMotion: boolean,
): Animation | null {
  if (
    prefersReducedMotion ||
    typeof element.animate !== "function" ||
    element.closest("[inert]") ||
    isMailReaderContentMoving(element)
  ) {
    return null;
  }
  // The conversation can start sliding while this fade waits for paint, so the guard runs again then.
  return playAfterPaint(
    // repo-rules-allow motion-shared-helpers: fade helper with inert, movement and reduced-motion guards (READER-TRANSITION.md); slideFadeIn has none of them and always sets visibility.
    element.animate(
      MAIL_READER_CONTENT_FADE_KEYFRAMES,
      MAIL_READER_CONTENT_FADE_OPTIONS,
    ),
    () => !isMailReaderContentMoving(element),
  );
}
