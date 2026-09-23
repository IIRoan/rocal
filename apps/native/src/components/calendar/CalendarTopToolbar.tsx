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
import { useTheme } from "../../providers/ThemeProvider";
import { layoutHeaderShell } from "../../lib/app-layout";
import { formatCalendarHeaderTitle } from "./calendar-header-utils";

interface CalendarTopToolbarProps {
  currentDate: Date;
  timezone?: string | null;
  onOpenDrawer: () => void;
  onOpenCalendars: () => void;
  onOpenAccount: () => void;
  onNewEvent: () => void;
}

export function CalendarTopToolbar({
  currentDate,
  timezone,
  onOpenDrawer,
  onOpenCalendars,
  onOpenAccount,
  onNewEvent,
}: CalendarTopToolbarProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { month, year } = useMemo(
    () => formatCalendarHeaderTitle(currentDate, timezone),
    [currentDate, timezone],
  );

  return (
    <View style={styles.shell}>
      <Pressable
        onPress={onOpenDrawer}
        style={({ pressed }) => [styles.title, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Choose date and view"
      >
        <Text style={styles.titleText} numberOfLines={1}>
          <Text style={styles.month}>{month}</Text>
          <Text style={styles.year}> {year}</Text>
        </Text>
        <Feather
          name="chevron-down"
          size={22}
          color={theme.colors.mutedForeground}
        />
      </Pressable>
      <View style={styles.actions}>
        <ToolbarIconButton
          name="layers"
          onPress={onOpenCalendars}
          accessibilityLabel="Calendars"
          styles={styles}
          color={theme.colors.foreground}
        />
        <ToolbarIconButton
          name="plus"
          onPress={onNewEvent}
          accessibilityLabel="Create new event"
          styles={styles}
          color={theme.colors.foreground}
        />
        <ToolbarIconButton
          name="settings"
          onPress={onOpenAccount}
          accessibilityLabel="Settings"
          styles={styles}
          color={theme.colors.foreground}
        />
      </View>
    </View>
  );
}

interface ToolbarIconButtonProps {
  name: keyof typeof Feather.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
  styles: ReturnType<typeof createStyles>;
  color: string;
}

function ToolbarIconButton({
  name,
  onPress,
  accessibilityLabel,
  styles,
  color,
}: ToolbarIconButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Feather name={name} size={20} color={color} />
    </Pressable>
  );
}

function createStyles(theme: ThemeTokens) {
  const view = {
    shell: {
      ...layoutHeaderShell(theme, { bordered: false }),
      flexDirection: "row" as const,
      alignItems: "center" as const,
      paddingVertical: theme.spacing["2"],
    },
    title: {
      flex: 1,
      minWidth: 0,
      minHeight: 44,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
    },
    actions: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      marginRight: -theme.spacing["2"],
    },
    iconButton: {
      width: 44,
      height: 44,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    pressed: {
      opacity: 0.6,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    titleText: {
      flexShrink: 1,
      fontSize: 28,
      lineHeight: 34,
    },
    month: {
      fontWeight: "700" as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    year: {
      fontWeight: "400" as TextStyle["fontWeight"],
      color: theme.colors.mutedForeground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
