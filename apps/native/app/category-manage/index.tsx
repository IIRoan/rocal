import { useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import type { EventCategory } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../src/providers/ThemeProvider";
import { calendarApiService } from "../../src/lib/api";
import { QUERY_KEYS } from "../../src/lib/query-keys";

// ─── Component ───────────────────────────────────────────────────────────────

export default function CategoryManageScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();

  // ─── Data fetching ─────────────────────────────────────────────────────────

  const {
    data: categories,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: QUERY_KEYS.categories(),
    queryFn: () => calendarApiService.getCategories(),
  });

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleCategoryPress = useCallback(
    (category: EventCategory) => {
      router.push(`/category-manage/edit/${category.id}`);
    },
    [router],
  );

  const handleCreate = useCallback(() => {
    router.push("/category-manage/create");
  }, [router]);

  // ─── Render item ───────────────────────────────────────────────────────────

  const renderCategoryItem = useCallback(
    ({ item }: { item: EventCategory }) => {
      const categoryColor =
        theme.colors.calendar[
          item.color as keyof typeof theme.colors.calendar
        ]?.bg ?? theme.colors.primaryBase;

      return (
        <Pressable
          style={styles.categoryRow}
          onPress={() => handleCategoryPress(item)}
          accessibilityRole="button"
          accessibilityLabel={`Edit category ${item.name}`}
        >
          <View
            style={[styles.colorDot, { backgroundColor: categoryColor }]}
          />
          <View style={styles.categoryInfo}>
            <Text style={styles.categoryName} numberOfLines={1}>
              {item.name}
            </Text>
            {item.usageCount !== undefined && item.usageCount > 0 ? (
              <Text style={styles.usageCount}>
                {item.usageCount} {item.usageCount === 1 ? "event" : "events"}
              </Text>
            ) : null}
          </View>
        </Pressable>
      );
    },
    [theme, styles, handleCategoryPress],
  );

  // ─── Loading state ─────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primaryBase} />
        <Text style={styles.loadingText}>Loading categories…</Text>
      </SafeAreaView>
    );
  }

  // ─── Error state ───────────────────────────────────────────────────────────

  if (isError) {
    const errorMessage =
      error && typeof error === "object" && "message" in error
        ? (error as { message: string }).message
        : "Failed to load categories";
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.errorText}>{errorMessage}</Text>
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle} accessibilityRole="header">
          Manage Categories
        </Text>
        <Pressable
          style={styles.createButton}
          onPress={handleCreate}
          accessibilityRole="button"
          accessibilityLabel="Create new category"
        >
          <Text style={styles.createButtonText}>+ New</Text>
        </Pressable>
      </View>
      <FlatList
        data={categories ?? []}
        keyExtractor={(item) => item.id}
        renderItem={renderCategoryItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No categories yet</Text>
            <Text style={styles.emptySubtext}>
              Tap "+ New" to create your first category
            </Text>
          </View>
        }
      />
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
      flexDirection: "row" as const,
      justifyContent: "space-between" as const,
      alignItems: "center" as const,
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["3"],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    listContent: {
      paddingVertical: theme.spacing["2"],
    },
    categoryRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["3"],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    colorDot: {
      width: 14,
      height: 14,
      borderRadius: theme.borderRadius.full,
      marginRight: theme.spacing["3"],
    },
    categoryInfo: {
      flex: 1,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["2"],
    },
    createButton: {
      backgroundColor: theme.colors.primaryBase,
      paddingVertical: theme.spacing["1"],
      paddingHorizontal: theme.spacing["3"],
      borderRadius: theme.borderRadius.md,
    },
    backButton: {
      marginTop: theme.spacing["4"],
      paddingVertical: theme.spacing["2"],
      paddingHorizontal: theme.spacing["4"],
      backgroundColor: theme.colors.muted,
      borderRadius: theme.borderRadius.md,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: "center" as const,
      alignItems: "center" as const,
      paddingVertical: theme.spacing["12"],
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
    createButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      fontWeight: theme.typography.fontWeight
        .medium as TextStyle["fontWeight"],
      color: theme.colors.primaryForeground,
    },
    categoryName: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      color: theme.colors.foreground,
      flexShrink: 1,
    },
    usageCount: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.mutedForeground,
    },
    loadingText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
      marginTop: theme.spacing["2"],
    },
    errorText: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      color: theme.colors.destructive,
      textAlign: "center" as const,
    },
    backButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
    },
    emptyText: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      color: theme.colors.foreground,
      fontWeight: theme.typography.fontWeight
        .medium as TextStyle["fontWeight"],
    },
    emptySubtext: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
      marginTop: theme.spacing["1"],
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
