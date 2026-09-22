import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
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
import { useTheme } from "../../providers/ThemeProvider";
import type { ThemeTokens } from "@workspace/design-tokens";
import {
  SheetActions,
  SheetPrimaryButton,
  SheetSecondaryButton,
} from "../sheet";
import {
  PARTICIPANTS_INVITE_HELP_TEXT,
  REMINDER_MINUTE_OPTIONS,
  findRepeatPreset,
  formatReminderShort,
  getRepeatPresets,
  isReservedSystemEmail,
  isMailInvitationStagingCalendar,
  resolveTimezone,
  type Calendar,
  type CreateEventRequest,
  type EventParticipantInput,
  type RecentContactEntry,
  type RecurrenceRule,
} from "@workspace/calendar-core";
import { RecurrencePicker } from "./RecurrencePicker";
import { RecipientSuggestInput } from "../mail/RecipientSuggestInput";
import { BlobatarAvatar } from "../BlobatarAvatar";
import {
  EventEditorChip,
  EventEditorRow,
  createEditorFieldStyle,
} from "./EventEditorPrimitives";
import {
  DatePickerModal,
  OptionSheet,
  TimePickerModal,
  formatTime12,
  type OptionSheetItem,
} from "./EventPickerSheets";
import { parseStoredRecurrence } from "./recurrence-picker-utils";
import { summarizeRecurrenceRule } from "./event-detail-utils";
import {
  roundToNextHour,
  buildEventRequest,
  pickerISOStringToUtc,
  pickerISOStringToWallClock,
  setPickerDatePart,
  setPickerTimePart,
  toTimezonePickerISOString,
  validateForm,
} from "./event-form-utils";

const DEFAULT_REMINDER_MINUTES = 15;

type OpenSheet = "calendar" | "repeat" | "reminder" | null;

interface EventFormProps {
  initialValues?: Partial<CreateEventRequest>;
  timezone?: string;
  calendars: Calendar[];
  serverErrors?: string[];
  isSubmitting?: boolean;
  onSubmit: (data: CreateEventRequest) => void;
  onCancel?: () => void;
  actionsPlacement?: "footer" | "external";
}

export interface EventFormHandle {
  submit: () => void;
}

function formatParticipantStatus(status?: string) {
  switch (status) {
    case "accepted":
      return "Accepted";
    case "declined":
      return "Declined";
    case "tentative":
      return "Tentative";
    default:
      return "Invited";
  }
}

