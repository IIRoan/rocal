import React, { useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SurfaceTitle, SurfaceToolbar } from "@workspace/native-core/components/layout";
import { useMailSkin, type MailSkin } from "@workspace/native-core/components/mail/mail-ui";

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
  const skin = useMailSkin();
  const styles = useMemo(() => createStyles(skin), [skin]);
  const allSelected = totalCount > 0 && selectedCount >= totalCount;
  const title =
    selectedCount === 0
      ? "Select messages"
      : selectedCount === 1
        ? "1 selected"
        : `${selectedCount} selected`;

  return (
    <SurfaceToolbar
      bordered={false}
      leading={
        <Pressable
          onPress={onSelectAll}
          hitSlop={8}
          style={({ pressed }) => [
            styles.textButton,
            styles.leading,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={allSelected ? "Deselect all" : "Select all"}
        >
          <Text style={styles.textButtonLabel} numberOfLines={1}>
            {allSelected ? "Deselect all" : "Select all"}
          </Text>
        </Pressable>
      }
      center={<SurfaceTitle title={title} centered />}
      trailing={
        <Pressable
          onPress={onClear}
          hitSlop={8}
          style={({ pressed }) => [
            styles.textButton,
            styles.trailing,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Done selecting"
        >
          <Text style={[styles.textButtonLabel, styles.done]}>Done</Text>
        </Pressable>
      }
    />
  );
}

function createStyles(skin: MailSkin) {
  return StyleSheet.create({
    textButton: {
      minHeight: 44,
      justifyContent: "center",
    } as ViewStyle,
    leading: {
      alignItems: "flex-start",
    } as ViewStyle,
    trailing: {
      alignItems: "flex-end",
    } as ViewStyle,
    textButtonLabel: {
      fontSize: 16,
      lineHeight: 21,
      fontWeight: "500",
      color: skin.accent,
    } as TextStyle,
    done: {
      fontWeight: "600",
    } as TextStyle,
    pressed: {
      opacity: 0.6,
    } as ViewStyle,
  });
}
