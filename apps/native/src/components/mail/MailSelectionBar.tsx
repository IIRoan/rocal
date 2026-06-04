import React, { useEffect, useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import { layoutHairlineBorder } from "../../lib/app-layout";
import { mailColors, mailSpacing, mailTypography } from "./mail-ui";

const BAR_TIMING = {
  duration: 180,
  easing: Easing.out(Easing.cubic),
};

interface MailSelectionBarProps {
  selectedCount: number;
  totalCount: number;
  onClear: () => void;
  onSelectAll: () => void;
}

export function MailSelectionBar({
  selectedCount,
  totalCount,
  onClear,
  onSelectAll,
}: MailSelectionBarProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const type = mailTypography(theme);
  const allSelected = totalCount > 0 && selectedCount >= totalCount;

  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, BAR_TIMING);
  }, [progress]);

  const barStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * -8 }],
  }));

  return (
    <Animated.View style={[styles.bar, barStyle]}>
      <Pressable
        onPress={onClear}
        style={({ pressed }) => [
          styles.unselectButton,
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Unselect all messages"
      >
        <Text style={styles.unselectText}>Unselect</Text>
      </Pressable>

      <View style={styles.countPill} accessibilityRole="text">
        <Text style={type.captionStrong}>{selectedCount}</Text>
        <Text style={type.caption}> selected</Text>
      </View>

      <Pressable
        onPress={onSelectAll}
        style={({ pressed }) => [
          styles.selectAllButton,
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={allSelected ? "Deselect all" : "Select all"}
      >
        <Text
          style={[
            styles.selectAllText,
            allSelected && styles.selectAllTextActive,
          ]}
        >
          {allSelected ? "Deselect all" : "Select all"}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function createStyles(theme: ThemeTokens) {
  const pad = mailSpacing(theme);
  const colors = mailColors(theme);

  return StyleSheet.create({
    bar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: pad.chipGap,
      paddingHorizontal: pad.headerH,
      paddingVertical: pad.headerV,
      backgroundColor: colors.selectionBar,
      ...layoutHairlineBorder(theme),
    } as ViewStyle,
    unselectButton: {
      minWidth: 72,
      paddingVertical: pad.tight,
    } as ViewStyle,
    unselectText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.primaryBase,
    } as TextStyle,
    countPill: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: pad.section,
      paddingVertical: pad.tight,
      borderRadius: theme.borderRadius.sm,
      backgroundColor: colors.selectionPill,
      borderWidth: 1,
      borderColor: theme.colors.primaryBase + "33",
    } as ViewStyle,
    selectAllButton: {
      minWidth: 72,
      alignItems: "flex-end",
      paddingVertical: pad.tight,
    } as ViewStyle,
    selectAllText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.primaryBase,
    } as TextStyle,
    selectAllTextActive: {
      color: theme.colors.foreground,
    } as TextStyle,
    pressed: {
      opacity: 0.65,
    } as ViewStyle,
  });
}
