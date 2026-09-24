export function getBottomSheetViewportHeight(
  containerHeight: number,
  position: number,
  sheetHeight: number,
  handleHeight: number,
  keyboardHeight: number,
): number {
  "worklet";
  const visibleHeight =
    containerHeight - Math.max(0, position) - keyboardHeight;
  return Math.max(
    0,
    Math.min(sheetHeight, visibleHeight) - Math.max(0, handleHeight),
  );
}

/** Position the viewport should size for, or null to keep the current size so it doesn't relayout every frame. */
export function getSheetRestingPosition(
  position: number,
  animationTarget: number | null,
  gestureActive: boolean,
): number | null {
  "worklet";
  if (animationTarget !== null) {
    // Grow before sliding up so no gap shows; shrink only once the sheet has settled lower.
    return animationTarget < position ? animationTarget : null;
  }
  return gestureActive ? null : position;
}