export const EventForm = forwardRef<EventFormHandle, EventFormProps>(
  function EventForm(
    {
      initialValues,
      timezone,
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
    const participantInputRef = useRef<TextInput>(null);
    const [participantSuggestOpen, setParticipantSuggestOpen] = useState(false);

    const defaultStart = useMemo(() => roundToNextHour(new Date()), []);
    const defaultEnd = useMemo(
      () => new Date(defaultStart.getTime() + 60 * 60 * 1000),
      [defaultStart],
    );
    const defaultCalendarId = calendars[0]?.id ?? "";

    const [title, setTitle] = useState(initialValues?.title ?? "");
    const [allDay, setAllDay] = useState(initialValues?.allDay ?? false);
    const [start, setStart] = useState(
      initialValues?.start ??
        toTimezonePickerISOString(defaultStart, resolvedTimezone),
    );
    const [end, setEnd] = useState(
      initialValues?.end ?? toTimezonePickerISOString(defaultEnd, resolvedTimezone),
    );
    const [calendarId, setCalendarId] = useState(
      initialValues?.calendarId ?? defaultCalendarId,
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
    // Existing events carry an explicit reminder key; new events default to 15 minutes.
    const [reminder, setReminder] = useState<number>(
      initialValues != null && "reminder" in initialValues
        ? (initialValues.reminder ?? 0)
        : DEFAULT_REMINDER_MINUTES,
    );
    const [participants, setParticipants] = useState<EventParticipantInput[]>(
      initialValues?.participants ?? [],
    );
    const [participantDraft, setParticipantDraft] = useState("");

    const [openSheet, setOpenSheet] = useState<OpenSheet>(null);
    const [showStartDatePicker, setShowStartDatePicker] = useState(false);
    const [showEndDatePicker, setShowEndDatePicker] = useState(false);
    const [showStartTimePicker, setShowStartTimePicker] = useState(false);
    const [showEndTimePicker, setShowEndTimePicker] = useState(false);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [generalErrors, setGeneralErrors] = useState<string[]>([]);

    const startWallClock = useMemo(() => pickerISOStringToWallClock(start), [start]);
    const endWallClock = useMemo(() => pickerISOStringToWallClock(end), [end]);
    const sameDay = start.slice(0, 10) === end.slice(0, 10);
    const selectedCalendar = calendars.find((c) => c.id === calendarId);
    const selectableCalendars = useMemo(
      () =>
        calendars.filter(
          (calendar) =>
            !calendar.isSyncOnly &&
            !isMailInvitationStagingCalendar(calendar),
        ),
      [calendars],
    );
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

    // Scroll a focused field near the top; participants use a tighter inset so suggestions stay above the keyboard.
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

    const closeParticipantSuggestions = useCallback(() => {
      setParticipantSuggestOpen(false);
    }, []);

    const handleParticipantFocus = useCallback(() => {
      setParticipantSuggestOpen(true);
      // Re-measure after the suggestion panel mounts so it stays in view.
      requestAnimationFrame(() => {
        handleInputFocus(participantInputRef.current, 48);
        setTimeout(() => {
          handleInputFocus(participantInputRef.current, 48);
        }, 120);
      });
    }, [handleInputFocus]);

    const openPicker = useCallback((open: () => void) => {
      Keyboard.dismiss();
      closeParticipantSuggestions();
      open();
    }, [closeParticipantSuggestions]);

    const handleAllDayToggle = useCallback(() => {
      const next = !allDay;
      setAllDay(next);
      if (next) {
        setStart(setPickerTimePart(start, new Date(2000, 0, 1, 0, 0)));
        setEnd(setPickerTimePart(end, new Date(2000, 0, 1, 23, 59)));
      }
    }, [allDay, end, start]);

    const handleStartDateSelect = useCallback(
      (date: Date) => {
        const nextStart = setPickerDatePart(start, date, resolvedTimezone);
        setStart(nextStart);
        if (
          pickerISOStringToUtc(nextStart, resolvedTimezone) >
          pickerISOStringToUtc(end, resolvedTimezone)
        ) {
          setEnd(setPickerDatePart(end, date, resolvedTimezone));
        }
        setShowStartDatePicker(false);
      },
      [end, resolvedTimezone, start],
    );

    const handleEndDateSelect = useCallback(
      (date: Date) => {
        setEnd(setPickerDatePart(end, date, resolvedTimezone));
        setShowEndDatePicker(false);
      },
      [end, resolvedTimezone],
    );

    const handleStartTimeSelect = useCallback(
      (time: Date) => {
        setStart(setPickerTimePart(start, time));
        setShowStartTimePicker(false);
      },
      [start],
    );

    const handleEndTimeSelect = useCallback(
      (time: Date) => {
        setEnd(setPickerTimePart(end, time));
        setShowEndTimePicker(false);
      },
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
        reminder,
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
      onSubmit(data);
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
      reminder,
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
          return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          setParticipantError("Enter a valid email address.");
          return;
        }
        if (isReservedSystemEmail(email)) {
          setParticipantError("Cannot invite system or administrative addresses.");
          return;
        }
        if (participants.some((participant) => participant.email === email)) {
          setParticipantError("That participant is already invited.");
          return;
        }

        setParticipantDraft("");
        setParticipantSuggestOpen(false);
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
      },
      [participants, setParticipantError],
    );

    const addParticipantFromSuggestion = useCallback(
      (entry: RecentContactEntry) => {
        if (isReservedSystemEmail(entry.email.trim().toLowerCase())) {
          return;
        }
        inviteParticipant(entry.email, entry.displayName?.trim() || undefined);
      },
      [inviteParticipant],
    );

    const removeParticipant = useCallback((email: string) => {
      setParticipants((current) =>
        current.filter((participant) => participant.email !== email),
      );
    }, []);

    const showParticipantsInviteHelp = useCallback(() => {
      Keyboard.dismiss();
      Alert.alert("Participants", PARTICIPANTS_INVITE_HELP_TEXT);
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

    const reminderItems: OptionSheetItem[] = REMINDER_MINUTE_OPTIONS.map(
      (minutes) => ({
        key: String(minutes),
        label: `${formatReminderShort(minutes)} before`,
        selected: reminder === minutes,
        onSelect: () => {
          setReminder(minutes);
          closeSheet();
        },
      }),
    );

    return (
      <>
        <View style={styles.container}>
          <ScrollView
            ref={scrollRef}
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode={
              participantSuggestOpen ? "none" : "on-drag"
            }
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
                  placeholder="Add title"
                  placeholderTextColor={theme.colors.mutedForeground + "B3"}
                  maxLength={255}
                  returnKeyType="done"
                  blurOnSubmit
                  onFocus={() => {
                    closeParticipantSuggestions();
                    handleInputFocus(titleInputRef.current);
                  }}
                  accessibilityLabel="Event title"
                />
                {renderFieldError("title")}
              </View>

              <EventEditorRow icon="clock" label="Date and time">
                <View style={styles.chipRow}>
                  <EventEditorChip
                    label={format(startWallClock, "EEE, MMM d")}
                    accessibilityLabel={`Start date: ${format(startWallClock, "EEEE, MMMM d")}`}
                    onPress={() =>
                      openPicker(() => {
                        setShowEndDatePicker(false);
                        setShowStartDatePicker(true);
                      })
                    }
                  />
                  {!allDay && (
                    <EventEditorChip
                      label={formatTime12(startWallClock)}
                      accessibilityLabel={`Start time: ${formatTime12(startWallClock)}`}
                      onPress={() =>
                        openPicker(() => {
                          setShowEndTimePicker(false);
                          setShowStartTimePicker(true);
                        })
                      }
                    />
                  )}
                  <Text style={styles.rangeDash} accessibilityElementsHidden>
                    –
                  </Text>
                  {!allDay && (
                    <EventEditorChip
                      label={formatTime12(endWallClock)}
                      accessibilityLabel={`End time: ${formatTime12(endWallClock)}`}
                      onPress={() =>
                        openPicker(() => {
                          setShowStartTimePicker(false);
                          setShowEndTimePicker(true);
                        })
                      }
                    />
                  )}
                  <EventEditorChip
                    label={format(endWallClock, "EEE, MMM d")}
                    accessibilityLabel={`End date: ${format(endWallClock, "EEEE, MMMM d")}`}
                    muted={sameDay && !allDay}
                    onPress={() =>
                      openPicker(() => {
                        setShowStartDatePicker(false);
                        setShowEndDatePicker(true);
                      })
                    }
                  />
                </View>
                {renderFieldError("end")}

                <View style={[styles.chipRow, styles.chipRowSpaced]}>
                  <EventEditorChip
                    label="All day"
                    leadingIcon={allDay ? "check" : undefined}
                    active={allDay}
                    muted={!allDay}
                    accessibilityLabel="All day event"
                    onPress={() => openPicker(handleAllDayToggle)}
                  />
                  <EventEditorChip
                    label={repeatLabel}
                    leadingIcon="repeat"
                    trailingIcon="chevron-down"
                    muted={!recurrenceRule}
                    accessibilityLabel={`Repeat: ${repeatLabel}`}
                    style={styles.shrinkChip}
                    onPress={() => openPicker(() => setOpenSheet("repeat"))}
                  />
                </View>

                {showCustomRepeat && recurrenceRule && (
                  <RecurrencePicker
                    rule={recurrenceRule}
                    onChange={setRecurrenceRule}
                  />
                )}
              </EventEditorRow>

              <EventEditorRow icon="calendar" label="Calendar">
                <EventEditorChip
                  label={selectedCalendar?.name ?? "Select calendar"}
                  swatch={
                    selectedCalendar ? calendarSwatch(selectedCalendar) : undefined
                  }
                  muted={!selectedCalendar}
                  trailingIcon="chevron-down"
                  accessibilityLabel={`Calendar: ${selectedCalendar?.name ?? "Select calendar"}`}
                  style={styles.shrinkChip}
                  onPress={() => openPicker(() => setOpenSheet("calendar"))}
                />
                {renderFieldError("calendarId")}
              </EventEditorRow>

              <EventEditorRow icon="users" label="Participants">
                <RecipientSuggestInput
                  mode="calendar"
                  value={participantDraft}
                  onChangeText={(text) => {
                    setParticipantDraft(text);
                    if (fieldErrors.participants) setParticipantError(null);
                  }}
                  onSelectSuggestion={addParticipantFromSuggestion}
                  placeholder="Add participants"
                  onSubmitEditing={() => inviteParticipant(participantDraft)}
                  inputRef={participantInputRef}
                  open={participantSuggestOpen}
                  onOpenChange={setParticipantSuggestOpen}
                  onFocus={handleParticipantFocus}
                  style={styles.participantInput}
                  hasError={Boolean(fieldErrors.participants)}
                  trailing={
                    <Pressable
                      style={styles.iconButton}
                      onPress={showParticipantsInviteHelp}
                      accessibilityRole="button"
                      accessibilityLabel="About participant invitations"
                    >
                      <Feather
                        name="info"
                        size={16}
                        color={theme.colors.mutedForeground}
                      />
                    </Pressable>
                  }
                />
                {renderFieldError("participants")}
                {sortedParticipants.length > 0 ? (
                  <View style={styles.participantList}>
                    {sortedParticipants.map((participant) => {
                      const name = participant.displayName || participant.email;
                      return (
                        <View key={participant.email} style={styles.participantRow}>
                          <BlobatarAvatar
                            email={participant.email}
                            name={participant.displayName}
                            size={28}
                          />
                          <View style={styles.participantMeta}>
                            <Text style={styles.participantName} numberOfLines={1}>
                              {name}
                            </Text>
                            <Text style={styles.participantSubtitle} numberOfLines={1}>
                              {participant.role === "organizer"
                                ? "Organizer"
                                : participant.displayName
                                  ? participant.email
                                  : formatParticipantStatus(participant.status)}
                            </Text>
                          </View>
                          {participant.role !== "organizer" && (
                            <Pressable
                              style={styles.iconButton}
                              onPress={() => removeParticipant(participant.email)}
                              accessibilityRole="button"
                              accessibilityLabel={`Remove ${name}`}
                            >
                              <Feather
                                name="x"
                                size={14}
                                color={theme.colors.mutedForeground}
                              />
                            </Pressable>
                          )}
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </EventEditorRow>

              <EventEditorRow icon="map-pin" label="Location">
                <TextInput
                  ref={locationInputRef}
                  style={styles.field}
                  value={location}
                  onChangeText={setLocation}
                  placeholder="Add location"
                  placeholderTextColor={theme.colors.mutedForeground}
                  maxLength={255}
                  returnKeyType="done"
                  blurOnSubmit
                  onFocus={() => {
                    closeParticipantSuggestions();
                    handleInputFocus(locationInputRef.current);
                  }}
                  accessibilityLabel="Location"
                />
                {renderFieldError("location")}
              </EventEditorRow>

              <EventEditorRow icon="bell" label="Reminders">
                <View style={styles.chipRow}>
                  {reminder > 0 ? (
                    <View style={styles.reminderChip}>
                      <EventEditorChip
                        label={`${formatReminderShort(reminder)} before`}
                        trailingIcon="chevron-down"
                        accessibilityLabel={`Reminder ${formatReminderShort(reminder)} before, change time`}
                        onPress={() => openPicker(() => setOpenSheet("reminder"))}
                      />
                      <Pressable
                        style={styles.iconButton}
                        onPress={() => setReminder(0)}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${formatReminderShort(reminder)} reminder`}
                      >
                        <Feather
                          name="x"
                          size={14}
                          color={theme.colors.mutedForeground}
                        />
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable
                      style={styles.addChip}
                      onPress={() => setReminder(DEFAULT_REMINDER_MINUTES)}
                      accessibilityRole="button"
                      accessibilityLabel="Add reminder"
                    >
                      <Feather
                        name="plus"
                        size={14}
                        color={theme.colors.mutedForeground}
                      />
                      <Text style={styles.addChipText}>Add reminder</Text>
                    </Pressable>
                  )}
                </View>
              </EventEditorRow>

              <EventEditorRow icon="align-left" label="Description">
                <TextInput
                  ref={descriptionInputRef}
                  style={[styles.field, styles.textarea]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Add description"
                  placeholderTextColor={theme.colors.mutedForeground}
                  maxLength={1000}
                  multiline
                  textAlignVertical="top"
                  onFocus={() => {
                    closeParticipantSuggestions();
                    handleInputFocus(descriptionInputRef.current);
                  }}
                  accessibilityLabel="Description"
                />
                {renderFieldError("description")}
              </EventEditorRow>
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

        <DatePickerModal
          visible={showStartDatePicker}
          onClose={() => setShowStartDatePicker(false)}
          selectedDate={startWallClock}
          onSelect={handleStartDateSelect}
          title="Start date"
          theme={theme}
          bottomInset={insets.bottom}
        />
        <DatePickerModal
          visible={showEndDatePicker}
          onClose={() => setShowEndDatePicker(false)}
          selectedDate={endWallClock}
          onSelect={handleEndDateSelect}
          minDate={startWallClock}
          title="End date"
          theme={theme}
          bottomInset={insets.bottom}
        />
        <TimePickerModal
          visible={showStartTimePicker}
          onClose={() => setShowStartTimePicker(false)}
          selectedTime={startWallClock}
          onSelect={handleStartTimeSelect}
          title="Start time"
          theme={theme}
          bottomInset={insets.bottom}
        />
        <TimePickerModal
          visible={showEndTimePicker}
          onClose={() => setShowEndTimePicker(false)}
          selectedTime={endWallClock}
          onSelect={handleEndTimeSelect}
          title="End time"
          theme={theme}
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
          title="Reminder"
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
      gap: 10,
    },
    errorContainer: {
      backgroundColor: theme.colors.destructive + "18",
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing["3"],
      gap: theme.spacing["1"],
    },
    chipRow: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      alignItems: "center" as const,
      gap: 4,
    },
    chipRowSpaced: {
      marginTop: 6,
    },
    shrinkChip: {
      flexShrink: 1,
    },
    reminderChip: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 2,
    },
    addChip: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
      height: 44,
      paddingHorizontal: 10,
      borderRadius: theme.borderRadius.md,
    },
    iconButton: {
      width: 44,
      height: 44,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderRadius: theme.borderRadius.md,
    },
    participantList: {
      marginTop: 6,
      gap: 2,
    },
    participantRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 10,
      paddingLeft: 6,
      borderRadius: theme.borderRadius.md,
    },
    participantMeta: {
      flex: 1,
      minWidth: 0,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    titleInput: {
      height: 48,
      marginHorizontal: -theme.spacing["2"],
      paddingHorizontal: theme.spacing["2"],
      borderRadius: theme.borderRadius.md,
      fontSize: theme.typography.fontSize.xl.size,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    field,
    textarea: {
      minHeight: 88,
      paddingTop: 10,
      paddingBottom: 10,
    },
    participantInput: {
      ...field,
      flex: 1,
    },
    rangeDash: {
      paddingHorizontal: 2,
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.mutedForeground,
    },
    addChipText: {
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.mutedForeground,
    },
    participantName: {
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.foreground,
    },
    participantSubtitle: {
      fontSize: theme.typography.fontSize.xs.size,
      color: theme.colors.mutedForeground,
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
