import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { getErrorMessage } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { AppScreen, StackScreenHeader } from "../../src/components/layout";
import { SettingsHintRow } from "../../src/components/settings/SettingsRows";
import { useTheme } from "../../src/providers/ThemeProvider";
import { useToast } from "../../src/providers/ToastProvider";
import { useMailAccount, useMailRuntime } from "../../src/lib/mail/use-mail";
import {
  LABEL_COLOR_OPTIONS,
  useLabels,
} from "../../src/lib/mail/use-labels";

export default function LabelsSettingsScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { toast } = useToast();
  const accountQuery = useMailAccount();
  const provisioned = accountQuery.data?.provisioned ?? false;
  const runtimeQuery = useMailRuntime(provisioned);
  const { labels, loaded, createLabel, deleteLabel } = useLabels({
    runtime: runtimeQuery.data ?? null,
    enabled: provisioned,
  });
  const [name, setName] = useState("");
  const [color, setColor] = useState(LABEL_COLOR_OPTIONS[5]?.value ?? "#3b82f6");
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await createLabel(trimmed, color);
      setName("");
      toast(`Created "${trimmed}"`);
    } catch (error) {
      toast(getErrorMessage(error, "Failed to create label"), "error");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = (labelId: string, labelName: string) => {
    Alert.alert("Delete label?", `Remove “${labelName}” from this account?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          setBusy(true);
          deleteLabel(labelId)
            .then(() => toast(`Deleted “${labelName}”`))
            .catch((error) => {
              toast(getErrorMessage(error, "Failed to delete label"), "error");
            })
            .finally(() => setBusy(false));
        },
      },
    ]);
  };

  if (!provisioned) {
    return (
      <AppScreen header={<StackScreenHeader title="Labels" />}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            Set up mail first, then you can create labels here.
          </Text>
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen header={<StackScreenHeader title="Labels" />}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SettingsHintRow
          text="Labels stay in your encrypted mail vault on this device and sync with web."
          theme={theme}
        />

        {!loaded && runtimeQuery.isLoading ? (
          <ActivityIndicator style={{ marginTop: theme.spacing["6"] }} />
        ) : (
          <View style={styles.sectionItems}>
            {labels.length === 0 ? (
              <Text style={styles.emptyText}>No labels yet.</Text>
            ) : (
              labels.map((label) => (
                <View key={label.id} style={styles.labelRow}>
                  <View
                    style={[styles.labelDot, { backgroundColor: label.color }]}
                  />
                  <Text style={styles.labelName} numberOfLines={1}>
                    {label.name}
                  </Text>
                  <Pressable
                    onPress={() => handleDelete(label.id, label.name)}
                    style={({ pressed }) => [
                      styles.deleteButton,
                      pressed && { backgroundColor: theme.colors.accent },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${label.name}`}
                  >
                    <Feather
                      name="trash-2"
                      size={16}
                      color={theme.colors.destructive}
                    />
                  </Pressable>
                </View>
              ))
            )}
          </View>
        )}

        <View style={styles.createCard}>
          <Text style={styles.createLabel}>New label</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Label name"
            placeholderTextColor={theme.colors.mutedForeground}
            editable={!busy}
            style={styles.input}
            returnKeyType="done"
            onSubmitEditing={() => void handleCreate()}
          />
          <View style={styles.colorRow}>
            {LABEL_COLOR_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                onPress={() => setColor(option.value)}
                style={[
                  styles.swatch,
                  { backgroundColor: option.value },
                  color === option.value && styles.swatchSelected,
                ]}
                accessibilityRole="button"
                accessibilityLabel={option.label}
              />
            ))}
          </View>
          <Pressable
            onPress={() => void handleCreate()}
            disabled={busy || !name.trim()}
            style={({ pressed }) => [
              styles.createButton,
              pressed && { opacity: 0.8 },
              (!name.trim() || busy) && { opacity: 0.5 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Create label"
          >
            <Text style={styles.createButtonText}>
              {busy ? "Saving…" : "Create label"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </AppScreen>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    scrollView: { flex: 1 },
    scrollContent: { paddingBottom: theme.spacing["8"] },
    sectionItems: { paddingVertical: theme.spacing["1"] },
    emptyState: {
      flex: 1,
      justifyContent: "center",
      padding: theme.spacing["6"],
    },
    labelRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing["3"],
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["3"],
      minHeight: 48,
    },
    labelDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    deleteButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    createCard: {
      marginTop: theme.spacing["4"],
      marginHorizontal: theme.spacing["3"],
      padding: theme.spacing["4"],
      gap: theme.spacing["3"],
      borderRadius: theme.borderRadius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
    },
    colorRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing["2"],
    },
    swatch: {
      width: 22,
      height: 22,
      borderRadius: 11,
    },
    swatchSelected: {
      borderWidth: 2,
      borderColor: theme.colors.foreground,
    },
    createButton: {
      height: 44,
      borderRadius: theme.borderRadius.lg,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.primaryBase,
    },
    emptyText: {
      paddingHorizontal: theme.spacing["4"],
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
    },
    labelName: {
      flex: 1,
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.foreground,
    },
    createLabel: {
      fontSize: theme.typography.fontSize.xs.size,
      color: theme.colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    input: {
      height: 44,
      borderRadius: theme.borderRadius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.muted + "50",
      paddingHorizontal: theme.spacing["3"],
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.foreground,
    },
    createButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.primaryForeground,
    },
  });
}
