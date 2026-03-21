import React from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  calendarApiService,
  type Calendar,
  type UserSettings,
} from "@workspace/calendar-client";

import { useSharedCalendarData } from "../calendar";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button.native";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card.native";
import { Input } from "../ui/input.native";
import { Switch } from "../ui/switch.native";

interface MobileAccountScreenProps {
  userName?: string | null;
  userEmail?: string | null;
  signingOut?: boolean;
  onSignOut?: () => void;
}

const VIEW_OPTIONS: Array<{
  value: UserSettings["defaultView"];
  label: string;
}> = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "day", label: "Day" },
  { value: "agenda", label: "Agenda" },
];

const WEEK_DAYS = [
  { value: 0, label: "Sunday", shortLabel: "Sun" },
  { value: 1, label: "Monday", shortLabel: "Mon" },
  { value: 2, label: "Tuesday", shortLabel: "Tue" },
  { value: 3, label: "Wednesday", shortLabel: "Wed" },
  { value: 4, label: "Thursday", shortLabel: "Thu" },
  { value: 5, label: "Friday", shortLabel: "Fri" },
  { value: 6, label: "Saturday", shortLabel: "Sat" },
] as const;

const CALENDAR_COLOR_CLASSES: Record<string, string> = {
  blue: "bg-event-sky",
  sky: "bg-event-sky",
  violet: "bg-event-violet",
  purple: "bg-event-violet",
  orange: "bg-event-orange",
  rose: "bg-event-rose",
  emerald: "bg-event-emerald",
  green: "bg-event-emerald",
};

const DEFAULT_SETTINGS: Pick<
  UserSettings,
  "defaultView" | "weekStartDay" | "workingDays" | "timezone"
> = {
  defaultView: "day",
  weekStartDay: 1,
  workingDays: "[1,2,3,4,5]",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

function parseWorkingDays(workingDays?: string): number[] {
  if (!workingDays) {
    return [1, 2, 3, 4, 5];
  }

  try {
    const parsed = JSON.parse(workingDays);
    if (!Array.isArray(parsed)) {
      return [1, 2, 3, 4, 5];
    }

    const valid = parsed
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);

    return valid.length > 0 ? Array.from(new Set(valid)).sort((a, b) => a - b) : [1, 2, 3, 4, 5];
  } catch {
    return [1, 2, 3, 4, 5];
  }
}

function calendarColorClass(color?: string): string {
  if (!color) {
    return "bg-event-default";
  }

  return CALENDAR_COLOR_CLASSES[color.toLowerCase()] ?? "bg-event-default";
}

