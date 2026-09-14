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
import { useSegments } from "expo-router";
import type { ThemeTokens } from "@workspace/design-tokens";
import {
  APP_SWITCH_OPTIONS,
  type AppSwitchKey,
} from "../lib/app-switcher-config";
import { isMailRouteSegments } from "../lib/navigation-routes";
import { useWorkspaceTabSwitch } from "../lib/use-workspace-tab-switch";
import { useTheme } from "../providers/ThemeProvider";

interface AppSwitcherProps {
  /** Force the active app; otherwise derived from the current route. */
  active?: AppSwitchKey;
  /** Called after a navigation is triggered (e.g. to close a drawer). */
  onNavigate?: () => void;
}

/**
 * Full-width segmented control for switching between Calendar and Mail.
 * @deprecated Prefer {@link SurfaceAppSwitcherTitle} in tab toolbars.
 */
export function AppSwitcher({ active, onNavigate }: AppSwitcherProps) {
  const { theme } = useTheme();
  const switchTab = useWorkspaceTabSwitch();
  const segments = useSegments();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const activeKey: AppSwitchKey =
    active ?? (isMailRouteSegments(segments) ? "mail" : "calendar");

  return (
    <View style={styles.container} accessibilityRole="tablist">
      {APP_SWITCH_OPTIONS.map((app) => {
        const isActive = app.key === activeKey;
        return (
          <Pressable
            key={app.key}
            onPress={() => {
              if (!isActive) {
                switchTab(app.key);
              }
              onNavigate?.();
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={app.label}
            style={({ pressed }) => [
              styles.segment,
              isActive && styles.segmentActive,
              pressed && styles.segmentPressed,
            ]}
          >
            <Feather
              name={app.icon}
              size={15}
              color={
                isActive
                  ? theme.colors.primaryBase
                  : theme.colors.mutedForeground
              }
            />
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {app.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  const view = {
    container: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 3,
      padding: 3,
      borderRadius: theme.borderRadius.xl,
      backgroundColor: theme.colors.muted + "30",
    },
    segment: {
      flex: 1,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: 6,
      minHeight: 40,
      borderRadius: theme.borderRadius.lg,
    },
    segmentActive: {
      backgroundColor: theme.colors.card,
    },
    segmentPressed: {
      opacity: 0.7,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    label: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.mutedForeground,
    },
    labelActive: {
      color: theme.colors.primaryBase,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
