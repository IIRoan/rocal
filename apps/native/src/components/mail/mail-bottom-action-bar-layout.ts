import { MAIL_LAYOUT } from "./mail-ui";

/** Action row height (excludes safe-area padding). */
export const MAIL_BOTTOM_BAR_HEIGHT = MAIL_LAYOUT.bottomBarHeight;

/** Bulk toolbar uses the same action row height as the shared bottom bar. */
export const BULK_TOOLBAR_HEIGHT = MAIL_BOTTOM_BAR_HEIGHT;

/** Total dock height including top padding and bottom safe area. */
export function mailBottomBarTotalHeight(bottomInset: number): number {
  return (
    MAIL_LAYOUT.bottomBarPaddingTop + MAIL_LAYOUT.bottomBarHeight + bottomInset
  );
}
