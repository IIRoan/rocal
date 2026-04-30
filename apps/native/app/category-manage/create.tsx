import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  validateCategoryData,
  type CreateCategoryRequest,
  type EventColor,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../src/providers/ThemeProvider";
import { calendarApiService } from "../../src/lib/api";
import { QUERY_KEYS } from "../../src/lib/query-keys";
import { ColorPicker } from "../../src/components/event/ColorPicker";

// ─── Component ───────────────────────────────────────────────────────────────

export default function CategoryCreateScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const queryClient = useQueryClient();

  // ─── Form state ────────────────────────────────────────────────────────────

  const [name, setName] = useState("");
  const [color, setColor] = useState<EventColor>("blue");
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [serverErrors, setServerErrors] = useState<string[]>([]);

  // ─── Create mutation ───────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (data: CreateCategoryRequest) =>
      calendarApiService.createCategory(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.categories() });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      router.back();
    },
    onError: (err: unknown) => {
      const message =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "Failed to create category";
      setServerErrors([message]);
    },
  });

  // ─── Validation ────────────────────────────────────────────────────────────

  const validate = useCallback((): boolean => {
    const errors = validateCategoryData({ name: name.trim(), color });
    setValidationErrors(errors);
    return errors.length === 0;
  }, [name, color]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(() => {
    setServerErrors([]);
    if (!validate()) return;

    createMutation.mutate({
      name: name.trim(),
      color,
    });
  }, [name, color, validate, createMutation]);

  const handleCancel = useCallback(() => {
    router.back();
  }, [router]);

  // ─── Render ────────────────────────────────────────────────────────────────

  const allErrors = [...validationErrors, ...serverErrors];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle} accessibilityRole="header">
          Create Category
        </Text>
      </View>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Name field */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Name</Text>
          <TextInput
            style={[styles.textInput, styles.textInputText]}
            value={name}
            onChangeText={setName}
            placeholder="Category name"
            placeholderTextColor={theme.colors.mutedForeground}
            autoFocus
            maxLength={100}
            accessibilityLabel="Category name"
          />
        </View>

        {/* Color picker */}
        <View style={styles.fieldGroup}>
          <ColorPicker
            selectedColor={color}
            onColorSelect={setColor}
            label="Color"
          />
        </View>

        {/* Errors */}
        {allErrors.length > 0 ? (
          <View style={styles.errorContainer}>
            {allErrors.map((err, i) => (
              <Text key={i} style={styles.errorText}>
                {err}
              </Text>
            ))}
          </View>
        ) : null}

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <Pressable
            style={styles.cancelButton}
            onPress={handleCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[
              styles.submitButton,
              createMutation.isPending && styles.submitButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={createMutation.isPending}
            accessibilityRole="button"
            accessibilityLabel="Create category"
          >
            {createMutation.isPending ? (
              <ActivityIndicator
                size="small"
                color={theme.colors.primaryForeground}
              />
            ) : (
              <Text style={styles.submitButtonText}>Create</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function createStyles(theme: ThemeTokens) {
  const view = {
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["3"],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: theme.spacing["4"],
      paddingBottom: theme.spacing["8"],
    },
    fieldGroup: {
      marginBottom: theme.spacing["4"],
    },
    textInput: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.md,
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["2"],
      backgroundColor: theme.colors.card,
    },
    errorContainer: {
      marginBottom: theme.spacing["4"],
    },
    actionRow: {
      flexDirection: "row" as const,
      gap: theme.spacing["3"],
      marginTop: theme.spacing["2"],
    },
    cancelButton: {
      flex: 1,
      backgroundColor: theme.colors.muted,
      paddingVertical: theme.spacing["3"],
      borderRadius: theme.borderRadius.md,
      alignItems: "center" as const,
    },
    submitButton: {
      flex: 1,
      backgroundColor: theme.colors.primaryBase,
      paddingVertical: theme.spacing["3"],
      borderRadius: theme.borderRadius.md,
      alignItems: "center" as const,
    },
    submitButtonDisabled: {
      opacity: 0.6,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    headerTitle: {
      fontSize: theme.typography.fontSize["xl"].size,
      lineHeight: theme.typography.fontSize["xl"].lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    fieldLabel: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      fontWeight: theme.typography.fontWeight
        .medium as TextStyle["fontWeight"],
      color: theme.colors.foreground,
      marginBottom: theme.spacing["1"],
    },
    textInputText: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      color: theme.colors.foreground,
    },
    errorText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.destructive,
      marginBottom: 2,
    },
    cancelButtonText: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      fontWeight: theme.typography.fontWeight
        .medium as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    submitButtonText: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      fontWeight: theme.typography.fontWeight
        .medium as TextStyle["fontWeight"],
      color: theme.colors.primaryForeground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
