import React, { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import type { LabelDef } from "../../lib/mail/types";
import { LABEL_COLOR_OPTIONS } from "../../lib/mail/use-labels";
import { useTheme } from "../../providers/ThemeProvider";
import { SheetList, SheetNavButton } from "../sheet";

interface MailLabelsSheetProps {
  labels: LabelDef[];
  messageKeywords: Record<string, boolean> | undefined;
  insetsBottom: number;
  onToggleLabel: (labelId: string, assigned: boolean) => void;
  onCreateLabel: (name: string, color: string) => void;
  onDeleteLabel: (labelId: string) => void;
  onBack: () => void;
}

export function MailLabelsSheet({
  labels,
  messageKeywords,
  insetsBottom,
  onToggleLabel,
  onCreateLabel,
  onDeleteLabel,
  onBack,
}: MailLabelsSheetProps) {
  const { theme } = useTheme();
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#6366f1");

  const handleCreate = () => {
    const name = newLabelName.trim();
    if (!name) return;
    onCreateLabel(name, newLabelColor);
    setNewLabelName("");
  };

  return (
    <View style={{ paddingBottom: insetsBottom + 8 }}>
      <SheetNavButton label="Actions" onPress={onBack} />

      <SheetList>
        {labels.map((label, index) => {
          const isAssigned = messageKeywords?.[`label:${label.id}`] === true;
          return (
            <View key={label.id}>
              {index > 0 ? (
                <View
                  style={{
                    height: StyleSheet.hairlineWidth,
                    backgroundColor: theme.colors.border + "50",
                    marginLeft: 44,
                  }}
                />
              ) : null}
              <Pressable
                onPress={() => onToggleLabel(label.id, !isAssigned)}
                style={({ pressed }) => [
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 13,
                    opacity: pressed ? 0.6 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${isAssigned ? "Remove" : "Add"} label ${label.name}`}
              >
                <View
                  style={[styles.labelDot, { backgroundColor: label.color }]}
                />
                <Text
                  style={{
                    flex: 1,
                    fontSize: theme.typography.fontSize.base.size,
                    color: theme.colors.foreground,
                  }}
                  numberOfLines={1}
                >
                  {label.name}
                </Text>
                {isAssigned ? (
                  <Feather name="check" size={16} color={theme.colors.primaryBase} />
                ) : null}
              </Pressable>
            </View>
          );
        })}

        {labels.length > 0 ? (
          <View
            style={{
              height: StyleSheet.hairlineWidth,
              backgroundColor: theme.colors.border + "50",
              marginLeft: 44,
            }}
          />
        ) : null}

        <Pressable
          onPress={handleCreate}
          style={({ pressed }) => [
            {
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingHorizontal: 14,
              paddingVertical: 13,
              opacity: pressed ? 0.6 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Create new label"
        >
          <Feather name="plus" size={18} color={theme.colors.mutedForeground} />
          <View style={{ flex: 1, gap: 8 }}>
            <TextInput
              value={newLabelName}
              onChangeText={setNewLabelName}
              placeholder="Label name"
              placeholderTextColor={theme.colors.mutedForeground}
              style={{
                fontSize: theme.typography.fontSize.base.size,
                color: theme.colors.foreground,
                paddingVertical: 4,
                paddingHorizontal: 8,
                borderRadius: theme.borderRadius.md,
                backgroundColor: theme.colors.muted + "40",
              }}
              returnKeyType="done"
              onSubmitEditing={handleCreate}
            />
            <View style={{ flexDirection: "row", gap: 6 }}>
              {LABEL_COLOR_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => setNewLabelColor(opt.value)}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: opt.value,
                    borderWidth: newLabelColor === opt.value ? 2 : 0,
                    borderColor:
                      newLabelColor === opt.value
                        ? theme.colors.foreground
                        : "transparent",
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={opt.label}
                />
              ))}
            </View>
          </View>
        </Pressable>
      </SheetList>

      {labels.length > 0 ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <Text
            style={{
              fontSize: theme.typography.fontSize.xs.size,
              color: theme.colors.mutedForeground,
              marginBottom: 8,
            }}
          >
            Manage labels
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {labels.map((label) => (
              <Pressable
                key={label.id}
                onPress={() => onDeleteLabel(label.id)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: theme.borderRadius.full,
                  backgroundColor: theme.colors.muted + "30",
                }}
                accessibilityRole="button"
                accessibilityLabel={`Delete label ${label.name}`}
              >
                <View
                  style={[styles.labelDot, { backgroundColor: label.color }]}
                />
                <Text
                  style={{
                    fontSize: theme.typography.fontSize.xs.size - 1,
                    color: theme.colors.foreground,
                  }}
                  numberOfLines={1}
                >
                  {label.name}
                </Text>
                <Feather name="x" size={10} color={theme.colors.mutedForeground} />
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  labelDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
