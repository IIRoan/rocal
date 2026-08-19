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
    <View style={styles.row} accessibilityRole="tablist">
      {SIDEBAR_VIEW_OPTIONS.map((option) => {
        const selected = option.view === activeView;

        return (
          <Pressable
            key={option.view}
            onPress={() => onViewChange(option.view)}
            style={[styles.pill, selected && styles.pillSelected]}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
          >
            <Feather
              name={option.icon}
              size={13}
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
    row: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      gap: theme.spacing["1"],
    },
    pill: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 5,
      paddingHorizontal: theme.spacing["2"],
      paddingVertical: 7,
      borderRadius: theme.borderRadius.lg,
      backgroundColor: theme.colors.muted + "30",
    },
    pillSelected: {
      backgroundColor: theme.colors.primaryBase + "18",
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    label: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
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
