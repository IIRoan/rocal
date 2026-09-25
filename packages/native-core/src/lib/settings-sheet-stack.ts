/** Immutable page stack for in-sheet settings navigation. */
export function pushSheetPage<T>(stack: T[], page: T): T[] {
  if (stack[stack.length - 1] === page) {
    return stack;
  }
  return [...stack, page];
}

/** Pop the top page; the root stack stays a single page. */
export function popSheetPage<T>(stack: T[], root: T): T[] {
  if (stack.length <= 1) {
    return [root];
  }
  return stack.slice(0, -1);
}

export function topSheetPage<T>(stack: T[], root: T): T {
  return stack[stack.length - 1] ?? root;
}

/** Parallax offset for the page under the top page, as a fraction of width. */
export const SHEET_PAGE_UNDER_OFFSET = 0.3;

/** X offset for the page at `index` when the visible stack position is `position` (fractional mid-swipe). */
export function sheetPageTranslateX(
  index: number,
  position: number,
  width: number,
): number {
  "worklet";
  const depth = index - position;
  if (depth >= 0) {
    return Math.min(depth, 1) * width;
  }
  return Math.max(depth, -1) * SHEET_PAGE_UNDER_OFFSET * width;
}
