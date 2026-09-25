import React, { useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import {
  LAYOUT_ICON,
  layoutSubtitleStyle,
  layoutTitleStyle,
} from "../../lib/app-layout";

interface SurfaceTitleProps {
  title: string;
  icon?: keyof typeof Feather.glyphMap;
  subtitle?: string;
  /** When true, title row is centered (tab mailbox name). Default true. */
  centered?: boolean;
}

export function SurfaceTitle({
  title,
  icon,
  subtitle,
  centered = true,
}: SurfaceTitleProps) {
  const { theme } = useTheme();
  const styles = useMemo(
    () => createStyles(theme, centered),
    [theme, centered],
  );

  return (
    <View style={styles.wrap} accessibilityRole="header">
      <View style={styles.titleRow}>
        {icon ? (
          <Feather
            name={icon}
            size={LAYOUT_ICON.context}
            color={theme.colors.mutedForeground}
          />
        ) : null}
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {subtitle ? (
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

function createStyles(theme: ThemeTokens, centered: boolean) {
  return StyleSheet.create({
    wrap: {
      flex: 1,
      minWidth: 0,
      gap: 2,
      alignItems: centered ? "center" : "flex-start",
    } as ViewStyle,
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing["1"],
      maxWidth: "100%",
    } as ViewStyle,
    title: {
      ...layoutTitleStyle(theme, "lg"),
      flexShrink: 1,
      textAlign: centered ? "center" : "left",
    } as TextStyle,
    subtitle: {
      ...layoutSubtitleStyle(theme),
      textAlign: centered ? "center" : "left",
    } as TextStyle,
  });
}
