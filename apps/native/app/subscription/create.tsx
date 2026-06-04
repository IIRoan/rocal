import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { AppScreen } from "../../src/components/layout";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import {
  partitionCalendarsByKind,
  getErrorMessage,
} from "@workspace/calendar-core";
import type { CreateSubscriptionRequest } from "@workspace/calendar-core";
import { NATIONAL_HOLIDAY_CALENDARS } from "@workspace/calendar-ics";
import type { ThemeTokens } from "@workspace/design-tokens";
import { StackScreenHeader } from "../../src/components/StackScreenHeader";
import { ColorPicker } from "../../src/components/event/ColorPicker";
import { useTheme } from "../../src/providers/ThemeProvider";
import { useToast } from "../../src/providers/ToastProvider";
import { calendarApiService } from "../../src/lib/api";
import { QUERY_KEYS } from "../../src/lib/query-keys";
import {
  isNamedCalendarColor,
  normalizeSubscriptionUrl,
  resolveCalendarSwatchColor,
  validateCreateSubscriptionInput,
  type SubscriptionFieldErrors,
} from "../../src/lib/subscription-utils";

type PickedIcsFile = {
  name: string;
  content: string;
};

export default function SubscriptionCreateScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [feedName, setFeedName] = useState("");
  const [feedUrl, setFeedUrl] = useState("");
  const [feedColor, setFeedColor] = useState<string>("indigo");
  const [feedErrors, setFeedErrors] = useState<SubscriptionFieldErrors>({});
  const [holidaySearch, setHolidaySearch] = useState("");
  const [pickedFile, setPickedFile] = useState<PickedIcsFile | null>(null);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>("");

  const { data: calendars = [] } = useQuery({
    queryKey: QUERY_KEYS.calendars(),
    queryFn: () => calendarApiService.getCalendars(),
  });

  const { data: subscriptions = [] } = useQuery({
    queryKey: QUERY_KEYS.subscriptions(),
    queryFn: () => calendarApiService.getSubscriptions(),
  });

  const { ownedCalendars } = useMemo(
    () => partitionCalendarsByKind(calendars),
    [calendars],
  );

  useEffect(() => {
    if (selectedCalendarId || ownedCalendars.length === 0) {
      return;
    }

    const defaultCalendar =
      ownedCalendars.find((calendar) => calendar.isDefault) ??
      ownedCalendars[0];
    if (defaultCalendar) {
      setSelectedCalendarId(defaultCalendar.id);
    }
  }, [ownedCalendars, selectedCalendarId]);

  const subscriptionByUrl = useMemo(
    () =>
      new Map(
        subscriptions.map((subscription) => [
          normalizeSubscriptionUrl(subscription.url),
          subscription,
        ]),
      ),
    [subscriptions],
  );

  const filteredHolidayCalendars = useMemo(() => {
    const search = holidaySearch.trim().toLowerCase();

    return NATIONAL_HOLIDAY_CALENDARS.filter((holidayCalendar) => {
      if (!search) return true;

      const haystack = [
        holidayCalendar.label,
        holidayCalendar.countryName,
        holidayCalendar.language,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(search);
    });
  }, [holidaySearch]);

  const createSubscriptionMutation = useMutation({
    mutationFn: (request: CreateSubscriptionRequest) =>
      calendarApiService.createSubscription(request),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.subscriptions() });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.calendars() });
      queryClient.invalidateQueries({ queryKey: ["events"] });

      if (variables.url === feedUrl.trim()) {
        setFeedName("");
        setFeedUrl("");
        setFeedColor("indigo");
        setFeedErrors({});
      }

      toast(`Added ${variables.name}`);
    },
    onError: (error) => {
      toast(
        getErrorMessage(error, "Failed to add read-only calendar"),
        "error",
      );
    },
  });

  const importIcsMutation = useMutation({
    mutationFn: ({
      calendarId,
      icsContent,
      fileName,
    }: {
      calendarId: string;
      icsContent: string;
      fileName: string;
    }) => calendarApiService.importICS({ calendarId, icsContent, fileName }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.calendars() });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      setPickedFile(null);
      toast(
        `Imported ${result.eventsCreated} of ${result.eventsTotal} events${
          result.calendarName ? ` into ${result.calendarName}` : ""
        }`,
      );
    },
    onError: (error) => {
      toast(getErrorMessage(error, "Failed to import .ics file"), "error");
    },
  });

  const handleAddExternalFeed = useCallback(() => {
    const nextErrors = validateCreateSubscriptionInput({
      name: feedName,
      url: feedUrl,
      color: feedColor,
    });

    setFeedErrors(nextErrors);

    if (nextErrors.name || nextErrors.url || nextErrors.color) {
      return;
    }

    createSubscriptionMutation.mutate({
      name: feedName.trim(),
      url: feedUrl.trim(),
      color: feedColor.trim(),
    });
  }, [createSubscriptionMutation, feedColor, feedName, feedUrl]);

  const handlePickFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets[0];
      if (!asset || !asset.name.toLowerCase().endsWith(".ics")) {
        toast("Choose a .ics calendar file to import", "error");
        return;
      }

      const file = new File(asset.uri);
      const content = await file.text();
      setPickedFile({ name: asset.name, content });
    } catch (error) {
      toast(
        getErrorMessage(error, "Failed to read the selected file"),
        "error",
      );
    }
  }, []);

  const handleImportFile = useCallback(() => {
    if (!pickedFile) {
      toast("Pick a .ics file before importing", "error");
      return;
    }

    if (!selectedCalendarId) {
      toast("Select an owned calendar to receive the imported events", "error");
      return;
    }

    importIcsMutation.mutate({
      calendarId: selectedCalendarId,
      icsContent: pickedFile.content,
      fileName: pickedFile.name,
    });
  }, [importIcsMutation, pickedFile, selectedCalendarId]);

  const handleAddHolidayCalendar = useCallback(
    (holidayCalendar: (typeof NATIONAL_HOLIDAY_CALENDARS)[number]) => {
      createSubscriptionMutation.mutate({
        name: holidayCalendar.label,
        url: holidayCalendar.url,
        color: holidayCalendar.defaultColor,
      });
    },
    [createSubscriptionMutation],
  );

  return (
    <AppScreen header={<StackScreenHeader title="Add Read-only Calendar" />}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>
            Add a synced or imported calendar
          </Text>
          <Text style={styles.heroText}>
            External feeds stay up to date automatically. Local .ics files
            import directly into one of your owned calendars.
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Feather
              name="link-2"
              size={16}
              color={theme.colors.mutedForeground}
            />
            <Text style={styles.cardTitle}>External Feed</Text>
          </View>

          <FieldLabel text="Name" theme={theme} />
          <TextInput
            style={styles.input}
            value={feedName}
            onChangeText={(value) => {
              setFeedName(value);
              if (feedErrors.name) {
                setFeedErrors((previous) => ({ ...previous, name: undefined }));
              }
            }}
            placeholder="Team Vacation Calendar"
            placeholderTextColor={theme.colors.mutedForeground}
          />
          {feedErrors.name ? (
            <Text style={styles.errorText}>{feedErrors.name}</Text>
          ) : null}

          <FieldLabel text="Feed URL" theme={theme} />
          <TextInput
            style={styles.input}
            value={feedUrl}
            onChangeText={(value) => {
              setFeedUrl(value);
              if (feedErrors.url) {
                setFeedErrors((previous) => ({ ...previous, url: undefined }));
              }
            }}
            placeholder="https://example.com/calendar.ics"
            placeholderTextColor={theme.colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {feedErrors.url ? (
            <Text style={styles.errorText}>{feedErrors.url}</Text>
          ) : null}

          <FieldLabel text="Color" theme={theme} />
          <ColorPicker
            selectedColor={
              isNamedCalendarColor(feedColor) ? feedColor : undefined
            }
            onColorSelect={(color) => setFeedColor(color)}
          />
          {feedErrors.color ? (
            <Text style={styles.errorText}>{feedErrors.color}</Text>
          ) : null}

          <Pressable
            style={styles.primaryButton}
            onPress={handleAddExternalFeed}
            disabled={createSubscriptionMutation.isPending}
          >
            {createSubscriptionMutation.isPending ? (
              <ActivityIndicator
                size="small"
                color={theme.colors.primaryForeground}
              />
            ) : (
              <Text style={styles.primaryButtonText}>Add Feed</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Feather
              name="download"
              size={16}
              color={theme.colors.mutedForeground}
            />
            <Text style={styles.cardTitle}>Import .ics File</Text>
          </View>

          {ownedCalendars.length === 0 ? (
            <Text style={styles.helperText}>
              Create an owned calendar before importing events from a local
              file.
            </Text>
          ) : (
            <>
              <Pressable
                style={styles.secondaryButton}
                onPress={handlePickFile}
              >
                <Text style={styles.secondaryButtonText}>
                  {pickedFile ? "Choose Another File" : "Choose .ics File"}
                </Text>
              </Pressable>

              {pickedFile ? (
                <View style={styles.fileCard}>
                  <Feather
                    name="file-text"
                    size={16}
                    color={theme.colors.mutedForeground}
                  />
                  <Text style={styles.fileName} numberOfLines={1}>
                    {pickedFile.name}
                  </Text>
                </View>
              ) : null}

              <FieldLabel text="Import Into" theme={theme} />
              <View style={styles.selectionList}>
                {ownedCalendars.map((calendar) => {
                  const selected = calendar.id === selectedCalendarId;
                  return (
                    <Pressable
                      key={calendar.id}
                      style={styles.selectionRow}
                      onPress={() => setSelectedCalendarId(calendar.id)}
                    >
                      <View
                        style={[
                          styles.selectionSwatch,
                          {
                            backgroundColor: resolveCalendarSwatchColor(
                              calendar.color,
                              theme,
                            ),
                          },
                        ]}
                      />
                      <View style={styles.selectionCopy}>
                        <Text style={styles.selectionTitle}>
                          {calendar.name}
                        </Text>
                        <Text style={styles.selectionMeta}>
                          {calendar.isDefault
                            ? "Default calendar"
                            : "Owned calendar"}
                        </Text>
                      </View>
                      {selected ? (
                        <Feather
                          name="check"
                          size={16}
                          color={theme.colors.primaryBase}
                        />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                style={styles.primaryButton}
                onPress={handleImportFile}
                disabled={importIcsMutation.isPending || !pickedFile}
              >
                {importIcsMutation.isPending ? (
                  <ActivityIndicator
                    size="small"
                    color={theme.colors.primaryForeground}
                  />
                ) : (
                  <Text style={styles.primaryButtonText}>Import File</Text>
                )}
              </Pressable>
            </>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Feather
              name="globe"
              size={16}
              color={theme.colors.mutedForeground}
            />
            <Text style={styles.cardTitle}>Holiday Calendars</Text>
          </View>

          <TextInput
            style={styles.input}
            value={holidaySearch}
            onChangeText={setHolidaySearch}
            placeholder="Search country or language"
            placeholderTextColor={theme.colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={styles.selectionList}>
            {filteredHolidayCalendars.map((holidayCalendar) => {
              const existingSubscription = subscriptionByUrl.get(
                normalizeSubscriptionUrl(holidayCalendar.url),
              );
              const added = !!existingSubscription;

              return (
                <View key={holidayCalendar.id} style={styles.selectionRow}>
                  <View
                    style={[
                      styles.selectionSwatch,
                      {
                        backgroundColor:
                          existingSubscription?.calendar.color ??
                          holidayCalendar.defaultColor,
                      },
                    ]}
                  />
                  <View style={styles.selectionCopy}>
                    <Text style={styles.selectionTitle}>
                      {holidayCalendar.label}
                    </Text>
                    <Text style={styles.selectionMeta}>
                      {holidayCalendar.language
                        ? `${holidayCalendar.countryName} · ${holidayCalendar.language}`
                        : holidayCalendar.countryName}
                    </Text>
                  </View>
                  {added ? (
                    <Text style={styles.addedLabel}>Added</Text>
                  ) : (
                    <Pressable
                      style={styles.inlineButton}
                      onPress={() => handleAddHolidayCalendar(holidayCalendar)}
                      disabled={createSubscriptionMutation.isPending}
                    >
                      <Text style={styles.inlineButtonText}>Add</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        </View>
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
    cardHeader: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["2"],
      marginBottom: theme.spacing["1"],
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
    primaryButton: {
      alignSelf: "flex-start" as const,
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["2"],
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.primaryBase,
      minWidth: 124,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    secondaryButton: {
      alignSelf: "flex-start" as const,
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["2"],
      borderRadius: theme.borderRadius.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.muted,
    },
    fileCard: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["2"],
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.muted,
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["2"],
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
    inlineButton: {
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["1"],
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.muted,
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
    errorText: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.destructive,
    },
    helperText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
    },
    primaryButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.primaryForeground,
    },
    secondaryButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
    },
    fileName: {
      flex: 1,
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
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
    inlineButtonText: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.foreground,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
    },
    addedLabel: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.primaryBase,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
