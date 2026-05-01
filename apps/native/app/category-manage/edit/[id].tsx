import { useCallback, useMemo, useState } from "react";
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
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  validateCategoryData,
  type EventCategory,
  type EventColor,
  type UpdateCategoryRequest,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../../src/providers/ThemeProvider";
import { calendarApiService } from "../../../src/lib/api";
import { QUERY_KEYS } from "../../../src/lib/query-keys";
import { ColorPicker } from "../../../src/components/event/ColorPicker";

// ─── Component ───────────────────────────────────────────────────────────────

export default function CategoryEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const queryClient = useQueryClient();

  // ─── Form state ────────────────────────────────────────────────────────────

  const [name, setName] = useState("");
  const [color, setColor] = useState<EventColor>("blue");
  const [formInitialized, setFormInitialized] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [serverErrors, setServerErrors] = useState<string[]>([]);

  // ─── Data fetching ─────────────────────────────────────────────────────────

  const {
    data: category,
    isLoading: categoryLoading,
  } = useQuery({
    queryKey: [...QUERY_KEYS.categories(), id],
    queryFn: async () => {
      const categories = await calendarApiService.getCategories();
      return categories.find((c) => c.id === id) ?? null;
    },
    enabled: !!id,
  });

  // Initialize form when category data loads
  if (category && !formInitialized) {
    setName(category.name);
    setColor(category.color as EventColor);
    setFormInitialized(true);
  }

  // ─── Update mutation ───────────────────────────────────────────────────────

  const updateMutation = useMutation({
    mutationFn: (data: UpdateCategoryRequest) =>
      calendarApiService.updateCategory(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.categories() });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      router.back();
    },
    onError: (err: unknown) => {
      const message =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "Failed to update category";
      setServerErrors([message]);
    },
  });

  // ─── Delete mutation ───────────────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: () => calendarApiService.deleteCategory(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.categories() });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      router.back();
    },
    onError: (err: unknown) => {
      const message =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "Failed to delete category";
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

    updateMutation.mutate({
      name: name.trim(),
      color,
    });
  }, [name, color, validate, updateMutation]);

  const handleCancel = useCallback(() => {
    router.back();
  }, [router]);

  const handleDeletePress = useCallback(() => {
    Alert.alert(
      "Delete category?",
      "This category will be removed from all associated events. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMutation.mutate(),
        },
      ],
    );
  }, [deleteMutation]);

  // ─── Loading state ─────────────────────────────────────────────────────────

  if (categoryLoading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primaryBase} />
        <Text style={styles.loadingText}>Loading…</Text>
      </SafeAreaView>
    );
  }

  if (!category) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.errorText}>Category not found</Text>
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backButtonText}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const allErrors = [...validationErrors, ...serverErrors];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle} accessibilityRole="header">
          Edit Category
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

        {/* Usage count info */}
        {category.usageCount !== undefined && category.usageCount > 0 ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoText}>
              Used by {category.usageCount}{" "}
              {category.usageCount === 1 ? "event" : "events"}
            </Text>
          </View>
        ) : null}

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
              updateMutation.isPending && styles.submitButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={updateMutation.isPending}
            accessibilityRole="button"
            accessibilityLabel="Save category"
          >
            {updateMutation.isPending ? (
              <ActivityIndicator
                size="small"
                color={theme.colors.primaryForeground}
              />
            ) : (
              <Text style={styles.submitButtonText}>Save</Text>
            )}
          </Pressable>
        </View>

        {/* Delete button */}
        <Pressable
          style={styles.deleteButton}
          onPress={handleDeletePress}
          disabled={deleteMutation.isPending}
          accessibilityRole="button"
          accessibilityLabel="Delete category"
        >
          {deleteMutation.isPending ? (
            <ActivityIndicator
              size="small"
              color={theme.colors.destructiveForeground}
            />
          ) : (
            <Text style={styles.deleteButtonText}>Delete Category</Text>
          )}
        </Pressable>
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
    centered: {
      flex: 1,
      justifyContent: "center" as const,
      alignItems: "center" as const,
      backgroundColor: theme.colors.background,
      padding: theme.spacing["4"],
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
    infoRow: {
      marginBottom: theme.spacing["4"],
      paddingVertical: theme.spacing["2"],
      paddingHorizontal: theme.spacing["3"],
      backgroundColor: theme.colors.muted,
      borderRadius: theme.borderRadius.md,
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
    deleteButton: {
      backgroundColor: theme.colors.destructive,
      paddingVertical: theme.spacing["3"],
      borderRadius: theme.borderRadius.md,
      alignItems: "center" as const,
      marginTop: theme.spacing["4"],
    },
    backButton: {
      marginTop: theme.spacing["4"],
      paddingVertical: theme.spacing["2"],
      paddingHorizontal: theme.spacing["4"],
      backgroundColor: theme.colors.muted,
      borderRadius: theme.borderRadius.md,
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
    infoText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
    },
    loadingText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
      marginTop: theme.spacing["2"],
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
    deleteButtonText: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      fontWeight: theme.typography.fontWeight
        .medium as TextStyle["fontWeight"],
      color: theme.colors.destructiveForeground,
    },
    backButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
