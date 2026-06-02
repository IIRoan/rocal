import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { getErrorMessage } from "@workspace/calendar-core";
import type { UpdateSubscriptionRequest } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { StackScreenHeader } from "../../../src/components/StackScreenHeader";
import { LoadingScreen } from "../../../src/components/ui/loading";
import { ColorPicker } from "../../../src/components/event/ColorPicker";
import { useTheme } from "../../../src/providers/ThemeProvider";
import { calendarApiService } from "../../../src/lib/api";
import { QUERY_KEYS } from "../../../src/lib/query-keys";
import {
  formatLastSync,
  getSubscriptionType,
  isNamedCalendarColor,
  validateEditableSubscriptionInput,
  type SubscriptionFieldErrors,
} from "../../../src/lib/subscription-utils";

export default function SubscriptionEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [color, setColor] = useState<string>("indigo");
  const [fieldErrors, setFieldErrors] = useState<SubscriptionFieldErrors>({});
  const [formReady, setFormReady] = useState(false);

  const { data: subscriptions = [], isLoading: subscriptionsLoading } =
    useQuery({
      queryKey: QUERY_KEYS.subscriptions(),
      queryFn: () => calendarApiService.getSubscriptions(),
      enabled: !!id,
    });

  const { data: calendars = [] } = useQuery({
    queryKey: QUERY_KEYS.calendars(),
    queryFn: () => calendarApiService.getCalendars(),
    enabled: !!id,
  });

  const subscription = useMemo(
    () => subscriptions.find((entry) => entry.id === id) ?? null,
    [id, subscriptions],
  );

  const calendar = useMemo(
    () =>
      calendars.find((entry) => entry.id === subscription?.calendar.id) ?? null,
    [calendars, subscription?.calendar.id],
  );

  const isHoliday = subscription
    ? getSubscriptionType(subscription) === "holiday"
    : false;

  useEffect(() => {
    if (!subscription || formReady) {
      return;
    }

    setName(subscription.calendar.name);
    setColor(subscription.calendar.color || "indigo");
    setFormReady(true);
  }, [formReady, subscription]);

  const updateSubscriptionMutation = useMutation({
    mutationFn: ({
      subscriptionId,
      request,
    }: {
      subscriptionId: string;
      request: UpdateSubscriptionRequest;
    }) => calendarApiService.updateSubscription(subscriptionId, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.subscriptions() });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.calendars() });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      router.back();
    },
    onError: (error) => {
      Alert.alert(
        "Unable to save changes",
        getErrorMessage(error, "Failed to update read-only calendar"),
      );
    },
  });

  const deleteSubscriptionMutation = useMutation({
    mutationFn: (subscriptionId: string) =>
      calendarApiService.deleteSubscription(subscriptionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.subscriptions() });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.calendars() });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      router.back();
    },
    onError: (error) => {
      Alert.alert(
        "Unable to remove calendar",
        getErrorMessage(error, "Failed to remove read-only calendar"),
      );
    },
  });

  const syncSubscriptionMutation = useMutation({
    mutationFn: (subscriptionId: string) =>
      calendarApiService.syncSubscription(subscriptionId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.subscriptions() });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.calendars() });
      queryClient.invalidateQueries({ queryKey: ["events"] });

      if (result.status === "error") {
        Alert.alert(
          "Sync finished with issues",
          result.message ??
            result.errors?.join("\n") ??
            "The calendar feed returned an error.",
        );
      }
    },
    onError: (error) => {
      Alert.alert(
        "Unable to sync calendar",
        getErrorMessage(error, "Failed to sync calendar"),
      );
    },
  });

  const toggleVisibilityMutation = useMutation({
    mutationFn: ({
      calendarId,
      isVisible,
    }: {
      calendarId: string;
      isVisible: boolean;
    }) => calendarApiService.updateCalendar(calendarId, { isVisible }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.calendars() });
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
    onError: (error) => {
      Alert.alert(
        "Unable to update visibility",
        getErrorMessage(error, "Failed to update calendar visibility"),
      );
    },
  });

  const handleSave = useCallback(() => {
    if (!subscription) {
      return;
    }

    const nextErrors = validateEditableSubscriptionInput({ name, color });
    setFieldErrors(nextErrors);
    if (nextErrors.name || nextErrors.color) {
      return;
    }

    updateSubscriptionMutation.mutate({
      subscriptionId: subscription.id,
      request: {
        name: name.trim(),
        color: color.trim(),
      },
    });
  }, [color, name, subscription, updateSubscriptionMutation]);

  const handleRemove = useCallback(() => {
    if (!subscription) {
      return;
    }

    Alert.alert(
      "Remove calendar?",
      `Remove ${subscription.calendar.name}? Its synced events will be deleted from this account.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => deleteSubscriptionMutation.mutate(subscription.id),
        },
      ],
    );
  }, [deleteSubscriptionMutation, subscription]);

  const handleSyncNow = useCallback(() => {
    if (!subscription) {
      return;
    }

    syncSubscriptionMutation.mutate(subscription.id);
  }, [subscription, syncSubscriptionMutation]);

  const handleToggleVisibility = useCallback(
    (nextValue: boolean) => {
      if (!calendar) {
        return;
      }

      toggleVisibilityMutation.mutate({
        calendarId: calendar.id,
        isVisible: nextValue,
      });
    },
    [calendar, toggleVisibilityMutation],
  );

  const handleCopySource = useCallback(async () => {
    if (!subscription?.url) {
      return;
    }

    await Clipboard.setStringAsync(subscription.url);
    Alert.alert("Copied", "The source URL is now on your clipboard.");
  }, [subscription?.url]);

  if (subscriptionsLoading) {
    return <LoadingScreen theme={theme} message="Loading calendar…" />;
  }

  if (!subscription) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.errorText}>Read-only calendar not found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StackScreenHeader
        title={isHoliday ? "Holiday Calendar" : "External Feed"}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Calendar</Text>

          <FieldLabel text="Name" theme={theme} />
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={(value) => {
              setName(value);
              if (fieldErrors.name) {
                setFieldErrors((previous) => ({
                  ...previous,
                  name: undefined,
                }));
              }
            }}
            placeholder="Calendar name"
            placeholderTextColor={theme.colors.mutedForeground}
          />
          {fieldErrors.name ? (
            <Text style={styles.errorText}>{fieldErrors.name}</Text>
          ) : null}

          <FieldLabel text="Color" theme={theme} />
          {!isNamedCalendarColor(color) ? (
            <View style={styles.customColorPreview}>
              <View
                style={[styles.previewSwatch, { backgroundColor: color }]}
              />
              <Text style={styles.previewText}>Current custom color</Text>
            </View>
          ) : null}
          <ColorPicker
            selectedColor={isNamedCalendarColor(color) ? color : undefined}
            onColorSelect={(nextColor) => {
              setColor(nextColor);
              if (fieldErrors.color) {
                setFieldErrors((previous) => ({
                  ...previous,
                  color: undefined,
                }));
              }
            }}
          />
          {fieldErrors.color ? (
            <Text style={styles.errorText}>{fieldErrors.color}</Text>
          ) : null}

          <View style={styles.toggleRow}>
            <View style={styles.toggleCopy}>
              <Text style={styles.toggleTitle}>Visible</Text>
              <Text style={styles.toggleText}>
                Hide this calendar without removing the subscription.
              </Text>
            </View>
            <Switch
              value={calendar?.isVisible ?? true}
              onValueChange={handleToggleVisibility}
              disabled={toggleVisibilityMutation.isPending || !calendar}
              trackColor={{
                false: theme.colors.input,
                true: theme.colors.primaryBase,
              }}
              thumbColor={theme.colors.background}
            />
          </View>
        </View>

        {!isHoliday ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sync</Text>
            <Pressable style={styles.secondaryButton} onPress={handleSyncNow}>
              {syncSubscriptionMutation.isPending ? (
                <ActivityIndicator
                  size="small"
                  color={theme.colors.foreground}
                />
              ) : (
                <Text style={styles.secondaryButtonText}>Sync Now</Text>
              )}
            </Pressable>
            <Text style={styles.helperText}>
              Last synced{" "}
              {formatLastSync(subscription.lastSyncAt).toLowerCase()}.
            </Text>
            {subscription.lastErrorMessage ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorCardText}>
                  {subscription.lastErrorMessage}
                </Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Holiday Source</Text>
            <Text style={styles.helperText}>
              Holiday calendars are read-only and refresh automatically in the
              background. Last synced{" "}
              {formatLastSync(subscription.lastSyncAt).toLowerCase()}.
            </Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Source</Text>
          <View style={styles.sourceRow}>
            <Text style={styles.sourceText} numberOfLines={2}>
              {subscription.url}
            </Text>
            <Pressable style={styles.inlineButton} onPress={handleCopySource}>
              <Feather name="copy" size={14} color={theme.colors.foreground} />
            </Pressable>
          </View>
        </View>

        <View style={styles.actionRow}>
          <Pressable style={styles.destructiveButton} onPress={handleRemove}>
            <Text style={styles.destructiveButtonText}>Remove</Text>
          </Pressable>
          <Pressable style={styles.primaryButton} onPress={handleSave}>
            {updateSubscriptionMutation.isPending ? (
              <ActivityIndicator
                size="small"
                color={theme.colors.primaryForeground}
              />
            ) : (
              <Text style={styles.primaryButtonText}>Save</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function FieldLabel({ text, theme }: { text: string; theme: ThemeTokens }) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  return <Text style={styles.fieldLabel}>{text}</Text>;
}

function createStyles(theme: ThemeTokens) {
  const view = {
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    centered: {
      flex: 1,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      backgroundColor: theme.colors.background,
      padding: theme.spacing["4"],
      gap: theme.spacing["2"],
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      padding: theme.spacing["4"],
      paddingBottom: theme.spacing["8"],
      gap: theme.spacing["3"],
    },
    card: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.lg,
      backgroundColor: theme.colors.card,
      padding: theme.spacing["4"],
      gap: theme.spacing["2"],
    },
    input: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.background,
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["3"],
      color: theme.colors.foreground,
    },
    customColorPreview: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["2"],
      paddingVertical: theme.spacing["1"],
    },
    previewSwatch: {
      width: 14,
      height: 14,
      borderRadius: theme.borderRadius.full,
    },
    toggleRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      gap: theme.spacing["3"],
      paddingTop: theme.spacing["1"],
    },
    toggleCopy: {
      flex: 1,
      gap: 2,
    },
    secondaryButton: {
      alignSelf: "flex-start" as const,
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["2"],
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.muted,
      borderWidth: 1,
      borderColor: theme.colors.border,
      minWidth: 112,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    errorCard: {
      borderWidth: 1,
      borderColor: theme.colors.destructive + "26",
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.destructive + "0D",
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["3"],
    },
    sourceRow: {
      flexDirection: "row" as const,
      alignItems: "flex-start" as const,
      gap: theme.spacing["2"],
    },
    inlineButton: {
      width: 34,
      height: 34,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderRadius: theme.borderRadius.full,
      backgroundColor: theme.colors.muted,
    },
    actionRow: {
      flexDirection: "row" as const,
      gap: theme.spacing["3"],
    },
    primaryButton: {
      flex: 1,
      minHeight: 48,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.primaryBase,
    },
    destructiveButton: {
      flex: 1,
      minHeight: 48,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.destructive + "16",
      borderWidth: 1,
      borderColor: theme.colors.destructive + "26",
    },
  } satisfies Record<string, ViewStyle | TextStyle>;

  const text = {
    helperText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
    },
    errorText: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.destructive,
    },
    cardTitle: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      color: theme.colors.foreground,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
    },
    fieldLabel: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.mutedForeground,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      marginTop: theme.spacing["1"],
    },
    previewText: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.mutedForeground,
    },
    toggleTitle: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
    },
    toggleText: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.mutedForeground,
    },
    secondaryButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
    },
    errorCardText: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.destructive,
    },
    sourceText: {
      flex: 1,
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
    },
    primaryButtonText: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      color: theme.colors.primaryForeground,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
    },
    destructiveButtonText: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      color: theme.colors.destructive,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
