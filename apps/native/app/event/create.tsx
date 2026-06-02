import { useCallback, useMemo, useRef, useState } from "react";
import {
  Alert,
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
import { useAuth } from "../../src/providers/AuthProvider";
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
import { toLocalISOString } from "../../src/components/event/event-form-utils";

// ─── Component ───────────────────────────────────────────────────────────────

export default function EventCreateScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();

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
    onSuccess: () => {
      // Replace optimistic data with real server data
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
    onError: (err: unknown) => {
      // Roll back the optimistic event
      rollbackFromSnapshot(queryClient, snapshotRef.current);
      const message =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "Failed to create event";
      Alert.alert("Couldn't create event", message);
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

  if (calendarsLoading) {
    return <LoadingScreen theme={theme} message="Loading…" />;
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
