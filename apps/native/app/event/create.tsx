import { useCallback, useMemo, useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { AppScreen, NavigationHeader } from "../../src/components/layout";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateEventRequest } from "@workspace/calendar-core";
import { resolveTimezone, wallClockToUtc } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../src/providers/ThemeProvider";
import { useAuth } from "../../src/providers/AuthProvider";
import { useRecentContacts } from "../../src/hooks/use-recent-contacts";
import { extractRecentContactEntries } from "../../src/lib/record-recent-contacts";
import { useToast } from "../../src/providers/ToastProvider";
import { toastOperationWarnings } from "../../src/lib/operation-warnings";
import { calendarApiService } from "../../src/lib/api";
import { QUERY_KEYS } from "../../src/lib/query-keys";
import {
  buildOptimisticEvent,
  generateOptimisticId,
  optimisticallyInsertEvent,
  rollbackFromSnapshot,
  type CacheSnapshot,
} from "../../src/lib/optimistic-events";
import { EventForm } from "../../src/components/event/EventForm";
import { LoadingScreen } from "../../src/components/ui/loading";
import { toTimezonePickerISOString, parseCreateEventCalendarDay } from "../../src/components/event/event-form-utils";

// ─── Component ───────────────────────────────────────────────────────────────

export default function EventCreateScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { recordUsage } = useRecentContacts();
  const { toast } = useToast();

  // ─── Query params (optional pre-fill from tapping a time slot) ───────────

  const { date, hour } = useLocalSearchParams<{
    date?: string;
    hour?: string;
  }>();

  // ─── Server errors ─────────────────────────────────────────────────────────

  const [serverErrors, setServerErrors] = useState<string[]>([]);

  // Track snapshot for rollback; useRef so it survives re-renders
  const snapshotRef = useRef<CacheSnapshot>([]);

  // ─── Fetch calendars ───────────────────────────────────────────────────────

  const { data: calendars, isLoading: calendarsLoading } = useQuery({
    queryKey: QUERY_KEYS.calendars(),
    queryFn: () => calendarApiService.getCalendars(),
  });
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: QUERY_KEYS.settings(),
    queryFn: () => calendarApiService.getUserSettings(),
  });
  const resolvedTimezone = resolveTimezone(settings?.timezone);

  // ─── Create mutation (optimistic) ─────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (data: CreateEventRequest) =>
      calendarApiService.createEvent(data),
    onMutate: async (data: CreateEventRequest) => {
      const tempId = generateOptimisticId();
      const optimisticEvent = buildOptimisticEvent(
        data,
        user?.id ?? "",
        tempId,
      );
      snapshotRef.current = await optimisticallyInsertEvent(
        queryClient,
        optimisticEvent,
      );
      // Navigate back immediately so the user sees the event in the timeline
      router.back();
      return { tempId };
    },
    onSuccess: (savedEvent, variables) => {
      // Replace optimistic data with real server data
      queryClient.invalidateQueries({ queryKey: ["events"] });
      const entries = extractRecentContactEntries(
        variables.participants,
        user?.email,
      );
      if (entries.length > 0) {
        recordUsage(entries, "calendar");
      }
      toast("Event created");
      toastOperationWarnings(toast, savedEvent);
    },
    onError: (err: unknown) => {
      // Roll back the optimistic event
      rollbackFromSnapshot(queryClient, snapshotRef.current);
      const message =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "Failed to create event";
      toast(message, "error");
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

    const calendarDay = parseCreateEventCalendarDay(date, resolvedTimezone);
    if (!calendarDay) return undefined;

    if (hour !== undefined) {
      const h = parseInt(hour, 10);
      if (!isNaN(h)) {
        const zonedStart = wallClockToUtc(calendarDay, h, 0, resolvedTimezone);
        const zonedEnd = new Date(zonedStart.getTime() + 60 * 60 * 1000);
        return {
          start: toTimezonePickerISOString(zonedStart, resolvedTimezone),
          end: toTimezonePickerISOString(zonedEnd, resolvedTimezone),
          timezone: resolvedTimezone,
        } satisfies Partial<CreateEventRequest>;
      }
    }

    const zonedStart = wallClockToUtc(calendarDay, 0, 0, resolvedTimezone);
    const zonedEnd = new Date(zonedStart.getTime() + 60 * 60 * 1000);

    return {
      start: toTimezonePickerISOString(zonedStart, resolvedTimezone),
      end: toTimezonePickerISOString(zonedEnd, resolvedTimezone),
      timezone: resolvedTimezone,
    } satisfies Partial<CreateEventRequest>;
  }, [date, hour, resolvedTimezone]);

  // ─── Loading state ─────────────────────────────────────────────────────────

  if (calendarsLoading || settingsLoading) {
    return <LoadingScreen theme={theme} message="Loading…" />;
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <AppScreen
      header={<NavigationHeader variant="form" title="Create Event" />}
      edges={["top"]}
    >
      <EventForm
        calendars={calendars ?? []}
        serverErrors={serverErrors}
        isSubmitting={createMutation.isPending}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        initialValues={initialValues}
        timezone={resolvedTimezone}
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
