import { StyleSheet, type TextStyle, type ViewStyle } from "react-native";
import type { ThemeTokens } from "@workspace/design-tokens";

/**
 * Solace native layout system — single source for screen shells, headers,
 * spacing, borders, and icon metrics. Calendar and mail tab surfaces share
 * the same chrome; stack/form screens use the same tokens with different
 * header variants via {@link NavigationHeader}.
 */

export const LAYOUT_ICON = {
  menu: 22,
  search: 20,
  back: 18,
  close: 22,
  /** Leading icon in a title row (mailbox, section). */
  context: 16,
  action: 18,
} as const;

export const LAYOUT_METRICS = {
  /** Width of leading/trailing header slots (back, menu, search). */
  sideSlot: 38,
  /** Minimum touch target (Apple HIG). */
  hitSize: 44,
  /** Default header row min height. */
  headerMinHeight: 48,
} as const;

/** @deprecated Use {@link LAYOUT_ICON}. */
export const SURFACE_ICON = LAYOUT_ICON;

export function layoutScreen(theme: ThemeTokens): ViewStyle {
  return {
    flex: 1,
    backgroundColor: theme.colors.background,
  };
}

export function layoutBody(): ViewStyle {
  return { flex: 1, minHeight: 0 };
}

/** Horizontal + vertical padding for all app headers. */
export function layoutHeaderInsets(theme: ThemeTokens) {
  return {
    paddingHorizontal: theme.spacing["3"],
    paddingVertical: theme.spacing["2"],
  };
}

/** @deprecated Use {@link layoutHeaderInsets}. */
export const surfaceHeaderInsets = layoutHeaderInsets;

export function layoutHeaderShell(
  theme: ThemeTokens,
  options?: { bordered?: boolean },
): ViewStyle {
  return {
    backgroundColor: theme.colors.background,
    ...layoutHeaderInsets(theme),
    minHeight: LAYOUT_METRICS.headerMinHeight,
    justifyContent: "center",
    ...(options?.bordered !== false ? layoutHairlineBorder(theme) : {}),
  };
}

export function layoutHairlineBorder(theme: ThemeTokens): ViewStyle {
  return {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  };
}

/** @deprecated Use {@link layoutHairlineBorder}. */
export const surfaceHeaderBorder = layoutHairlineBorder;

export function layoutSectionSeparator(theme: ThemeTokens): ViewStyle {
  return {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.border,
  };
}

/** @deprecated Use {@link layoutSectionSeparator}. */
export const surfaceSectionSeparator = layoutSectionSeparator;

export function layoutListSeparator(theme: ThemeTokens): ViewStyle {
  return {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.border + "80",
  };
}

/** @deprecated Use {@link layoutListSeparator}. */
export const surfaceListSeparator = layoutListSeparator;

/** Default padding for stack scroll areas (settings, CRUD lists). */
export function layoutScrollContent(theme: ThemeTokens): ViewStyle {
  return {
    paddingHorizontal: theme.spacing["4"],
    paddingBottom: theme.spacing["8"],
    gap: theme.spacing["3"],
  };
}

/** Padding for full-screen forms (event editor, compose body). */
export function layoutFormContent(theme: ThemeTokens): ViewStyle {
  return {
    paddingHorizontal: theme.spacing["4"],
    paddingBottom: theme.spacing["6"],
    gap: theme.spacing["3"],
  };
}

/** Hairline row separator inside forms (compose fields). */
export function layoutFormFieldBorder(theme: ThemeTokens): ViewStyle {
  return {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  };
}

export function layoutTitleStyle(
  theme: ThemeTokens,
  size: "sm" | "base" | "lg" | "xl" = "lg",
): TextStyle {
  const scale = theme.typography.fontSize[size];
  return {
    fontSize: scale.size,
    lineHeight: scale.lineHeight,
    fontWeight: theme.typography.fontWeight.semibold as TextStyle["fontWeight"],
    color: theme.colors.foreground,
  };
}

export function layoutSubtitleStyle(theme: ThemeTokens): TextStyle {
  return {
    fontSize: theme.typography.fontSize.xs.size,
    lineHeight: theme.typography.fontSize.xs.lineHeight,
    color: theme.colors.mutedForeground,
  };
}

export function layoutSideSlot(theme: ThemeTokens): ViewStyle {
  return {
    width: LAYOUT_METRICS.sideSlot,
    height: LAYOUT_METRICS.sideSlot,
    alignItems: "center",
    justifyContent: "center",
  };
}
