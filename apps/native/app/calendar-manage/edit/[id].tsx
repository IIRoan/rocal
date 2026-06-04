import { useCallback, useEffect, useMemo, useState } from "react";
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
import { AppScreen } from "../../../src/components/layout";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import {
  getErrorMessage,
  type EventColor,
  type UpdateCalendarRequest,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { StackScreenHeader } from "../../../src/components/StackScreenHeader";
import { ColorPicker } from "../../../src/components/event/ColorPicker";
import { useTheme } from "../../../src/providers/ThemeProvider";
import { useToast } from "../../../src/providers/ToastProvider";
import { calendarApiService } from "../../../src/lib/api";
import { QUERY_KEYS } from "../../../src/lib/query-keys";
import { resolveCalendarSwatchColor } from "../../../src/lib/calendar-color-utils";
import {
  LoadingScreen,
  InlineLoader,
} from "../../../src/components/ui/loading";

type DeleteAction = "delete_events" | "move_events";

export default function CalendarEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [color, setColor] = useState<EventColor>("blue");
  const [isVisible, setIsVisible] = useState(true);
  const [isDefault, setIsDefault] = useState(false);
  const [forceFullEncryption, setForceFullEncryption] = useState(false);
  const [selectedMoveTargetId, setSelectedMoveTargetId] = useState("");
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [formReady, setFormReady] = useState(false);

  const { data: calendar, isLoading: calendarLoading } = useQuery({
    queryKey: [...QUERY_KEYS.calendars(), id],
    queryFn: async () => {
      const calendars = await calendarApiService.getCalendars();
      return calendars.find((entry) => entry.id === id) ?? null;
    },
    enabled: !!id,
  });

  const { data: allCalendars = [] } = useQuery({
    queryKey: QUERY_KEYS.calendars(),
    queryFn: () => calendarApiService.getCalendars(),
  });

  const { data: shareLink, isLoading: shareLinkLoading } = useQuery({
    queryKey: QUERY_KEYS.calendarShareLink(id ?? ""),
    queryFn: () => calendarApiService.getCalendarShareLink(id!),
    enabled: !!id,
  });

  useEffect(() => {
    if (!calendar || formReady) {
      return;
    }

    setName(calendar.name);
    setColor(calendar.color);
    setIsVisible(calendar.isVisible);
    setIsDefault(calendar.isDefault);
    setForceFullEncryption(calendar.forceFullEncryption === true);
    setFormReady(true);
  }, [calendar, formReady]);

  const otherOwnedCalendars = useMemo(
    () =>
      allCalendars.filter((entry) => entry.id !== id && entry.kind === "owned"),
    [allCalendars, id],
  );

  useEffect(() => {
    if (selectedMoveTargetId || otherOwnedCalendars.length === 0) {
      return;
    }

    setSelectedMoveTargetId(otherOwnedCalendars[0].id);
  }, [otherOwnedCalendars, selectedMoveTargetId]);

  const updateMutation = useMutation({
    mutationFn: (request: UpdateCalendarRequest) =>
      calendarApiService.updateCalendar(id!, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.calendars() });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings() });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.calendarShareLink(id!),
      });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      toast("Calendar saved");
      router.back();
    },
    onError: (error) => {
      toast(getErrorMessage(error, "Failed to update calendar"), "error");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({
      action,
      moveTargetId,
    }: {
      action: DeleteAction;
      moveTargetId?: string;
    }) => calendarApiService.deleteCalendarAdvanced(id!, action, moveTargetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.calendars() });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings() });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      toast("Calendar deleted");
      router.back();
    },
    onError: (error) => {
      toast(getErrorMessage(error, "Failed to delete calendar"), "error");
    },
  });

  const enableShareMutation = useMutation({
    mutationFn: (regenerate: boolean) =>
      calendarApiService.enableCalendarShareLink(
        id!,
        regenerate ? { regenerate: true } : undefined,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.calendarShareLink(id!),
      });
      toast("Share link enabled");
    },
    onError: (error) => {
      toast(
        getErrorMessage(error, "Failed to enable calendar sharing"),
        "error",
      );
    },
  });

  const disableShareMutation = useMutation({
    mutationFn: () => calendarApiService.disableCalendarShareLink(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.calendarShareLink(id!),
      });
      toast("Share link disabled");
    },
    onError: (error) => {
      toast(
        getErrorMessage(error, "Failed to disable calendar sharing"),
        "error",
      );
    },
  });

  const validate = useCallback(() => {
    const nextErrors: string[] = [];

    if (!name.trim()) {
      nextErrors.push("Calendar name is required");
    }
    if (name.trim().length > 100) {
      nextErrors.push("Calendar name must be 100 characters or less");
    }

    setValidationErrors(nextErrors);
    return nextErrors.length === 0;
  }, [name]);

  const handleSave = useCallback(() => {
    if (!validate()) {
      return;
    }

    updateMutation.mutate({
      name: name.trim(),
      color,
      isVisible,
      isDefault,
      forceFullEncryption,
    });
  }, [
    color,
    forceFullEncryption,
    isDefault,
    isVisible,
    name,
    updateMutation,
    validate,
  ]);

  const confirmDelete = useCallback(
    (action: DeleteAction) => {
      if (calendar?.isDefault) {
        Alert.alert(
          "Cannot delete default calendar",
          "Make another calendar default before deleting this one.",
        );
        return;
      }

      if (action === "move_events" && !selectedMoveTargetId) {
        Alert.alert(
          "Choose a destination",
          "Select another owned calendar to receive this calendar's events.",
        );
        return;
      }

      const message =
        action === "delete_events"
          ? "All events in this calendar will be permanently deleted."
          : "Events will be moved to the selected calendar before this calendar is deleted.";

      Alert.alert("Delete calendar?", message, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            deleteMutation.mutate({
              action,
              moveTargetId:
                action === "move_events" ? selectedMoveTargetId : undefined,
            }),
        },
      ]);
    },
    [calendar?.isDefault, deleteMutation, selectedMoveTargetId],
  );

  const handleCopyShareLink = useCallback(async () => {
    if (!shareLink?.shareUrl) {
      return;
    }

    await Clipboard.setStringAsync(shareLink.shareUrl);
    toast("Share link copied to clipboard");
  }, [shareLink?.shareUrl]);

  if (calendarLoading) {
    return <LoadingScreen theme={theme} message="Loading calendar…" />;
  }

  if (!calendar) {
    return (
      <AppScreen>
        <View style={styles.centered}>
          <Text style={styles.errorText}>Calendar not found.</Text>
        </View>
      </AppScreen>
    );
  }

  const shareBusy =
    shareLinkLoading ||
    enableShareMutation.isPending ||
    disableShareMutation.isPending;

  return (
    <AppScreen header={<StackScreenHeader title="Edit Calendar" />}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>{calendar.name}</Text>
          <Text style={styles.heroText}>
            Update visibility, sharing, and encryption settings for this owned
            calendar.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Calendar</Text>

          <FieldLabel text="Name" theme={theme} />
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Calendar name"
            placeholderTextColor={theme.colors.mutedForeground}
            maxLength={100}
          />

          <FieldLabel text="Color" theme={theme} />
          <ColorPicker selectedColor={color} onColorSelect={setColor} />

          <View style={styles.toggleRow}>
            <View style={styles.toggleCopy}>
              <Text style={styles.toggleTitle}>Visible</Text>
              <Text style={styles.toggleText}>
                Hide this calendar without deleting its events.
              </Text>
            </View>
            <Switch
              value={isVisible}
              onValueChange={setIsVisible}
              trackColor={{
                false: theme.colors.input,
                true: theme.colors.primaryBase,
              }}
              thumbColor={theme.colors.background}
            />
          </View>

          <View style={styles.inlineActionRow}>
            <View style={styles.inlineActionCopy}>
              <Text style={styles.toggleTitle}>Default Calendar</Text>
              <Text style={styles.toggleText}>
                New events open in your default calendar first.
              </Text>
            </View>
            {isDefault ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Default</Text>
              </View>
            ) : (
              <Pressable
                style={styles.inlineButton}
                onPress={() => setIsDefault(true)}
              >
                <Text style={styles.inlineButtonText}>Set Default</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.toggleRow}>
            <View style={styles.toggleCopy}>
              <Text style={styles.toggleTitle}>Full Calendar Encryption</Text>
              <Text style={styles.toggleText}>
                Drop plaintext shadows for encrypted events in this calendar.
              </Text>
            </View>
            <Switch
              value={forceFullEncryption}
              onValueChange={setForceFullEncryption}
              trackColor={{
                false: theme.colors.input,
                true: theme.colors.primaryBase,
              }}
              thumbColor={theme.colors.background}
            />
          </View>

          {forceFullEncryption ? (
            <Text style={styles.helperText}>
              Existing fully encrypted events may need to be reopened and saved
              before ICS sharing can be enabled again.
            </Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sharing</Text>
          <Text style={styles.helperText}>
            Share links publish an ICS feed for this owned calendar. If you
            recently enabled full encryption, reopen and resave encrypted events
            before sharing.
          </Text>

          {shareBusy ? (
            <InlineLoader theme={theme} message="Updating share link…" />
          ) : shareLink?.enabled ? (
            <>
              {shareLink.shareUrl ? (
                <View style={styles.sourceRow}>
                  <Text style={styles.sourceText} numberOfLines={2}>
                    {shareLink.shareUrl}
                  </Text>
                </View>
              ) : null}

              <View style={styles.buttonCluster}>
                <Pressable
                  style={styles.secondaryButton}
                  onPress={handleCopyShareLink}
                >
                  <Text style={styles.secondaryButtonText}>Copy Link</Text>
                </Pressable>
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => enableShareMutation.mutate(true)}
                >
                  <Text style={styles.secondaryButtonText}>Regenerate</Text>
                </Pressable>
                <Pressable
                  style={styles.destructiveOutlineButton}
                  onPress={() => disableShareMutation.mutate()}
                >
                  <Text style={styles.destructiveOutlineButtonText}>
                    Disable
                  </Text>
                </Pressable>
              </View>
            </>
          ) : (
            <Pressable
              style={styles.primaryButtonWide}
              onPress={() => enableShareMutation.mutate(false)}
            >
              <Text style={styles.primaryButtonText}>Enable Share Link</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Delete Calendar</Text>
          {calendar.isDefault ? (
            <Text style={styles.helperText}>
              Make another calendar default before deleting this one.
            </Text>
          ) : (
            <Text style={styles.helperText}>
              Delete this calendar and either remove its events or move them
              into another owned calendar first.
            </Text>
          )}

          {otherOwnedCalendars.length > 0 ? (
            <>
              <FieldLabel text="Move Events To" theme={theme} />
              <View style={styles.selectionList}>
                {otherOwnedCalendars.map((entry) => {
                  const selected = entry.id === selectedMoveTargetId;
                  return (
                    <Pressable
                      key={entry.id}
                      style={styles.selectionRow}
                      onPress={() => setSelectedMoveTargetId(entry.id)}
                    >
                      <View
                        style={[
                          styles.selectionSwatch,
                          {
                            backgroundColor: resolveCalendarSwatchColor(
                              entry.color,
                              theme,
                            ),
                          },
                        ]}
                      />
                      <View style={styles.selectionCopy}>
                        <Text style={styles.selectionTitle}>{entry.name}</Text>
                        <Text style={styles.selectionMeta}>
                          {entry.isDefault
                            ? "Default calendar"
                            : "Owned calendar"}
                        </Text>
                      </View>
                      {selected ? (
                        <Text style={styles.badgeText}>Selected</Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          <View style={styles.buttonCluster}>
            <Pressable
              style={styles.destructiveOutlineButton}
              onPress={() => confirmDelete("delete_events")}
              disabled={deleteMutation.isPending || calendar.isDefault}
            >
              <Text style={styles.destructiveOutlineButtonText}>
                Delete Events
              </Text>
            </Pressable>
            {otherOwnedCalendars.length > 0 ? (
              <Pressable
                style={styles.destructiveOutlineButton}
                onPress={() => confirmDelete("move_events")}
                disabled={deleteMutation.isPending || calendar.isDefault}
              >
                <Text style={styles.destructiveOutlineButtonText}>
                  Move & Delete
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {validationErrors.length > 0 ? (
          <View style={styles.errorCard}>
            {validationErrors.map((entry) => (
              <Text key={entry} style={styles.errorText}>
                {entry}
              </Text>
            ))}
          </View>
        ) : null}

        <Pressable style={styles.primaryButtonWide} onPress={handleSave}>
          {updateMutation.isPending ? (
            <ActivityIndicator
              size="small"
              color={theme.colors.primaryForeground}
            />
          ) : (
            <Text style={styles.primaryButtonText}>Save Changes</Text>
          )}
        </Pressable>
      </ScrollView>
    </AppScreen>
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
      justifyContent: "center" as const,
      alignItems: "center" as const,
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
    heroCard: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.lg,
      backgroundColor: theme.colors.card,
      padding: theme.spacing["4"],
      gap: theme.spacing["1"],
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
    toggleRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      gap: theme.spacing["3"],
      marginTop: theme.spacing["1"],
    },
    inlineActionRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      gap: theme.spacing["3"],
      marginTop: theme.spacing["1"],
    },
    inlineActionCopy: {
      flex: 1,
    },
    toggleCopy: {
      flex: 1,
    },
    badge: {
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["1"],
      borderRadius: theme.borderRadius.full,
      backgroundColor: theme.colors.primaryBase + "14",
    },
    inlineButton: {
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["2"],
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.muted,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    sourceRow: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.background,
      padding: theme.spacing["3"],
    },
    buttonCluster: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      gap: theme.spacing["2"],
    },
    secondaryButton: {
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["2"],
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.muted,
      borderWidth: 1,
      borderColor: theme.colors.border,
      minWidth: 110,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    destructiveOutlineButton: {
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["2"],
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.destructive + "10",
      borderWidth: 1,
      borderColor: theme.colors.destructive + "26",
      minWidth: 110,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    primaryButtonWide: {
      minHeight: 48,
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.primaryBase,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      paddingHorizontal: theme.spacing["4"],
    },
    selectionList: {
      gap: theme.spacing["2"],
    },
    selectionRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["3"],
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.background,
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["3"],
    },
    selectionSwatch: {
      width: 14,
      height: 14,
      borderRadius: theme.borderRadius.full,
      flexShrink: 0,
    },
    selectionCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    errorCard: {
      borderWidth: 1,
      borderColor: theme.colors.destructive + "26",
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.destructive + "0D",
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["3"],
      gap: theme.spacing["1"],
    },
  } satisfies Record<string, ViewStyle | TextStyle>;

  const text = {
    heroTitle: {
      fontSize: theme.typography.fontSize.lg.size,
      lineHeight: theme.typography.fontSize.lg.lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    heroText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
    },
    cardTitle: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    fieldLabel: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.mutedForeground,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      marginTop: theme.spacing["1"],
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
      marginTop: theme.spacing["1"],
    },
    helperText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
    },
    badgeText: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.primaryBase,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
    },
    inlineButtonText: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.foreground,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
    },
    sourceText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
    },
    secondaryButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
    },
    destructiveOutlineButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.destructive,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
    },
    primaryButtonText: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      color: theme.colors.primaryForeground,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
    },
    selectionTitle: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
    },
    selectionMeta: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.mutedForeground,
    },
    errorText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.destructive,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
