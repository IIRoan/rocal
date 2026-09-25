import type { TextStyle } from "react-native";
import type { DeepPartial, ThemeConfigs } from "@howljs/calendar-kit";
import type { ThemeTokens } from "@workspace/design-tokens";

export function toKitTheme(theme: ThemeTokens): DeepPartial<ThemeConfigs> {
  const dayFontSize = theme.typography.fontSize.sm.size;
  const medium = theme.typography.fontWeight.medium as TextStyle["fontWeight"];

  return {
    colors: {
      primary: theme.colors.primaryBase,
      onPrimary: theme.colors.primaryForeground,
      background: theme.colors.background,
      onBackground: theme.colors.foreground,
      border: theme.colors.border,
      text: theme.colors.foreground,
      surface: theme.colors.muted,
      onSurface: theme.colors.mutedForeground,
    },
    headerBackgroundColor: theme.colors.background,
    headerBorderColor: theme.colors.border,
    hourBackgroundColor: theme.colors.background,
    hourBorderColor: theme.colors.border,
    hourTextStyle: {
      color: theme.colors.mutedForeground,
      fontSize: 9,
      lineHeight: 11,
      fontWeight: medium,
      fontVariant: ["tabular-nums"],
      includeFontPadding: false,
      textAlign: "right",
      paddingLeft: 0,
      paddingRight: 0,
    },
    dayName: {
      color: theme.colors.mutedForeground,
      fontSize: dayFontSize,
      fontWeight: medium,
    },
    dayNumber: {
      color: theme.colors.foreground,
      fontSize: dayFontSize,
      fontWeight: medium,
    },
    todayName: {
      color: theme.colors.primaryBase,
      fontWeight: medium,
    },
    todayNumberContainer: {
      backgroundColor: theme.colors.primaryBase,
      borderRadius: theme.borderRadius.md,
    },
    todayNumber: {
      color: theme.colors.primaryForeground,
      fontWeight: medium,
    },
    nowIndicatorColor: theme.colors.primaryBase,
    eventContainerStyle: {
      borderRadius: theme.borderRadius.sm,
      overflow: "hidden",
    },
    eventTitleStyle: {
      fontSize: 10,
      fontWeight: medium,
      color: theme.colors.primaryForeground,
    },
  };
}
