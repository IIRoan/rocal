/** Bottom inset for sheet content — safe area only, no extra gap. */
export function sheetBottomPadding(insetsBottom: number): number {
  return Math.max(insetsBottom, 4);
}

/** Tight bottom inset for compact pickers (e.g. bulk move). */
export function sheetCompactBottomPadding(insetsBottom: number): number {
  return insetsBottom;
}