export function MobileAccountScreen({
  userName,
  userEmail,
  signingOut = false,
  onSignOut,
}: MobileAccountScreenProps) {
  const queryClient = useQueryClient();
  const { calendars, calendarsLoading, calendarsError, updateCalendar } =
    useSharedCalendarData();

  const settingsQuery = useQuery({
    queryKey: ["mobile-user-settings"],
    queryFn: () => calendarApiService.getUserSettings(),
  });

  const settings = settingsQuery.data ?? DEFAULT_SETTINGS;
  const [timezoneInput, setTimezoneInput] = React.useState(settings.timezone);
  const [savingCalendarId, setSavingCalendarId] = React.useState<string | null>(
    null,
  );

  React.useEffect(() => {
    setTimezoneInput(settings.timezone || DEFAULT_SETTINGS.timezone);
  }, [settings.timezone]);

  const updateSettingsMutation = useMutation({
    mutationFn: (
      updates: Partial<
        Pick<UserSettings, "defaultView" | "weekStartDay" | "workingDays" | "timezone">
      >,
    ) => calendarApiService.updateUserSettings(updates),
    onSuccess: (updatedSettings) => {
      queryClient.setQueryData(["mobile-user-settings"], updatedSettings);
    },
  });

  const workingDays = React.useMemo(
    () => parseWorkingDays(settings.workingDays),
    [settings.workingDays],
  );

  const isSavingSettings = updateSettingsMutation.isPending;
  const isTimezoneDirty =
    timezoneInput.trim() !== (settings.timezone || DEFAULT_SETTINGS.timezone).trim();

  const settingsErrorMessage = settingsQuery.error
    ? (settingsQuery.error as { message?: string }).message ||
      "Unable to load settings right now."
    : null;

  const updatePreferences = React.useCallback(
    async (
      updates: Partial<
        Pick<UserSettings, "defaultView" | "weekStartDay" | "workingDays" | "timezone">
      >,
    ) => {
      try {
        await updateSettingsMutation.mutateAsync(updates);
      } catch {
        // Mutations surface errors through updateSettingsMutation.error state.
      }
    },
    [updateSettingsMutation],
  );

  const handleToggleWorkingDay = React.useCallback(
    (day: number) => {
      const nextDays = workingDays.includes(day)
        ? workingDays.filter((value) => value !== day)
        : [...workingDays, day];

      void updatePreferences({
        workingDays: JSON.stringify(nextDays.sort((a, b) => a - b)),
      });
    },
    [updatePreferences, workingDays],
  );

  const handleSaveTimezone = React.useCallback(() => {
    const nextTimezone = timezoneInput.trim() || DEFAULT_SETTINGS.timezone;
    void updatePreferences({ timezone: nextTimezone });
  }, [timezoneInput, updatePreferences]);

  const handleToggleCalendar = React.useCallback(
    async (calendar: Calendar) => {
      setSavingCalendarId(calendar.id);
      try {
        await updateCalendar(calendar.id, { isVisible: !calendar.isVisible });
      } finally {
        setSavingCalendarId((current) =>
          current === calendar.id ? null : current,
        );
      }
    },
    [updateCalendar],
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="gap-4 px-4 pb-24 pt-4">
          <View className="gap-2 px-1">
            <Text className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
              Workspace
            </Text>
            <Text className="text-3xl font-extrabold tracking-tight text-foreground">
              Settings
            </Text>
            <Text className="text-sm text-muted-foreground">
              Manage your profile, calendar defaults, and account actions.
            </Text>
          </View>

          {settingsErrorMessage ? (
            <Card className="rounded-[24px] border-destructive/30 bg-destructive/10 py-4">
              <CardContent className="pt-0">
                <Text className="text-sm text-destructive">{settingsErrorMessage}</Text>
              </CardContent>
            </Card>
          ) : null}

          <Card className="rounded-[28px] border-border/60 bg-card/95 py-4">
            <CardHeader className="gap-1 pb-4">
              <CardTitle className="text-base text-foreground">Profile info</CardTitle>
              <CardDescription>Signed in account details</CardDescription>
            </CardHeader>
            <CardContent className="gap-3">
              <View className="gap-2">
                <Text className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Name
                </Text>
                <Input
                  value={userName || "Unknown user"}
                  editable={false}
                  className="rounded-xl border-border/70 bg-muted/20 text-foreground"
                />
              </View>

              <View className="gap-2">
                <Text className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Email
                </Text>
                <Input
                  value={userEmail || "No email on account"}
                  editable={false}
                  className="rounded-xl border-border/70 bg-muted/20 text-foreground"
                />
              </View>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-border/60 bg-card/95 py-4">
            <CardHeader className="gap-1 pb-4">
              <CardTitle className="text-base text-foreground">
                Calendar preferences
              </CardTitle>
              <CardDescription>Default view, week start, and working days</CardDescription>
            </CardHeader>
            <CardContent className="gap-4">
              <View className="gap-2">
                <Text className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Default view
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {VIEW_OPTIONS.map((viewOption) => {
                    const isSelected = settings.defaultView === viewOption.value;

                    return (
                      <Button
                        key={viewOption.value}
                        size="sm"
                        variant={isSelected ? "default" : "outline"}
                        onPress={() => void updatePreferences({ defaultView: viewOption.value })}
                        disabled={isSavingSettings}
                        className="rounded-full px-4"
                      >
                        {viewOption.label}
                      </Button>
                    );
                  })}
                </View>
              </View>

              <View className="gap-2">
                <Text className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Week starts on
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {WEEK_DAYS.map((day) => {
                    const isSelected = settings.weekStartDay === day.value;

                    return (
                      <Button
                        key={day.value}
                        size="sm"
                        variant={isSelected ? "default" : "outline"}
                        onPress={() =>
                          void updatePreferences({
                            weekStartDay: day.value,
                          })
                        }
                        disabled={isSavingSettings}
                        className="rounded-full px-3"
                      >
                        {day.shortLabel}
                      </Button>
                    );
                  })}
                </View>
              </View>

              <View className="gap-2">
                <Text className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Working days
                </Text>
                <View className="gap-2">
                  {WEEK_DAYS.map((day) => (
                    <View
                      key={day.value}
                      className="flex-row items-center justify-between rounded-2xl border border-border/60 bg-background/70 px-3 py-2.5"
                    >
                      <Text className="text-sm font-medium text-foreground">{day.label}</Text>
                      <Switch
                        checked={workingDays.includes(day.value)}
                        onCheckedChange={() => handleToggleWorkingDay(day.value)}
                        disabled={isSavingSettings}
                      />
                    </View>
                  ))}
                </View>
              </View>

              {updateSettingsMutation.error ? (
                <Text className="text-xs text-destructive">
                  {(updateSettingsMutation.error as { message?: string }).message ||
                    "Failed to save settings."}
                </Text>
              ) : null}
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-border/60 bg-card/95 py-4">
            <CardHeader className="gap-1 pb-4">
              <CardTitle className="text-base text-foreground">Calendars</CardTitle>
              <CardDescription>Toggle visibility for each calendar</CardDescription>
            </CardHeader>
            <CardContent className="gap-2">
              {calendarsLoading ? (
                <Text className="text-sm text-muted-foreground">Loading calendars…</Text>
              ) : null}

              {!calendarsLoading && calendars.length === 0 ? (
                <Text className="text-sm text-muted-foreground">No calendars available.</Text>
              ) : null}

              {calendarsError ? (
                <Text className="text-sm text-destructive">
                  {(calendarsError as { message?: string }).message ||
                    "Failed to load calendars."}
                </Text>
              ) : null}

              {calendars.map((calendar) => (
                <View
                  key={calendar.id}
                  className="flex-row items-center justify-between rounded-2xl border border-border/60 bg-background/70 px-3 py-2.5"
                >
                  <View className="flex-1 flex-row items-center gap-3">
                    <View
                      className={cn(
                        "size-2.5 rounded-full",
                        calendarColorClass(calendar.color),
                      )}
                    />
                    <Text className="text-sm font-medium text-foreground">
                      {calendar.name}
                    </Text>
                  </View>

                  <View className="items-end gap-1">
                    <Switch
                      checked={calendar.isVisible}
                      onCheckedChange={() => void handleToggleCalendar(calendar)}
                      disabled={savingCalendarId === calendar.id}
                    />
                    {savingCalendarId === calendar.id ? (
                      <Text className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        Saving
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-border/60 bg-card/95 py-4">
            <CardHeader className="gap-1 pb-4">
              <CardTitle className="text-base text-foreground">Timezone</CardTitle>
              <CardDescription>
                Use your preferred IANA timezone (for example: America/New_York).
              </CardDescription>
            </CardHeader>
            <CardContent className="gap-3">
              <Input
                value={timezoneInput}
                onChangeText={setTimezoneInput}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={DEFAULT_SETTINGS.timezone}
                className="rounded-xl border-border/70 bg-background/70"
              />

              <Button
                variant="outline"
                onPress={handleSaveTimezone}
                disabled={!isTimezoneDirty || isSavingSettings}
                className="rounded-xl"
              >
                Save timezone
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border-border/60 bg-card/95 py-4">
            <CardHeader className="gap-1 pb-4">
              <CardTitle className="text-base text-foreground">Account actions</CardTitle>
              <CardDescription>Manage your current session</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="destructive"
                onPress={onSignOut}
                disabled={signingOut || !onSignOut}
                className="w-full rounded-xl"
              >
                {signingOut ? "Signing out…" : "Sign out"}
              </Button>
            </CardContent>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
