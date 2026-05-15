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
import type {
  CalendarEvent,
  CreateEventRequest,
  RecurrenceEditScope,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../../src/providers/ThemeProvider";
import { calendarApiService } from "../../../src/lib/api";
import { QUERY_KEYS } from "../../../src/lib/query-keys";
import { EventForm } from "../../../src/components/event/EventForm";
import { toLocalISOString } from "../../../src/components/event/event-form-utils";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Map a CalendarEvent to the Partial<CreateEventRequest> shape expected by
 * EventForm's `initialValues` prop.
 */
function eventToInitialValues(
  event: CalendarEvent,
): Partial<CreateEventRequest> {
  return {
    title: event.title,
    description: event.description ?? undefined,
    start: toLocalISOString(new Date(event.start)),
    end: toLocalISOString(new Date(event.end)),
    timezone: event.timezone ?? undefined,
    allDay: event.allDay ?? false,
    location: event.location ?? undefined,
    color: event.color ?? undefined,
    calendarId: event.calendarId,
    reminder: event.reminder ?? undefined,
    recurrence: event.recurrence ?? undefined,
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function EventEditScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { back: routerBack } = useRouter();
  const queryClient = useQueryClient();

  // ─── Route params ──────────────────────────────────────────────────────────

  const { id, scope, occurrenceDate } = useLocalSearchParams<{
    id: string;
    scope?: RecurrenceEditScope;
    occurrenceDate?: string;
  }>();

  // ─── Server errors ─────────────────────────────────────────────────────────

  const [serverErrors, setServerErrors] = useState<string[]>([]);

  // ─── Fetch event data ──────────────────────────────────────────────────────

  const {
    data: event,
    isLoading: eventLoading,
  } = useQuery({
    queryKey: QUERY_KEYS.eventDetail(id ?? ""),
    queryFn: () => calendarApiService.getEvent(id!),
    enabled: !!id,
  });

  // ─── Fetch calendars ───────────────────────────────────────────────────────

  const {
    data: calendars,
    isLoading: calendarsLoading,
  } = useQuery({
    queryKey: QUERY_KEYS.calendars(),
    queryFn: () => calendarApiService.getCalendars(),
  });

  // ─── Update mutation ───────────────────────────────────────────────────────

  const updateMutation = useMutation({
    mutationFn: (data: CreateEventRequest) => {
      if (scope) {
        // Recurring event edit with scope
        return calendarApiService.editRecurringEvent(id!, {
          editScope: scope,
          occurrenceDate,
          updates: data,
        });
      }
      return calendarApiService.updateEvent(id!, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.eventDetail(id!),
      });
      routerBack();
    },
    onError: (err: unknown) => {
      const message =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "Failed to update event";
      setServerErrors([message]);
    },
  });

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(
    (data: CreateEventRequest) => {
      setServerErrors([]);
      updateMutation.mutate(data);
    },
    [updateMutation],
  );

  const handleCancel = useCallback(() => {
    routerBack();
  }, [routerBack]);

  // ─── Compute initial values from fetched event ─────────────────────────────

  const initialValues = useMemo(() => {
    if (!event) return undefined;
    return eventToInitialValues(event);
  }, [event]);

  // ─── Loading state ─────────────────────────────────────────────────────────

  if (eventLoading || calendarsLoading) {
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
          Edit Event
        </Text>
      </View>
      <EventForm
        calendars={calendars ?? []}
        serverErrors={serverErrors}
        isSubmitting={updateMutation.isPending}
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
