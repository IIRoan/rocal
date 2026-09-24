import { useMemo } from "react";
import { StyleSheet, type TextStyle, type ViewStyle } from "react-native";
import {
  mailDarkPalette,
  mailLightPalette,
  type MailPaletteTokens,
  type ThemeTokens,
} from "@workspace/design-tokens";
import { LAYOUT_ICON } from "../../lib/app-layout";
import { useTheme } from "../../providers/ThemeProvider";

/** Shared icon sizes across the native mail experience. */
export const MAIL_ICON = {
  headerMenu: LAYOUT_ICON.menu,
  headerSearch: LAYOUT_ICON.search,
  /** Bottom bulk bar + message detail actions. */
  toolbar: 20,
  sheet: 20,
  sheetAccessory: 18,
  rowMeta: 14,
  rowSelect: 20,
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
  sheetSectionGap: 8,
  unreadDotSize: 8,
  /** Sender avatar in list rows; tapping it toggles selection. */
  rowAvatarSize: 32,
} as const;

export function mailSpacing(theme: ThemeTokens) {
  return {
    /** Matches {@link layoutHeaderInsets} / {@link layoutScrollContent}. */
    headerH: theme.spacing["3"],
    headerV: theme.spacing["2"],
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
    pressed: theme.colors.foreground + "0f",
    pressedStrong: theme.colors.muted + "44",
    surface: theme.colors.muted + "33",
    surfaceMuted: theme.colors.muted + "22",
    unreadRow: theme.colors.card,
    selectedRow: theme.colors.foreground + "14",
    selectIndicator: theme.colors.muted + "55",
    selectIndicatorOn: theme.colors.foreground,
    chipBg: theme.colors.muted + "99",
  };
}

/** Nightwatch tokens that have no ThemeTokens slot (disabled text, cell states, status colors). */
export function useMailPalette(): MailPaletteTokens {
  const { isDark } = useTheme();
  return isDark ? mailDarkPalette : mailLightPalette;
}

/** Skiff-style mail skin: accent, CTA, and the text/border steps the list, reader, and compose share. */
export function mailSkin(theme: ThemeTokens, palette: MailPaletteTokens) {
  return {
    accent: theme.colors.primaryBase,
    unreadDot: theme.colors.primaryBase,
    cta: palette.ctaPrimary,
    ctaForeground: palette.ctaPrimaryForeground,
    textSecondary: theme.colors.mutedForeground,
    textTertiary: palette.textTertiary,
    borderPrimary: palette.borderPrimary,
    borderTertiary: palette.borderTertiary,
    surface: palette.surface,
    field: theme.colors.muted,
    pressed: palette.cellHover,
    selected: palette.cellActive,
    largeTitle: {
      fontSize: 28,
      lineHeight: 34,
      fontWeight: "700" as TextStyle["fontWeight"],
      letterSpacing: -0.4,
      color: theme.colors.foreground,
    },
    title: {
      fontSize: 22,
      lineHeight: 28,
      fontWeight: "700" as TextStyle["fontWeight"],
      letterSpacing: -0.2,
      color: theme.colors.foreground,
    },
    body: {
      fontSize: 15,
      lineHeight: 21,
      color: theme.colors.foreground,
    },
    meta: {
      fontSize: 13,
      lineHeight: 17,
      color: palette.textTertiary,
    },
  };
}

export type MailSkin = ReturnType<typeof mailSkin>;

export function useMailSkin(): MailSkin {
  const { theme } = useTheme();
  const palette = useMailPalette();
  return useMemo(() => mailSkin(theme, palette), [palette, theme]);
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
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    overline: {
      fontSize: 10,
      lineHeight: 12,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      letterSpacing: 0.6,
      textTransform: "uppercase" as const,
      color: theme.colors.mutedForeground,
    },
  };
}

/** Inset for list row separators so they start under the sender text. */
export function mailListSeparatorInset(theme: ThemeTokens): number {
  const s = mailSpacing(theme);
  return s.rowH + MAIL_LAYOUT.rowAvatarSize + s.rowGap;
}

export function createMailHairlineBorder(theme: ThemeTokens): ViewStyle {
  return {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: mailColors(theme).border,
  };
}
