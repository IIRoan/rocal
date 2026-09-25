import { useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import type { ThemeTokens } from "@workspace/design-tokens";
import type { NativeCalendarView } from "../../lib/calendar-views";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { SIDEBAR_VIEW_OPTIONS } from "../app-sidebar-utils";

interface CalendarViewToggleProps {
  activeView: NativeCalendarView;
  onViewChange: (view: NativeCalendarView) => void;
}

export function CalendarViewToggle({
  activeView,
  onViewChange,
}: CalendarViewToggleProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.track} accessibilityRole="tablist">
      {SIDEBAR_VIEW_OPTIONS.map((option) => {
        const selected = option.view === activeView;

        return (
          <Pressable
            key={option.view}
            onPress={() => {
              if (!selected) onViewChange(option.view);
            }}
            style={({ pressed }) => [
              styles.segment,
              selected && styles.segmentSelected,
              pressed && !selected && styles.pressed,
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
          >
            <Text
              style={[styles.label, selected && styles.labelSelected]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  const view = {
    track: {
      flexDirection: "row" as const,
      padding: 3,
      gap: 2,
      borderRadius: theme.borderRadius.full,
      backgroundColor: theme.colors.muted,
    },
    segment: {
      flex: 1,
      minWidth: 0,
      minHeight: 42,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderRadius: theme.borderRadius.full,
    },
    segmentSelected: {
      backgroundColor: theme.colors.background,
    },
    pressed: {
      opacity: 0.6,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    label: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.mutedForeground,
    },
    labelSelected: {
      color: theme.colors.foreground,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}

export type { CalendarViewToggleProps };
