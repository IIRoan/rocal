import { StyleSheet, type TextStyle, type ViewStyle } from "react-native";
import type { ThemeTokens } from "@workspace/design-tokens";

/** Shared icon sizes across the native mail experience. */
export const MAIL_ICON = {
  /** Same as {@link ScreenHeader} menu. */
  headerMenu: 22,
  /** Same as {@link ScreenHeader} search. */
  headerSearch: 20,
  /** Bottom bulk bar + message detail actions. */
  toolbar: 20,
  sheet: 20,
  sheetAccessory: 18,
  rowMeta: 14,
  rowSelect: 20,
  /** Compose FAB — matches sidebar `edit` action scale. */
  fab: 20,
  emptyState: 36,
} as const;

/** Layout constants (heights, touch targets). */
export const MAIL_LAYOUT = {
  hitSize: 44,
  avatarSize: 40,
  /** Action row height inside {@link MailBottomActionBar}. */
  bottomBarHeight: 52,
  /** Padding above action row inside the dock. */
  bottomBarPaddingTop: 8,
  /** Selection checkbox size (bulk select). */
  selectBoxSize: 22,
  /** Matches sidebar primary button height (44). */
  composeFabSize: 44,
  composeFabInset: 12,
  composeListExtra: 44 + 12,
  sheetSectionGap: 8,
  unreadDotSize: 8,
} as const;

export function mailRadii(theme: ThemeTokens) {
  return {
    avatar: theme.borderRadius.md,
    selectBox: theme.borderRadius.sm,
  };
}

export function mailSpacing(theme: ThemeTokens) {
  return {
    /** Screen header horizontal — aligns with calendar / settings headers. */
    headerH: theme.spacing["3"],
    headerV: theme.spacing["3"],
    screenH: theme.spacing["4"],
    rowV: theme.spacing["3"],
    rowH: theme.spacing["4"],
    rowGap: theme.spacing["3"],
    chipGap: theme.spacing["2"],
    tight: theme.spacing["1"],
    section: theme.spacing["2"],
    sheetH: theme.spacing["4"],
  };
}

export function mailColors(theme: ThemeTokens) {
  return {
    border: theme.colors.border + "80",
    borderSubtle: theme.colors.border + "50",
    pressed: theme.colors.muted + "66",
    pressedStrong: theme.colors.muted + "44",
    surface: theme.colors.muted + "33",
    surfaceMuted: theme.colors.muted + "22",
    unreadRow: theme.colors.primaryBase + "12",
    selectedRow: theme.colors.primaryBase + "14",
    selectionBar: theme.colors.primaryBase + "10",
    selectIndicator: theme.colors.muted + "55",
    selectIndicatorOn: theme.colors.primaryBase,
    chipBg: theme.colors.muted + "99",
    selectionPill: theme.colors.primaryBase + "1a",
  };
}

export function mailTypography(theme: ThemeTokens) {
  return {
    caption: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.mutedForeground,
    },
    captionStrong: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      fontWeight: theme.typography.fontWeight.semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    overline: {
      fontSize: 10,
      lineHeight: 12,
      fontWeight: theme.typography.fontWeight.semibold as TextStyle["fontWeight"],
      letterSpacing: 0.6,
      textTransform: "uppercase" as const,
      color: theme.colors.mutedForeground,
    },
  };
}

/** Inset for list row separators (avatar + gaps). */
export function mailListSeparatorInset(theme: ThemeTokens): number {
  const s = mailSpacing(theme);
  return s.rowH + MAIL_LAYOUT.avatarSize + s.rowGap;
}

export function createMailHairlineBorder(theme: ThemeTokens): ViewStyle {
  return {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: mailColors(theme).border,
  };
}
