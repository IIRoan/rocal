import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { format } from "date-fns";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import type { ThemeTokens } from "@workspace/design-tokens";
import {
  SheetActions,
  SheetPrimaryButton,
  SheetSecondaryButton,
} from "@workspace/native-core/components/sheet";
import {
  REMINDER_MINUTE_OPTIONS,
  findRepeatPreset,
  formatReminderShort,
  getRepeatPresets,
  isReservedSystemEmail,
  isMailInvitationStagingCalendar,
  normalizeReminderMinutes,
  resolveTimezone,
  type Calendar,
  type CreateEventRequest,
  type EventParticipantInput,
  type RecurrenceRule,
  type TimeFormat,
} from "@workspace/calendar-core";
import { RecurrencePicker } from "./RecurrencePicker";
import {
  EventEditorField,
  EventEditorFieldButton,
  EventEditorListRow,
  createEditorFieldStyle,
  createEditorInputStyle,
} from "./EventEditorPrimitives";
import {
  EventParticipantList,
  ParticipantPickerSheet,
} from "./ParticipantPickerSheet";
import {
  CalendarGrid,
  OptionSheet,
  PickerSheet,
  type OptionSheetItem,
} from "./EventPickerSheets";
import { Switch } from "@workspace/native-core/components/ui/Switch";
import { TimeWheelPicker } from "./TimeWheelPicker";
import { formatPickerTime } from "./time-wheel-utils";
import { parseStoredRecurrence } from "./recurrence-picker-utils";
import { summarizeRecurrenceRule } from "./event-detail-utils";
import {
  roundToNextHour,
  buildEventRequest,
  pickerISOStringToUtc,
  pickerISOStringToWallClock,
  setPickerDatePart,
  setPickerTimePart,
  shiftEndWithStart,
  toTimezonePickerISOString,
  validateForm,
} from "./event-form-utils";

const DEFAULT_REMINDER_MINUTES = 15;

type OpenSheet = "calendar" | "repeat" | "reminder" | "participants" | null;
type DateTimeTarget = "start-date" | "start-time" | "end-date" | "end-time";

const DATE_TIME_TITLES: Record<DateTimeTarget, string> = {
  "start-date": "Start date",
  "start-time": "Start time",
  "end-date": "End date",
  "end-time": "End time",
};

export interface EventFormSubmission {
  request: CreateEventRequest;
  reminders: number[];
}

interface EventFormProps {
  initialValues?: Partial<CreateEventRequest>;
  initialReminders?: number[];
  timezone?: string;
  timeFormat: TimeFormat;
  calendars: Calendar[];
  serverErrors?: string[];
  isSubmitting?: boolean;
  onSubmit: (submission: EventFormSubmission) => void;
  onCancel?: () => void;
  actionsPlacement?: "footer" | "external";
}

export interface EventFormHandle {
  submit: () => void;
}

function PairArrow({ color }: { color: string }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Feather name="arrow-right" size={16} color={color} />
    </View>
  );
}

