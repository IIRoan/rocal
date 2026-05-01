import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  Calendar,
  EventColor,
  UpdateCalendarRequest,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../../src/providers/ThemeProvider";
import { calendarApiService } from "../../../src/lib/api";
import { QUERY_KEYS } from "../../../src/lib/query-keys";
import { ColorPicker } from "../../../src/components/event/ColorPicker";
import * as Clipboard from "expo-clipboard";

// ─── Types ───────────────────────────────────────────────────────────────────

type DeleteAction = "delete_events" | "move_events";

// ─── Component ───────────────────────────────────────────────────────────────

export default function CalendarEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const queryClient = useQueryClient();

  // ─── Form state ────────────────────────────────────────────────────────────

  const [name, setName] = useState("");
  const [color, setColor] = useState<EventColor>("blue");
  const [isVisible, setIsVisible] = useState(true);
  const [formInitialized, setFormInitialized] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [serverErrors, setServerErrors] = useState<string[]>([]);

  // ─── Delete modal state ────────────────────────────────────────────────────

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [targetCalendarId, setTargetCalendarId] = useState<string | null>(null);

  // ─── Share link state ──────────────────────────────────────────────────────

  const [linkCopied, setLinkCopied] = useState(false);

  // ─── Data fetching ─────────────────────────────────────────────────────────

  const {
    data: calendar,
    isLoading: calendarLoading,
  } = useQuery({
    queryKey: [...QUERY_KEYS.calendars(), id],
    queryFn: async () => {
      const calendars = await calendarApiService.getCalendars();
      return calendars.find((c) => c.id === id) ?? null;
    },
    enabled: !!id,
  });

  // Initialize form when calendar data loads
  if (calendar && !formInitialized) {
    setName(calendar.name);
    setColor(calendar.color as EventColor);
    setIsVisible(calendar.isVisible);
    setFormInitialized(true);
  }

  // Fetch all calendars for move-events target selection
  const { data: allCalendars } = useQuery({
    queryKey: QUERY_KEYS.calendars(),
    queryFn: () => calendarApiService.getCalendars(),
  });

  // Fetch share link status
  const {
    data: shareLink,
    isLoading: shareLinkLoading,
  } = useQuery({
    queryKey: QUERY_KEYS.calendarShareLink(id ?? ""),
    queryFn: () => calendarApiService.getCalendarShareLink(id!),
    enabled: !!id,
  });

  // ─── Update mutation ───────────────────────────────────────────────────────

  const updateMutation = useMutation({
    mutationFn: (data: UpdateCalendarRequest) =>
      calendarApiService.updateCalendar(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.calendars() });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      router.back();
    },
    onError: (err: unknown) => {
      const message =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "Failed to update calendar";
      setServerErrors([message]);
    },
  });

  // ─── Delete mutation ───────────────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: ({
      action,
      moveTargetId,
    }: {
      action: DeleteAction;
      moveTargetId?: string;
    }) =>
      calendarApiService.deleteCalendarAdvanced(
        id!,
        action,
        moveTargetId,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.calendars() });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      router.back();
    },
    onError: (err: unknown) => {
      const message =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "Failed to delete calendar";
      setServerErrors([message]);
    },
  });

  // ─── Share link mutations ──────────────────────────────────────────────────

  const enableShareMutation = useMutation({
    mutationFn: () => calendarApiService.enableCalendarShareLink(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.calendarShareLink(id!),
      });
    },
    onError: (err: unknown) => {
      const message =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "Failed to enable share link";
      setServerErrors([message]);
    },
  });

  const disableShareMutation = useMutation({
    mutationFn: () => calendarApiService.disableCalendarShareLink(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.calendarShareLink(id!),
      });
      setLinkCopied(false);
    },
    onError: (err: unknown) => {
      const message =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "Failed to disable share link";
      setServerErrors([message]);
    },
  });

  // ─── Validation ────────────────────────────────────────────────────────────

  const validate = useCallback((): boolean => {
    const errors: string[] = [];
    if (!name.trim()) {
      errors.push("Calendar name is required");
    }
    if (name.trim().length > 100) {
      errors.push("Calendar name must be 100 characters or less");
    }
    setValidationErrors(errors);
    return errors.length === 0;
  }, [name]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(() => {
    setServerErrors([]);
    if (!validate()) return;

    updateMutation.mutate({
      name: name.trim(),
      color,
      isVisible,
    });
  }, [name, color, isVisible, validate, updateMutation]);

  const handleCancel = useCallback(() => {
    router.back();
  }, [router]);

  const handleDeletePress = useCallback(() => {
    if (calendar?.isDefault) {
      Alert.alert(
        "Cannot delete",
        "The default calendar cannot be deleted.",
        [{ text: "OK" }],
      );
      return;
    }
    setDeleteModalVisible(true);
  }, [calendar]);

  const handleDeleteWithEvents = useCallback(() => {
    setDeleteModalVisible(false);
    Alert.alert(
      "Delete calendar and events?",
      "All events in this calendar will be permanently deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            deleteMutation.mutate({ action: "delete_events" }),
        },
      ],
    );
  }, [deleteMutation]);

  const handleMoveEvents = useCallback(
    (moveToId: string) => {
      setDeleteModalVisible(false);
      setTargetCalendarId(null);
      Alert.alert(
        "Delete calendar?",
        "Events will be moved to the selected calendar.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () =>
              deleteMutation.mutate({
                action: "move_events",
                moveTargetId: moveToId,
              }),
          },
        ],
      );
    },
    [deleteMutation],
  );

  const handleCopyShareLink = useCallback(async () => {
    if (shareLink?.shareUrl) {
      await Clipboard.setStringAsync(shareLink.shareUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  }, [shareLink]);

  const handleEnableShare = useCallback(() => {
    enableShareMutation.mutate();
  }, [enableShareMutation]);

  const handleDisableShare = useCallback(() => {
    Alert.alert(
      "Disable sharing?",
      "The share link will stop working. You can re-enable it later.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disable",
          style: "destructive",
          onPress: () => disableShareMutation.mutate(),
        },
      ],
    );
  }, [disableShareMutation]);

  // ─── Other calendars for move target ───────────────────────────────────────

  const otherCalendars = useMemo(
    () => (allCalendars ?? []).filter((c) => c.id !== id),
    [allCalendars, id],
  );

  // ─── Loading state ─────────────────────────────────────────────────────────

  if (calendarLoading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primaryBase} />
        <Text style={styles.loadingText}>Loading…</Text>
      </SafeAreaView>
    );
  }

  if (!calendar) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.errorText}>Calendar not found</Text>
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
  const isShareEnabled = shareLink?.enabled ?? false;
  const isShareLoading =
    shareLinkLoading ||
    enableShareMutation.isPending ||
    disableShareMutation.isPending;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle} accessibilityRole="header">
          Edit Calendar
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
            placeholder="Calendar name"
            placeholderTextColor={theme.colors.mutedForeground}
            maxLength={100}
            accessibilityLabel="Calendar name"
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

        {/* Visibility toggle */}
        <View style={styles.toggleRow}>
          <Text style={styles.fieldLabel}>Visible</Text>
          <Switch
            value={isVisible}
            onValueChange={setIsVisible}
            trackColor={{
              false: theme.colors.muted,
              true: theme.colors.primaryBase,
            }}
            thumbColor={theme.colors.background}
            accessibilityLabel="Calendar visibility"
          />
        </View>

        {/* Sharing section */}
        <View style={styles.sectionDivider} />
        <View style={styles.fieldGroup}>
          <Text style={styles.sectionTitle}>Sharing</Text>
          {isShareLoading ? (
            <ActivityIndicator
              size="small"
              color={theme.colors.primaryBase}
              style={styles.shareLoading}
            />
          ) : isShareEnabled ? (
            <View style={styles.shareContainer}>
              {shareLink?.shareUrl ? (
                <View style={styles.shareLinkRow}>
                  <Text
                    style={styles.shareLinkText}
                    numberOfLines={1}
                    ellipsizeMode="middle"
                  >
                    {shareLink.shareUrl}
                  </Text>
                  <Pressable
                    style={styles.copyButton}
                    onPress={handleCopyShareLink}
                    accessibilityRole="button"
                    accessibilityLabel="Copy share link"
                  >
                    <Text style={styles.copyButtonText}>
                      {linkCopied ? "Copied!" : "Copy"}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
              <Pressable
                style={styles.disableShareButton}
                onPress={handleDisableShare}
                accessibilityRole="button"
                accessibilityLabel="Disable sharing"
              >
                <Text style={styles.disableShareButtonText}>
                  Disable Sharing
                </Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={styles.enableShareButton}
              onPress={handleEnableShare}
              accessibilityRole="button"
              accessibilityLabel="Enable ICS share link"
            >
              <Text style={styles.enableShareButtonText}>
                Enable ICS Share Link
              </Text>
            </Pressable>
          )}
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
              updateMutation.isPending && styles.submitButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={updateMutation.isPending}
            accessibilityRole="button"
            accessibilityLabel="Save calendar"
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
          accessibilityLabel="Delete calendar"
        >
          {deleteMutation.isPending ? (
            <ActivityIndicator
              size="small"
              color={theme.colors.destructiveForeground}
            />
          ) : (
            <Text style={styles.deleteButtonText}>Delete Calendar</Text>
          )}
        </Pressable>
      </ScrollView>

      {/* Delete options modal */}
      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setDeleteModalVisible(false)}
        >
          <View
            style={styles.modalContent}
            onStartShouldSetResponder={() => true}
          >
            <Text style={styles.modalTitle}>Delete Calendar</Text>
            <Text style={styles.modalDescription}>
              What would you like to do with the events in this calendar?
            </Text>

            {/* Delete all events option */}
            <Pressable
              style={styles.modalOption}
              onPress={handleDeleteWithEvents}
              accessibilityRole="button"
              accessibilityLabel="Delete all events"
            >
              <Text style={styles.modalOptionTextDestructive}>
                Delete all events
              </Text>
            </Pressable>

            {/* Move events option */}
            {otherCalendars.length > 0 ? (
              <>
                <Text style={styles.moveEventsLabel}>
                  Move events to another calendar:
                </Text>
                {otherCalendars.map((cal) => {
                  const calColor =
                    theme.colors.calendar[
                      cal.color as keyof typeof theme.colors.calendar
                    ]?.bg ?? theme.colors.primaryBase;
                  return (
                    <Pressable
                      key={cal.id}
                      style={styles.moveTargetRow}
                      onPress={() => handleMoveEvents(cal.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Move events to ${cal.name}`}
                    >
                      <View
                        style={[
                          styles.moveTargetDot,
                          { backgroundColor: calColor },
                        ]}
                      />
                      <Text style={styles.moveTargetText}>{cal.name}</Text>
                    </Pressable>
                  );
                })}
              </>
            ) : null}

            {/* Cancel */}
            <Pressable
              style={styles.modalCancelOption}
              onPress={() => setDeleteModalVisible(false)}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
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
    toggleRow: {
      flexDirection: "row" as const,
      justifyContent: "space-between" as const,
      alignItems: "center" as const,
      marginBottom: theme.spacing["4"],
    },
    sectionDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border,
      marginVertical: theme.spacing["2"],
    },
    shareContainer: {
      gap: theme.spacing["2"],
    },
    shareLinkRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["2"],
      backgroundColor: theme.colors.muted,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing["2"],
    },
    shareLoading: {
      marginTop: theme.spacing["2"],
    },
    copyButton: {
      backgroundColor: theme.colors.primaryBase,
      paddingVertical: theme.spacing["1"],
      paddingHorizontal: theme.spacing["2"],
      borderRadius: theme.borderRadius.sm,
    },
    enableShareButton: {
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingVertical: theme.spacing["2"],
      paddingHorizontal: theme.spacing["3"],
      borderRadius: theme.borderRadius.md,
      alignItems: "center" as const,
    },
    disableShareButton: {
      backgroundColor: theme.colors.muted,
      paddingVertical: theme.spacing["2"],
      paddingHorizontal: theme.spacing["3"],
      borderRadius: theme.borderRadius.md,
      alignItems: "center" as const,
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
    // Modal
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center" as const,
      alignItems: "center" as const,
    },
    modalContent: {
      width: "85%" as unknown as number,
      backgroundColor: theme.colors.card,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing["4"],
      maxHeight: "70%" as unknown as number,
    },
    modalOption: {
      paddingVertical: theme.spacing["3"],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    moveTargetRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      paddingVertical: theme.spacing["2"],
      paddingHorizontal: theme.spacing["2"],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    moveTargetDot: {
      width: 10,
      height: 10,
      borderRadius: theme.borderRadius.full,
      marginRight: theme.spacing["2"],
    },
    modalCancelOption: {
      paddingVertical: theme.spacing["3"],
      alignItems: "center" as const,
      marginTop: theme.spacing["2"],
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
    sectionTitle: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
      marginBottom: theme.spacing["2"],
    },
    shareLinkText: {
      flex: 1,
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
    },
    copyButtonText: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      fontWeight: theme.typography.fontWeight
        .medium as TextStyle["fontWeight"],
      color: theme.colors.primaryForeground,
    },
    enableShareButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      fontWeight: theme.typography.fontWeight
        .medium as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    disableShareButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      fontWeight: theme.typography.fontWeight
        .medium as TextStyle["fontWeight"],
      color: theme.colors.destructive,
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
    modalTitle: {
      fontSize: theme.typography.fontSize.lg.size,
      lineHeight: theme.typography.fontSize.lg.lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
      marginBottom: theme.spacing["2"],
    },
    modalDescription: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
      marginBottom: theme.spacing["3"],
    },
    modalOptionTextDestructive: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      color: theme.colors.destructive,
    },
    moveEventsLabel: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      fontWeight: theme.typography.fontWeight
        .medium as TextStyle["fontWeight"],
      color: theme.colors.foreground,
      marginTop: theme.spacing["3"],
      marginBottom: theme.spacing["1"],
    },
    moveTargetText: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      color: theme.colors.foreground,
    },
    modalCancelText: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      fontWeight: theme.typography.fontWeight
        .medium as TextStyle["fontWeight"],
      color: theme.colors.mutedForeground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
