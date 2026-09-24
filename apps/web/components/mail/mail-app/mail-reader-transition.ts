export const MAIL_READER_TRANSITION_MS = 360;

/** One curve shared by the reader slide, the list width and the WAAPI list fade so all land on the same frame. */
export const MAIL_READER_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";

/** Duration and easing come from `--mail-reader-ms` / `--mail-reader-ease` on the pane container. */
export const MAIL_READER_MOTION_CLASS =
  "duration-(--mail-reader-ms) ease-(--mail-reader-ease) motion-reduce:duration-[1ms]";

export const MAIL_READER_ANIMATION_OPTIONS: KeyframeAnimationOptions = {
  duration: MAIL_READER_TRANSITION_MS,
  easing: MAIL_READER_EASING,
};

export const MAIL_LIST_OPEN_FADE_OPTIONS: KeyframeAnimationOptions = {
  duration: MAIL_READER_TRANSITION_MS / 2,
  easing: MAIL_READER_EASING,
};

export const MAIL_LIST_SWAP_KEYFRAMES: Keyframe[] = [{ opacity: 0.4 }, { opacity: 1 }];

export const MAIL_LIST_NARROW_WIDTH_CLASS = "w-[clamp(300px,32cqw,420px)]";

/** List width plus reader width is exactly 100cqw, so the reader's left border lands on the list edge. */
export const MAIL_READER_WIDTH_CLASS = "w-[calc(100cqw_-_clamp(300px,32cqw,420px))]";

export const MAIL_READER_CONTENT_FADE_KEYFRAMES: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];

/** easeInOutSine over 200ms for swapping message content inside an open reader. */
export const MAIL_READER_CONTENT_FADE_OPTIONS: KeyframeAnimationOptions = {
  duration: 200,
  easing: "cubic-bezier(0.37, 0, 0.63, 1)",
};

/** Opacity animations inside the pane while it is pending or sliding stutter in Firefox, so callers skip them then. */
export function isMailReaderPaneMoving(element: Element) {
  if (element.closest("[inert]")) return true;
  const pane = element.closest("[data-mail-reader-pane]");
  if (!pane || typeof pane.getAnimations !== "function") return false;
  return pane
    .getAnimations()
    .some((animation) => animation.playState === "running");
}

/** Fades `element` in on the compositor unless motion is reduced or the reader pane is moving. */
export function fadeInMailReaderContent(
  element: HTMLElement,
  prefersReducedMotion: boolean,
): Animation | null {
  if (
    prefersReducedMotion ||
    typeof element.animate !== "function" ||
    isMailReaderPaneMoving(element)
  ) {
    return null;
  }
  return element.animate(
    MAIL_READER_CONTENT_FADE_KEYFRAMES,
    MAIL_READER_CONTENT_FADE_OPTIONS,
  );
}
