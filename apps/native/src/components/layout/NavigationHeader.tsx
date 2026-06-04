import React, { useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import {
  LAYOUT_ICON,
  LAYOUT_METRICS,
  layoutHeaderShell,
  layoutSubtitleStyle,
  layoutTitleStyle,
} from "../../lib/app-layout";
import { HeaderIconButton } from "./HeaderIconButton";

export type NavigationHeaderVariant = "stack" | "reader" | "compose" | "form";

interface NavigationHeaderProps {
  variant?: NavigationHeaderVariant;
  title: string;
  subtitle?: string;
  subtitleIcon?: keyof typeof Feather.glyphMap;
  onBack?: () => void;
  /** Compose: close (×). Stack/reader: back arrow. */
  leading?: "back" | "close" | React.ReactNode;
  trailing?: React.ReactNode;
  bordered?: boolean;
}

/**
 * Unified navigation header for stack screens, mail reader, compose, and forms.
 */
export function NavigationHeader({
  variant = "stack",
  title,
  subtitle,
  subtitleIcon,
  onBack,
  leading,
  trailing,
  bordered = true,
}: NavigationHeaderProps) {
  const { theme } = useTheme();
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme, variant), [theme, variant]);

  const leadingKind =
    leading ??
    (variant === "compose" ? "close" : variant === "form" ? undefined : "back");

  const renderLeading = () => {
    if (leadingKind === undefined || leadingKind === null) {
      return <View style={styles.sidePlaceholder} />;
    }
    if (typeof leadingKind !== "string") {
      return <View style={styles.sideSlot}>{leadingKind}</View>;
    }
    const onPress = onBack ?? (() => router.back());
    const isClose = leadingKind === "close";
    return (
      <HeaderIconButton
        name={isClose ? "x" : "arrow-left"}
        size={isClose ? LAYOUT_ICON.close : LAYOUT_ICON.back}
        onPress={onPress}
        accessibilityLabel={isClose ? "Close" : "Go back"}
      />
    );
  };

  const titleSize =
    variant === "form"
      ? "xl"
      : variant === "reader"
        ? "sm"
        : variant === "compose"
          ? "base"
          : "lg";

  return (
    <View style={[styles.shell, bordered && styles.bordered]}>
      {renderLeading()}

      <View
        style={[
          styles.titleBlock,
          variant === "stack" && styles.titleBlockCentered,
        ]}
      >
        <Text
          style={[styles.title, layoutTitleStyle(theme, titleSize)]}
          numberOfLines={variant === "reader" ? 1 : 2}
          accessibilityRole="header"
        >
          {title}
        </Text>
        {subtitle ? (
          <View style={styles.subtitleRow}>
            {subtitleIcon ? (
              <Feather
                name={subtitleIcon}
                size={LAYOUT_ICON.context}
                color={theme.colors.mutedForeground}
              />
            ) : null}
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
        ) : null}
      </View>

      {trailing ? (
        <View style={styles.sideSlot}>{trailing}</View>
      ) : (
        <View style={styles.sidePlaceholder} />
      )}
    </View>
  );
}

function createStyles(theme: ThemeTokens, variant: NavigationHeaderVariant) {
  const isStack = variant === "stack";

  return StyleSheet.create({
    shell: {
      ...layoutHeaderShell(theme, { bordered: false }),
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing["1"],
    } as ViewStyle,
    bordered: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    } as ViewStyle,
    sideSlot: {
      alignItems: "flex-end",
      justifyContent: "center",
      flexShrink: 0,
      maxWidth: "42%",
    } as ViewStyle,
    sidePlaceholder: {
      width: LAYOUT_METRICS.sideSlot,
    } as ViewStyle,
    titleBlock: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    } as ViewStyle,
    titleBlockCentered: {
      alignItems: "center",
    } as ViewStyle,
    title: {
      ...(isStack ? { textAlign: "center" as const } : {}),
    } as TextStyle,
    subtitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing["1"],
    } as ViewStyle,
    subtitle: layoutSubtitleStyle(theme) as TextStyle,
  });
}
