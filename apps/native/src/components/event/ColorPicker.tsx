import React, { useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useTheme } from "../../providers/ThemeProvider";
import type { ThemeTokens } from "@workspace/design-tokens";
import type { EventColor } from "@workspace/calendar-core";
import { CALENDAR_COLORS } from "./color-picker-utils";

// ─── Constants ───────────────────────────────────────────────────────────────

const SWATCH_SIZE = 36;
const COLUMNS = 6;

// ─── Props ───────────────────────────────────────────────────────────────────

interface ColorPickerProps {
  /** Currently selected color */
  selectedColor: EventColor | undefined;
  /** Callback when a color is selected */
  onColorSelect: (color: EventColor) => void;
  /** Optional label displayed above the color grid */
  label?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ColorPicker({
  selectedColor,
  onColorSelect,
  label,
}: ColorPickerProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.grid}>
        {CALENDAR_COLORS.map((color) => {
          const isSelected = selectedColor === color;
          const bgColor = theme.colors.calendar[color].bg;

          return (
            <Pressable
              key={color}
              style={[
                styles.swatch,
                { backgroundColor: bgColor },
                isSelected && styles.swatchSelected,
                isSelected && { borderColor: theme.colors.foreground },
              ]}
              onPress={() => onColorSelect(color)}
              accessibilityRole="button"
              accessibilityLabel={`${color} color${isSelected ? ", selected" : ""}`}
              accessibilityState={{ selected: isSelected }}
            >
              {isSelected ? <Text style={styles.checkmark}>✓</Text> : null}
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
      gap: theme.spacing["2"],
    },
    grid: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      gap: theme.spacing["2"],
    },
    swatch: {
      width: SWATCH_SIZE,
      height: SWATCH_SIZE,
      borderRadius: theme.borderRadius.full,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderWidth: 2,
      borderColor: "transparent",
    },
    swatchSelected: {
      borderWidth: 2,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    label: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    checkmark: {
      fontSize: 16,
      fontWeight: theme.typography.fontWeight.bold as TextStyle["fontWeight"],
      color: "#ffffff",
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}

export { CALENDAR_COLORS } from "./color-picker-utils";
export type { ColorPickerProps };
