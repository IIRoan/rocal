import { useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import type { CalendarView } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import { SIDEBAR_VIEW_OPTIONS } from "../app-sidebar-utils";

interface CalendarViewToggleProps {
  activeView: CalendarView;
  onViewChange: (view: CalendarView) => void;
}

export function CalendarViewToggle({
  activeView,
  onViewChange,
}: CalendarViewToggleProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.list} accessibilityRole="tablist">
      {SIDEBAR_VIEW_OPTIONS.map((option) => {
        const selected = option.view === activeView;

        return (
          <Pressable
            key={option.view}
            onPress={() => onViewChange(option.view)}
            style={({ pressed }) => [
              styles.row,
              pressed && styles.rowPressed,
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
          >
            <Feather
              name={option.icon}
              size={16}
              color={
                selected
                  ? theme.colors.primaryBase
                  : theme.colors.mutedForeground
              }
            />
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
    list: {
      gap: 2,
    },
    row: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 10,
      minHeight: 44,
      paddingHorizontal: 4,
    },
    rowPressed: {
      opacity: 0.7,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    label: {
      flex: 1,
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.mutedForeground,
    },
    labelSelected: {
      color: theme.colors.primaryBase,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}

export type { CalendarViewToggleProps };
