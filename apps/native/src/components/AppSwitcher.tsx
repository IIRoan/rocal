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
import { useRouter, useSegments } from "expo-router";
import type { ThemeTokens } from "@workspace/design-tokens";
import {
  CALENDAR_TAB_ROUTE,
  MAIL_TAB_ROUTE,
  isMailRouteSegments,
} from "../lib/navigation-routes";
import { useTheme } from "../providers/ThemeProvider";

type AppKey = "calendar" | "mail";

const APPS: {
  key: AppKey;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  href: string;
}[] = [
  {
    key: "calendar",
    label: "Calendar",
    icon: "calendar",
    href: CALENDAR_TAB_ROUTE,
  },
  { key: "mail", label: "Mail", icon: "mail", href: MAIL_TAB_ROUTE },
];

interface AppSwitcherProps {
  /** Force the active app; otherwise derived from the current route. */
  active?: AppKey;
  /** Called after a navigation is triggered (e.g. to close a drawer). */
  onNavigate?: () => void;
}

/**
 * Segmented control for switching between the Calendar and Mail apps,
 * mirroring the web `MobileAppSwitcher`.
 */
export function AppSwitcher({ active, onNavigate }: AppSwitcherProps) {
  const { theme } = useTheme();
  const router = useRouter();
  const segments = useSegments();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const activeKey: AppKey =
    active ?? (isMailRouteSegments(segments) ? "mail" : "calendar");

  return (
    <View style={styles.container} accessibilityRole="tablist">
      {APPS.map((app) => {
        const isActive = app.key === activeKey;
        return (
          <Pressable
            key={app.key}
            onPress={() => {
              if (!isActive) {
                router.replace(app.href as never);
              }
              onNavigate?.();
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={app.label}
            style={[styles.segment, isActive && styles.segmentActive]}
          >
            <Feather
              name={app.icon}
              size={15}
              color={
                isActive ? theme.colors.foreground : theme.colors.mutedForeground
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
      gap: theme.spacing["1"],
      alignSelf: "center" as const,
      padding: theme.spacing["1"],
      borderRadius: theme.borderRadius.full,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.card,
    },
    segment: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["1"],
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["1"],
      borderRadius: theme.borderRadius.full,
    },
    segmentActive: {
      backgroundColor: theme.colors.secondary,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    label: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.mutedForeground,
    },
    labelActive: {
      color: theme.colors.foreground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
