import React, { useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../providers/ThemeProvider";
import {
  resolveCalendarSwatchColor,
  resolveCalendarSwatchForeground,
} from "../../lib/calendar-color-utils";

const BOX_SIZE = 18;

/** Skiff-style calendar checkbox: filled in the calendar color when shown, outlined when hidden. */
export function CalendarVisibilityCheck({
  color,
  visible,
  pending = false,
  calendarName,
  onToggle,
}: {
  color: string;
  visible: boolean;
  pending?: boolean;
  calendarName: string;
  onToggle: () => void;
}) {
  const { theme } = useTheme();
  const fill = resolveCalendarSwatchColor(color, theme);
  const styles = useMemo(() => createStyles(fill), [fill]);

  return (
    <Pressable
      onPress={onToggle}
      disabled={pending}
      hitSlop={12}
      style={styles.target}
      accessibilityRole="checkbox"
      accessibilityLabel={`Show ${calendarName}`}
      accessibilityState={{ checked: visible, busy: pending }}
    >
      {pending ? (
        <ActivityIndicator size="small" color={fill} />
      ) : (
        <View style={[styles.box, visible && styles.boxChecked]}>
          {visible ? (
            <Feather name="check" size={13} color={resolveCalendarSwatchForeground(color, theme)} />
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

function createStyles(fill: string) {
  return StyleSheet.create({
    target: {
      width: 20,
      height: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    box: {
      width: BOX_SIZE,
      height: BOX_SIZE,
      borderRadius: 5,
      borderWidth: 2,
      borderColor: fill,
      alignItems: "center",
      justifyContent: "center",
    },
    boxChecked: {
      backgroundColor: fill,
    },
  } satisfies Record<string, ViewStyle>);
}
