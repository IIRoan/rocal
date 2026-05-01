import React, { useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../providers/ThemeProvider";
import type { ThemeTokens } from "@workspace/design-tokens";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";

// ─── Tab Config ──────────────────────────────────────────────────────────────

type FeatherIcon = React.ComponentProps<typeof Feather>["name"];

interface TabConfig {
  label: string;
  icon: FeatherIcon;
}

const TAB_CONFIG: Record<string, TabConfig> = {
  calendar: { label: "Calendar", icon: "calendar" },
  search: { label: "Search", icon: "search" },
  settings: { label: "Settings", icon: "settings" },
};

// ─── Component ───────────────────────────────────────────────────────────────

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View
      style={[
        styles.container,
        { paddingBottom: Math.max(insets.bottom, theme.spacing["2"]) },
      ]}
    >
      <View style={styles.inner}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;
          const routeName = route.name;

          const config = TAB_CONFIG[routeName];
          const label = config?.label ?? options.title ?? routeName;
          const iconName = config?.icon ?? ("circle" as FeatherIcon);

          const color = isFocused
            ? theme.colors.primaryBase
            : theme.colors.mutedForeground;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: "tabLongPress",
              target: route.key,
            });
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              onLongPress={onLongPress}
              style={({ pressed }) => [
                styles.tab,
                isFocused && styles.tabFocused,
                pressed && styles.tabPressed,
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: isFocused }}
              accessibilityLabel={label}
            >
              <Feather name={iconName} size={20} color={color} />
              <Text
                style={[
                  styles.label,
                  isFocused ? styles.labelFocused : styles.labelDefault,
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function createStyles(theme: ThemeTokens) {
  const view = {
    container: {
      backgroundColor: theme.colors.card,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      paddingTop: theme.spacing["2"],
    },
    inner: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-around" as const,
      paddingHorizontal: theme.spacing["4"],
    },
    tab: {
      flex: 1,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      paddingVertical: theme.spacing["1"],
      borderRadius: theme.borderRadius.lg,
      gap: 2,
    },
    tabFocused: {
      backgroundColor: theme.colors.accent,
    },
    tabPressed: {
      opacity: 0.7,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    label: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
    },
    labelFocused: {
      color: theme.colors.primaryBase,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
    },
    labelDefault: {
      color: theme.colors.mutedForeground,
      fontWeight: theme.typography.fontWeight
        .normal as TextStyle["fontWeight"],
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