export const EventForm = forwardRef<EventFormHandle, EventFormProps>(
  function EventForm(
    {
      initialValues,
      initialReminders,
      timezone,
      timeFormat,
      calendars,
      serverErrors,
      isSubmitting = false,
      onSubmit,
      onCancel,
      actionsPlacement = "footer",
    }: EventFormProps,
    ref,
  ) {
    const { theme } = useTheme();
    const resolvedTimezone = resolveTimezone(initialValues?.timezone ?? timezone);
    const insets = useSafeAreaInsets();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const scrollRef = useRef<ScrollView>(null);
    const titleInputRef = useRef<TextInput>(null);
    const locationInputRef = useRef<TextInput>(null);
    const descriptionInputRef = useRef<TextInput>(null);

    const defaultStart = useMemo(() => roundToNextHour(new Date()), []);
    const defaultEnd = useMemo(
      () => new Date(defaultStart.getTime() + 60 * 60 * 1000),
      [defaultStart],
    );

    const [title, setTitle] = useState(initialValues?.title ?? "");
    const [allDay, setAllDay] = useState(initialValues?.allDay ?? false);
    const [start, setStart] = useState(
      initialValues?.start ??
        toTimezonePickerISOString(defaultStart, resolvedTimezone),
    );
    const [end, setEnd] = useState(
      initialValues?.end ?? toTimezonePickerISOString(defaultEnd, resolvedTimezone),
    );
    const [pickedCalendarId, setCalendarId] = useState(
      initialValues?.calendarId ?? "",
    );
    const [location, setLocation] = useState(initialValues?.location ?? "");
    const [description, setDescription] = useState(
      initialValues?.description ?? "",
    );
    const color = initialValues?.color ?? undefined;
    const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule | null>(
      () => parseStoredRecurrence(initialValues?.recurrence),
    );
    const [customRepeatOpen, setCustomRepeatOpen] = useState(false);
    // Existing events carry reminders or an explicit legacy reminder key; new events default to 15 minutes.
    const [reminders, setReminders] = useState<number[]>(() =>
      normalizeReminderMinutes(
        initialReminders ??
          (initialValues != null && "reminder" in initialValues
            ? [initialValues.reminder ?? 0]
            : [DEFAULT_REMINDER_MINUTES]),
      ),
    );
    // null adds a reminder; an index replaces that reminder.
    const [reminderEditIndex, setReminderEditIndex] = useState<number | null>(
      null,
    );
    const [participants, setParticipants] = useState<EventParticipantInput[]>(
      initialValues?.participants ?? [],
    );

    const [openSheet, setOpenSheet] = useState<OpenSheet>(null);
    // The target outlives the open flag so the sheet keeps its content while it animates closed.
    const [dateTimeTarget, setDateTimeTarget] =
      useState<DateTimeTarget>("start-time");
    const [dateTimePickerOpen, setDateTimePickerOpen] = useState(false);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [generalErrors, setGeneralErrors] = useState<string[]>([]);

    const startWallClock = useMemo(() => pickerISOStringToWallClock(start), [start]);
    const endWallClock = useMemo(() => pickerISOStringToWallClock(end), [end]);
    const endBeforeStart = allDay
      ? end.slice(0, 10) < start.slice(0, 10)
      : pickerISOStringToUtc(end, resolvedTimezone) <=
        pickerISOStringToUtc(start, resolvedTimezone);
    const selectableCalendars = useMemo(
      () =>
        calendars.filter(
          (calendar) =>
            !calendar.isSyncOnly &&
            !isMailInvitationStagingCalendar(calendar),
        ),
      [calendars],
    );
    // Calendars can arrive after the form opens, so the default is derived instead of stored.
    const calendarId = pickedCalendarId || (selectableCalendars[0]?.id ?? "");
    const selectedCalendar = calendars.find((c) => c.id === calendarId);
    const calendarSwatch = useCallback(
      (calendar: Calendar) =>
        theme.colors.calendar[
          calendar.color as keyof typeof theme.colors.calendar
        ]?.bg ?? calendar.color,
      [theme],
    );

    const repeatPresets = useMemo(
      () => getRepeatPresets(startWallClock),
      [startWallClock],
    );
    const activePreset = findRepeatPreset(repeatPresets, recurrenceRule);
    const repeatLabel = !recurrenceRule
      ? "Does not repeat"
      : (activePreset?.label ?? summarizeRecurrenceRule(recurrenceRule));
    const showCustomRepeat =
      recurrenceRule !== null && (customRepeatOpen || activePreset === null);

    const handleInputFocus = useCallback(
      (input: TextInput | null, topInset = 80) => {
        if (!input || !scrollRef.current) return;
        const scrollNativeRef = scrollRef.current.getNativeScrollRef();
        if (!scrollNativeRef) return;
        input.measureLayout(
          scrollNativeRef,
          (_x: number, y: number) => {
            scrollRef.current?.scrollTo({
              y: Math.max(0, y - topInset),
              animated: true,
            });
          },
          () => undefined,
        );
      },
      [],
    );

    const openPicker = useCallback((open: () => void) => {
      Keyboard.dismiss();
      open();
    }, []);

    const openDateTimePicker = useCallback(
      (target: DateTimeTarget) => {
        openPicker(() => {
          setDateTimeTarget(target);
          setDateTimePickerOpen(true);
        });
      },
      [openPicker],
    );

    const closeDateTimePicker = useCallback(
      () => setDateTimePickerOpen(false),
      [],
    );

    // Times are kept while all-day is on so switching it off restores them; all-day saves only the dates.
    const handleAllDayToggle = useCallback(() => {
      setAllDay((current) => !current);
    }, []);

    const updateStart = useCallback(
      (nextStart: string) => {
        setStart(nextStart);
        setEnd(shiftEndWithStart(start, nextStart, end, allDay, resolvedTimezone));
      },
      [allDay, end, resolvedTimezone, start],
    );

    const handleStartDateSelect = useCallback(
      (date: Date) => {
        updateStart(setPickerDatePart(start, date, resolvedTimezone));
        setDateTimePickerOpen(false);
      },
      [resolvedTimezone, start, updateStart],
    );

    const handleEndDateSelect = useCallback(
      (date: Date) => {
        setEnd(setPickerDatePart(end, date, resolvedTimezone));
        setDateTimePickerOpen(false);
      },
      [end, resolvedTimezone],
    );

    const handleStartTimeChange = useCallback(
      (time: Date) => updateStart(setPickerTimePart(start, time)),
      [start, updateStart],
    );

    const handleEndTimeChange = useCallback(
      (time: Date) => setEnd(setPickerTimePart(end, time)),
      [end],
    );

    const handleSubmit = useCallback(() => {
      Keyboard.dismiss();
      const data = buildEventRequest({
        title,
        start,
        end,
        calendarId,
        allDay,
        location,
        description,
        color,
        categoryId: undefined,
        recurrence: recurrenceRule ? JSON.stringify(recurrenceRule) : null,
        // The legacy single field mirrors the earliest reminder for older clients.
        reminder: reminders[0] ?? 0,
        timezone: resolvedTimezone,
        participants: participants.map((participant) => ({
          email: participant.email.trim().toLowerCase(),
          displayName: participant.displayName?.trim() || undefined,
          role: participant.role,
          status: participant.status,
        })),
      });

      const { fieldErrors: newFieldErrors, generalErrors: newGeneralErrors } =
        validateForm(data);

      if (
        Object.keys(newFieldErrors).length > 0 ||
        newGeneralErrors.length > 0
      ) {
        setFieldErrors(newFieldErrors);
        setGeneralErrors(newGeneralErrors);
        return;
      }

      setFieldErrors({});
      setGeneralErrors([]);
      onSubmit({ request: data, reminders });
    }, [
      title,
      start,
      end,
      calendarId,
      allDay,
      location,
      description,
      color,
      recurrenceRule,
      reminders,
      resolvedTimezone,
      onSubmit,
      participants,
    ]);

    useImperativeHandle(ref, () => ({ submit: handleSubmit }), [handleSubmit]);

    const renderFieldError = (field: string) => {
      const error = fieldErrors[field];
      if (!error) return null;
      return <Text style={styles.fieldError}>{error}</Text>;
    };

    const setParticipantError = useCallback((message: string | null) => {
      setFieldErrors((current) => {
        const next = { ...current };
        if (message) {
          next.participants = message;
        } else {
          delete next.participants;
        }
        return next;
      });
    }, []);

    const inviteParticipant = useCallback(
      (rawEmail: string, displayName?: string) => {
        const email = rawEmail.trim().replace(/^mailto:/i, "").toLowerCase();

        if (!email) {
          setParticipantError("Enter an email address first.");
          return false;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          setParticipantError("Enter a valid email address.");
          return false;
        }
        if (isReservedSystemEmail(email)) {
          setParticipantError("Cannot invite system or administrative addresses.");
          return false;
        }
        if (participants.some((participant) => participant.email === email)) {
          setParticipantError("That participant is already invited.");
          return false;
        }

        setParticipantError(null);
        setParticipants((current) => [
          ...current,
          {
            email,
            ...(displayName ? { displayName } : {}),
            role: "attendee",
            status: "pending",
          },
        ]);
        return true;
      },
      [participants, setParticipantError],
    );

    const clearParticipantError = useCallback(
      () => setParticipantError(null),
      [setParticipantError],
    );

    const removeParticipant = useCallback((email: string) => {
      setParticipants((current) =>
        current.filter((participant) => participant.email !== email),
      );
    }, []);

    const sortedParticipants = useMemo(
      () =>
        [...participants].sort((left, right) => {
          const roleDiff =
            (left.role === "organizer" ? 0 : 1) -
            (right.role === "organizer" ? 0 : 1);
          if (roleDiff !== 0) return roleDiff;
          return (left.displayName || left.email).localeCompare(
            right.displayName || right.email,
            undefined,
            { sensitivity: "base" },
          );
        }),
      [participants],
    );

    const closeSheet = useCallback(() => setOpenSheet(null), []);

    const calendarItems: OptionSheetItem[] = selectableCalendars.map((cal) => ({
      key: cal.id,
      label: cal.name,
      swatch: calendarSwatch(cal),
      selected: cal.id === calendarId,
      onSelect: () => {
        setCalendarId(cal.id);
        closeSheet();
      },
    }));

    const repeatItems: OptionSheetItem[] = [
      {
        key: "none",
        label: "Does not repeat",
        selected: recurrenceRule === null,
        onSelect: () => {
          setRecurrenceRule(null);
          setCustomRepeatOpen(false);
          closeSheet();
        },
      },
      ...repeatPresets.map((preset, index) => ({
        key: preset.key,
        label: preset.label,
        selected: activePreset?.key === preset.key,
        separatorBefore: index === 0,
        onSelect: () => {
          setRecurrenceRule(preset.rule);
          setCustomRepeatOpen(false);
          closeSheet();
        },
      })),
      {
        key: "custom",
        label: "Custom…",
        selected: recurrenceRule !== null && activePreset === null,
        separatorBefore: true,
        onSelect: () => {
          if (!recurrenceRule) {
            setRecurrenceRule({
              frequency: "weekly",
              interval: 1,
              byWeekDay: [startWallClock.getDay()],
            });
          }
          setCustomRepeatOpen(true);
          closeSheet();
        },
      },
    ];

    const editedReminder =
      reminderEditIndex === null ? undefined : reminders[reminderEditIndex];
    const canAddReminder = REMINDER_MINUTE_OPTIONS.some(
      (minutes) => !reminders.includes(minutes),
    );

    const openReminderSheet = useCallback(
      (index: number | null) => {
        openPicker(() => {
          setReminderEditIndex(index);
          setOpenSheet("reminder");
        });
      },
      [openPicker],
    );

    const removeReminder = useCallback((minutes: number) => {
      setReminders((current) => current.filter((value) => value !== minutes));
    }, []);

    const reminderItems: OptionSheetItem[] = REMINDER_MINUTE_OPTIONS.filter(
      (minutes) => minutes === editedReminder || !reminders.includes(minutes),
    ).map((minutes) => ({
      key: String(minutes),
      label: `${formatReminderShort(minutes)} before`,
      selected: minutes === editedReminder,
      onSelect: () => {
        setReminders((current) =>
          normalizeReminderMinutes(
            editedReminder === undefined
              ? [...current, minutes]
              : current.map((value) => (value === editedReminder ? minutes : value)),
          ),
        );
        closeSheet();
      },
    }));

    return (
      <>
        <View style={styles.container}>
          <ScrollView
            ref={scrollRef}
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            bounces={false}
            overScrollMode="never"
          >
            <View style={styles.formInner}>
              {serverErrors && serverErrors.length > 0 && (
                <View style={styles.errorContainer}>
                  {serverErrors.map((err) => (
                    <Text key={err} style={styles.errorText}>
                      {err}
                    </Text>
                  ))}
                </View>
              )}

              {generalErrors.length > 0 && (
                <View style={styles.errorContainer}>
                  {generalErrors.map((err) => (
                    <Text key={err} style={styles.errorText}>
                      {err}
                    </Text>
                  ))}
                </View>
              )}

              <View>
                <TextInput
                  ref={titleInputRef}
                  style={styles.titleInput}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Title"
                  placeholderTextColor={theme.colors.mutedForeground}
                  maxLength={255}
                  returnKeyType="done"
                  blurOnSubmit
                  onFocus={() => handleInputFocus(titleInputRef.current)}
                  accessibilityLabel="Event title"
                />
                {renderFieldError("title")}
              </View>

              <View style={styles.pairRow}>
                <EventEditorFieldButton
                  icon="calendar"
                  label={format(startWallClock, "EEE, MMM d")}
                  accessibilityLabel={`Start date: ${format(startWallClock, "EEEE, MMMM d")}`}
                  onPress={() => openDateTimePicker("start-date")}
                  style={styles.pairItem}
                />
                <PairArrow color={theme.colors.mutedForeground} />
                <EventEditorFieldButton
                  label={format(endWallClock, "EEE, MMM d")}
                  accessibilityLabel={`End date: ${format(endWallClock, "EEEE, MMMM d")}`}
                  invalid={endBeforeStart}
                  onPress={() => openDateTimePicker("end-date")}
                  style={styles.pairItem}
                />
              </View>

              {!allDay ? (
                <View style={styles.pairRow}>
                  <EventEditorFieldButton
                    icon="clock"
                    label={formatPickerTime(startWallClock, timeFormat)}
                    accessibilityLabel={`Start time: ${formatPickerTime(startWallClock, timeFormat)}`}
                    onPress={() => openDateTimePicker("start-time")}
                    style={styles.pairItem}
                  />
                  <PairArrow color={theme.colors.mutedForeground} />
                  <EventEditorFieldButton
                    label={formatPickerTime(endWallClock, timeFormat)}
                    accessibilityLabel={`End time: ${formatPickerTime(endWallClock, timeFormat)}`}
                    invalid={endBeforeStart}
                    onPress={() => openDateTimePicker("end-time")}
                    style={styles.pairItem}
                  />
                </View>
              ) : null}
              {renderFieldError("end")}

              <View>
                <EventEditorListRow
                  icon="sun"
                  label="All day"
                  onPress={() => openPicker(handleAllDayToggle)}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: allDay }}
                  trailing={<Switch value={allDay} />}
                />
                <EventEditorListRow
                  icon="repeat"
                  label={repeatLabel}
                  muted={!recurrenceRule}
                  accessibilityLabel={`Repeat: ${repeatLabel}`}
                  onPress={() => openPicker(() => setOpenSheet("repeat"))}
                />
              </View>

              {showCustomRepeat && recurrenceRule && (
                <RecurrencePicker
                  rule={recurrenceRule}
                  onChange={setRecurrenceRule}
                />
              )}

              <View style={styles.divider} />

              <View style={styles.participantSection}>
                <EventEditorFieldButton
                  icon="user-plus"
                  label="Add participant"
                  muted
                  onPress={() => openPicker(() => setOpenSheet("participants"))}
                />
                {renderFieldError("participants")}
                <EventParticipantList
                  participants={sortedParticipants}
                  onRemove={removeParticipant}
                />
              </View>

              <View style={styles.divider} />

              <View>
                <EventEditorListRow
                  leading={
                    <View
                      style={[
                        styles.calendarSwatch,
                        {
                          backgroundColor: selectedCalendar
                            ? calendarSwatch(selectedCalendar)
                            : theme.colors.mutedForeground,
                        },
                      ]}
                    />
                  }
                  label={selectedCalendar?.name ?? "Select calendar"}
                  muted={!selectedCalendar}
                  accessibilityLabel={`Calendar: ${selectedCalendar?.name ?? "Select calendar"}`}
                  onPress={() => openPicker(() => setOpenSheet("calendar"))}
                />
                {renderFieldError("calendarId")}
                {reminders.map((minutes, index) => {
                  const label = `${formatReminderShort(minutes)} before`;
                  return (
                    <EventEditorListRow
                      key={minutes}
                      icon={index === 0 ? "bell" : undefined}
                      label={label}
                      accessibilityLabel={`Reminder: ${label}`}
                      onPress={() => openReminderSheet(index)}
                      trailing={
                        <Pressable
                          onPress={() => removeReminder(minutes)}
                          hitSlop={8}
                          style={({ pressed }) => [
                            styles.reminderRemove,
                            pressed && styles.reminderRemovePressed,
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove reminder ${label}`}
                        >
                          <Feather
                            name="x"
                            size={16}
                            color={theme.colors.mutedForeground}
                          />
                        </Pressable>
                      }
                    />
                  );
                })}
                {canAddReminder ? (
                  <EventEditorListRow
                    icon={reminders.length === 0 ? "bell" : "plus"}
                    label={
                      reminders.length === 0 ? "Add reminder" : "Add another reminder"
                    }
                    muted
                    onPress={() => openReminderSheet(null)}
                  />
                ) : null}
              </View>

              <View style={styles.divider} />

              <View>
                <EventEditorField icon="map-pin">
                  <TextInput
                    ref={locationInputRef}
                    style={styles.input}
                    value={location}
                    onChangeText={setLocation}
                    placeholder="Location"
                    placeholderTextColor={theme.colors.mutedForeground}
                    maxLength={255}
                    returnKeyType="done"
                    blurOnSubmit
                    onFocus={() => handleInputFocus(locationInputRef.current)}
                    accessibilityLabel="Location"
                  />
                </EventEditorField>
                {renderFieldError("location")}
              </View>

              <View>
                <EventEditorField icon="edit-2" multiline>
                  <TextInput
                    ref={descriptionInputRef}
                    style={[styles.input, styles.textarea]}
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Description"
                    placeholderTextColor={theme.colors.mutedForeground}
                    maxLength={1000}
                    multiline
                    textAlignVertical="top"
                    onFocus={() => handleInputFocus(descriptionInputRef.current)}
                    accessibilityLabel="Description"
                  />
                </EventEditorField>
                {renderFieldError("description")}
              </View>
            </View>
          </ScrollView>

          {actionsPlacement === "footer" ? (
            <SheetActions>
              {onCancel && (
                <SheetSecondaryButton label="Cancel" onPress={onCancel} />
              )}
              <SheetPrimaryButton
                label="Save"
                icon="save"
                onPress={handleSubmit}
                loading={isSubmitting}
                disabled={isSubmitting}
              />
            </SheetActions>
          ) : null}
        </View>

        <PickerSheet
          visible={dateTimePickerOpen}
          onClose={closeDateTimePicker}
          title={DATE_TIME_TITLES[dateTimeTarget]}
          theme={theme}
          bottomInset={insets.bottom}
          maxHeightRatio={0.7}
        >
          <View style={styles.dateTimeSheetBody}>
            {dateTimeTarget === "start-date" || dateTimeTarget === "end-date" ? (
              <CalendarGrid
                key={dateTimeTarget}
                selectedDate={
                  dateTimeTarget === "start-date" ? startWallClock : endWallClock
                }
                onSelect={
                  dateTimeTarget === "start-date"
                    ? handleStartDateSelect
                    : handleEndDateSelect
                }
                minDate={dateTimeTarget === "end-date" ? startWallClock : undefined}
                theme={theme}
              />
            ) : (
              <>
                <TimeWheelPicker
                  key={dateTimeTarget}
                  value={
                    dateTimeTarget === "start-time" ? startWallClock : endWallClock
                  }
                  onChange={
                    dateTimeTarget === "start-time"
                      ? handleStartTimeChange
                      : handleEndTimeChange
                  }
                  timeFormat={timeFormat}
                  accessibilityLabel={DATE_TIME_TITLES[dateTimeTarget]}
                />
                <View style={styles.dateTimeSheetActions}>
                  <SheetActions chrome={false}>
                    <SheetPrimaryButton
                      label="Done"
                      onPress={closeDateTimePicker}
                    />
                  </SheetActions>
                </View>
              </>
            )}
          </View>
        </PickerSheet>
        <ParticipantPickerSheet
          visible={openSheet === "participants"}
          onClose={closeSheet}
          participants={sortedParticipants}
          onInvite={inviteParticipant}
          onRemove={removeParticipant}
          error={fieldErrors.participants}
          onClearError={clearParticipantError}
          bottomInset={insets.bottom}
        />
        <OptionSheet
          visible={openSheet === "calendar"}
          onClose={closeSheet}
          title="Calendar"
          items={calendarItems}
          theme={theme}
          bottomInset={insets.bottom}
        />
        <OptionSheet
          visible={openSheet === "repeat"}
          onClose={closeSheet}
          title="Repeat"
          items={repeatItems}
          theme={theme}
          bottomInset={insets.bottom}
        />
        <OptionSheet
          visible={openSheet === "reminder"}
          onClose={closeSheet}
          title={editedReminder === undefined ? "Add reminder" : "Reminder"}
          items={reminderItems}
          theme={theme}
          bottomInset={insets.bottom}
        />
      </>
    );
  },
);

function createStyles(theme: ThemeTokens) {
  const field = createEditorFieldStyle(theme);

  const view = {
    container: {
      flex: 1,
      minHeight: 0,
      backgroundColor: "transparent",
    },
    scrollView: {
      flex: 1,
      minHeight: 0,
    },
    scrollContent: {
      flexGrow: 1,
      paddingBottom: theme.spacing["4"],
    },
    formInner: {
      paddingHorizontal: theme.spacing["4"],
      paddingTop: theme.spacing["2"],
      gap: theme.spacing["2"],
    },
    errorContainer: {
      backgroundColor: theme.colors.destructive + "18",
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing["3"],
      gap: theme.spacing["1"],
    },
    pairRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["3"],
    },
    pairItem: {
      flex: 1,
      minWidth: 0,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      marginVertical: theme.spacing["1"],
      backgroundColor: theme.colors.border,
    },
    calendarSwatch: {
      width: 10,
      height: 10,
      borderRadius: theme.borderRadius.full,
    },
    dateTimeSheetBody: {
      paddingHorizontal: theme.spacing["4"],
      paddingBottom: theme.spacing["2"],
    },
    dateTimeSheetActions: {
      marginTop: theme.spacing["4"],
    },
    participantSection: {
      gap: theme.spacing["2"],
    },
    reminderRemove: {
      width: 28,
      height: 28,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderRadius: theme.borderRadius.full,
    },
    reminderRemovePressed: {
      backgroundColor: theme.colors.accent,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    titleInput: {
      ...field,
      minHeight: 48,
      fontSize: theme.typography.fontSize.lg.size,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
    },
    input: createEditorInputStyle(theme),
    textarea: {
      minHeight: 120,
      paddingTop: 13,
      paddingBottom: 10,
    },
    fieldError: {
      paddingTop: 4,
      paddingHorizontal: 4,
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.destructive,
    },
    errorText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.destructive,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}

export type { EventFormProps };
