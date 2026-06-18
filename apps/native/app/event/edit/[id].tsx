import { useCallback, useMemo, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { AppScreen, NavigationHeader } from "../../../src/components/layout";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CalendarEvent,
  CreateEventRequest,
  RecurrenceEditScope,
} from "@workspace/calendar-core";
import { resolveTimezone } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../../src/providers/ThemeProvider";
import { useToast } from "../../../src/providers/ToastProvider";
import { calendarApiService } from "../../../src/lib/api";
import { QUERY_KEYS } from "../../../src/lib/query-keys";
import { EventForm } from "../../../src/components/event/EventForm";
import { LoadingScreen } from "../../../src/components/ui/loading";
import { toTimezonePickerISOString } from "../../../src/components/event/event-form-utils";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Map a CalendarEvent to the Partial<CreateEventRequest> shape expected by
 * EventForm's `initialValues` prop.
 */
function eventToInitialValues(
  event: CalendarEvent,
  timezone?: string,
): Partial<CreateEventRequest> {
  const resolvedTimezone = resolveTimezone(timezone ?? event.timezone);
  return {
    title: event.title,
    description: event.description ?? undefined,
    start: toTimezonePickerISOString(new Date(event.start), resolvedTimezone),
    end: toTimezonePickerISOString(new Date(event.end), resolvedTimezone),
    timezone: resolvedTimezone,
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
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ─── Route params ──────────────────────────────────────────────────────────

  const { id, scope, occurrenceDate } = useLocalSearchParams<{
    id: string;
    scope?: RecurrenceEditScope;
    occurrenceDate?: string;
  }>();

  // ─── Server errors ─────────────────────────────────────────────────────────

  const [serverErrors, setServerErrors] = useState<string[]>([]);

  // ─── Fetch event data ──────────────────────────────────────────────────────

  const { data: event, isLoading: eventLoading } = useQuery({
    queryKey: QUERY_KEYS.eventDetail(id ?? ""),
    queryFn: () => calendarApiService.getEvent(id!),
    enabled: !!id,
  });

  // ─── Fetch calendars ───────────────────────────────────────────────────────

  const { data: calendars, isLoading: calendarsLoading } = useQuery({
    queryKey: QUERY_KEYS.calendars(),
    queryFn: () => calendarApiService.getCalendars(),
  });
  const { data: settings } = useQuery({
    queryKey: QUERY_KEYS.settings(),
    queryFn: () => calendarApiService.getUserSettings(),
  });
  const resolvedTimezone = resolveTimezone(settings?.timezone);

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
      toast("Event updated");
      router.back();
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
    router.back();
  }, [router]);

  // ─── Compute initial values from fetched event ─────────────────────────────

  const initialValues = useMemo(() => {
    if (!event) return undefined;
    return eventToInitialValues(event, resolvedTimezone);
  }, [event, resolvedTimezone]);

  // ─── Loading state ─────────────────────────────────────────────────────────

  if (eventLoading || calendarsLoading) {
    return <LoadingScreen theme={theme} message="Loading…" />;
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <AppScreen
      header={<NavigationHeader variant="form" title="Edit Event" />}
      edges={["top"]}
    >
      <EventForm
        calendars={calendars ?? []}
        serverErrors={serverErrors}
        isSubmitting={updateMutation.isPending}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        initialValues={initialValues}
      />
    </AppScreen>
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
  } satisfies Record<string, ViewStyle>;

  const text = {
    headerTitle: {
      fontSize: theme.typography.fontSize["xl"].size,
      lineHeight: theme.typography.fontSize["xl"].lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
