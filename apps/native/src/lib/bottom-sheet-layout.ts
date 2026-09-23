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
