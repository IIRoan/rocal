import React, { useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../providers/ThemeProvider";
import {
  APP_SWITCH_OPTIONS,
  type AppSwitchKey,
} from "../lib/app-switcher-config";

interface WorkspaceAppSwitchProps {
  activeApp: AppSwitchKey;
  onSwitch: (app: AppSwitchKey) => void;
}

/** Segmented Mail / Calendar switch shown at the top of the workspace drawers. */
export function WorkspaceAppSwitch({ activeApp, onSwitch }: WorkspaceAppSwitchProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.track} accessibilityRole="tablist">
      {APP_SWITCH_OPTIONS.map((option) => {
        const active = option.key === activeApp;
        return (
          <Pressable
            key={option.key}
            onPress={() => {
              if (!active) onSwitch(option.key);
            }}
            style={({ pressed }) => [
              styles.segment,
              active && styles.segmentActive,
              pressed && !active && styles.pressed,
            ]}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected: active }}
          >
            <Feather
              name={option.icon}
              size={15}
              color={active ? theme.colors.foreground : theme.colors.mutedForeground}
            />
            <Text style={[styles.label, active && styles.labelActive]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    track: {
      flexDirection: "row",
      padding: 3,
      gap: 3,
      borderRadius: theme.borderRadius.lg,
      backgroundColor: theme.colors.muted,
    } as ViewStyle,
    segment: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      minHeight: 38,
      borderRadius: theme.borderRadius.md,
    } as ViewStyle,
    segmentActive: {
      backgroundColor: theme.colors.background,
    } as ViewStyle,
    pressed: {
      opacity: 0.6,
    } as ViewStyle,
    label: {
      fontSize: 14,
      lineHeight: 19,
      fontWeight: "500",
      color: theme.colors.mutedForeground,
    } as TextStyle,
    labelActive: {
      color: theme.colors.foreground,
      fontWeight: "600",
    } as TextStyle,
  });
}
