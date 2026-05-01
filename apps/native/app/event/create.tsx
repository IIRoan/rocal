import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateEventRequest } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../src/providers/ThemeProvider";
import { calendarApiService } from "../../src/lib/api";
import { QUERY_KEYS } from "../../src/lib/query-keys";
import { EventForm } from "../../src/components/event/EventForm";
import { toLocalISOString } from "../../src/components/event/event-form-utils";

// ─── Component ───────────────────────────────────────────────────────────────

export default function EventCreateScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const queryClient = useQueryClient();

  // ─── Query params (optional pre-fill from tapping a time slot) ───────────

  const { date, hour } = useLocalSearchParams<{
    date?: string;
    hour?: string;
  }>();

  // ─── Server errors ─────────────────────────────────────────────────────────

  const [serverErrors, setServerErrors] = useState<string[]>([]);

  // ─── Fetch calendars and categories ────────────────────────────────────────

  const {
    data: calendars,
    isLoading: calendarsLoading,
  } = useQuery({
    queryKey: QUERY_KEYS.calendars(),
    queryFn: () => calendarApiService.getCalendars(),
  });

  const {
    data: categories,
    isLoading: categoriesLoading,
  } = useQuery({
    queryKey: QUERY_KEYS.categories(),
    queryFn: () => calendarApiService.getCategories(),
  });

  // ─── Create mutation ───────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (data: CreateEventRequest) =>
      calendarApiService.createEvent(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      router.back();
    },
    onError: (err: unknown) => {
      const message =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "Failed to create event";
      setServerErrors([message]);
    },
  });

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(
    (data: CreateEventRequest) => {
      setServerErrors([]);
      createMutation.mutate(data);
    },
    [createMutation],
  );

  const handleCancel = useCallback(() => {
    router.back();
  }, [router]);

  // ─── Compute initial values from query params ─────────────────────────────

  const initialValues = useMemo(() => {
    if (!date) return undefined;

    const startDate = new Date(date);
    if (isNaN(startDate.getTime())) return undefined;

    if (hour !== undefined) {
      const h = parseInt(hour, 10);
      if (!isNaN(h)) {
        startDate.setHours(h, 0, 0, 0);
      }
    }

    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

    return {
      start: toLocalISOString(startDate),
      end: toLocalISOString(endDate),
    } satisfies Partial<CreateEventRequest>;
  }, [date, hour]);

  // ─── Loading state ─────────────────────────────────────────────────────────

  if (calendarsLoading || categoriesLoading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primaryBase} />
        <Text style={styles.loadingText}>Loading…</Text>
      </SafeAreaView>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle} accessibilityRole="header">
          Create Event
        </Text>
      </View>
      <EventForm
        calendars={calendars ?? []}
        categories={categories ?? []}
        serverErrors={serverErrors}
        isSubmitting={createMutation.isPending}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        initialValues={initialValues}
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
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["3"],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
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
    loadingText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
      marginTop: theme.spacing["2"],
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
