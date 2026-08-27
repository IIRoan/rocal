import React, { useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import { HeaderIconButton, SurfaceTitle, SurfaceToolbar } from "../layout";

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
  const allSelected = totalCount > 0 && selectedCount >= totalCount;
  const title =
    selectedCount === 1 ? "1 selected" : `${selectedCount} selected`;

  return (
    <SurfaceToolbar
      bordered={false}
      leading={
        <HeaderIconButton
          name="x"
          size={22}
          onPress={onClear}
          accessibilityLabel="Clear selection"
        />
      }
      center={<SurfaceTitle title={title} centered />}
      trailing={
        <Pressable
          onPress={onSelectAll}
          hitSlop={8}
          style={({ pressed }) => [styles.trailing, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={allSelected ? "Deselect all" : "Select all"}
        >
          <Text style={styles.trailingText} numberOfLines={1}>
            {allSelected ? "Deselect" : "Select all"}
          </Text>
        </Pressable>
      }
    />
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    trailing: {
      minHeight: 44,
      justifyContent: "center",
      alignItems: "flex-end",
      paddingVertical: theme.spacing["1"],
    } as ViewStyle,
    trailingText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.primaryBase,
    } as TextStyle,
    pressed: {
      opacity: 0.65,
    } as ViewStyle,
  });
}
