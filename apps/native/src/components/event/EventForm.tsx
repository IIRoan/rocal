import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { format } from "date-fns";
import { useTheme } from "../../providers/ThemeProvider";
import type { ThemeTokens } from "@workspace/design-tokens";
import type {
  Calendar,
  CreateEventRequest,
  EventCategory,
  EventColor,
} from "@workspace/calendar-core";
import { RecurrencePicker } from "./RecurrencePicker";
import {
  REMINDER_OPTIONS,
  roundToNextHour,
  toLocalISOString,
  startOfDay,
  endOfDay,
  buildEventRequest,
  validateForm,
} from "./event-form-utils";

// ─── Time picker helpers ─────────────────────────────────────────────────────

/** Build a static array of Date objects at 15-min intervals. */
function generateTimeOptions(): Date[] {
  const options: Date[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const d = new Date(2000, 0, 1, h, m, 0, 0);
      options.push(d);
    }
  }
  return options;
}

const TIME_OPTIONS = generateTimeOptions();

const PICKER_SPRING = { damping: 28, stiffness: 280, mass: 0.8 };
const PICKER_CLOSE_DURATION = 180;
const PICKER_DISMISS_DISTANCE = 64;
const PICKER_DISMISS_VELOCITY = 650;

function formatTime12(date: Date): string {
  let h = date.getHours();
  const m = date.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface EventFormProps {
  initialValues?: Partial<CreateEventRequest>;
  calendars: Calendar[];
  categories: EventCategory[];
  serverErrors?: string[];
  isSubmitting?: boolean;
  onSubmit: (data: CreateEventRequest) => void;
  onCancel?: () => void;
  noScroll?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function EventForm({
  initialValues,
  calendars,
  categories,
  serverErrors,
  isSubmitting = false,
  onSubmit,
  onCancel,
  noScroll = false,
}: EventFormProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const scrollRef = useRef<ScrollView>(null);
  const titleInputRef = useRef<TextInput>(null);
  const locationInputRef = useRef<TextInput>(null);
  const descriptionInputRef = useRef<TextInput>(null);

  // ── Defaults ─────────────────────────────────────────────────────────────

  const defaultStart = useMemo(() => roundToNextHour(new Date()), []);
  const defaultEnd = useMemo(
    () => new Date(defaultStart.getTime() + 60 * 60 * 1000),
    [defaultStart],
  );
  const defaultCalendarId = calendars[0]?.id ?? "";

  // ── Form state ───────────────────────────────────────────────────────────

  const [title, setTitle] = useState(initialValues?.title ?? "");
  const [allDay, setAllDay] = useState(initialValues?.allDay ?? false);
  const [start, setStart] = useState(
    initialValues?.start ?? toLocalISOString(defaultStart),
  );
  const [end, setEnd] = useState(
    initialValues?.end ?? toLocalISOString(defaultEnd),
  );
  const [calendarId, setCalendarId] = useState(
    initialValues?.calendarId ?? defaultCalendarId,
  );
  const [categoryId, setCategoryId] = useState(
    initialValues?.categoryId ?? "",
  );
  const [location, setLocation] = useState(initialValues?.location ?? "");
  const [description, setDescription] = useState(
    initialValues?.description ?? "",
  );
  const [color, setColor] = useState<EventColor | undefined>(
    initialValues?.color ?? undefined,
  );
  const [recurrence, setRecurrence] = useState<string | null>(
    initialValues?.recurrence ?? null,
  );
  const [reminder, setReminder] = useState<number>(
    initialValues?.reminder ?? 15,
  );

  // ── UI state ─────────────────────────────────────────────────────────────

  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [showLocation, setShowLocation] = useState(!!initialValues?.location);
  const [showDescription, setShowDescription] = useState(
    !!initialValues?.description,
  );
  const [showRecurring, setShowRecurring] = useState(
    !!initialValues?.recurrence,
  );
  const [showReminder, setShowReminder] = useState(
    (initialValues?.reminder ?? 0) > 0,
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalErrors, setGeneralErrors] = useState<string[]>([]);

  // ── Derived values ───────────────────────────────────────────────────────

  const startDate = useMemo(() => new Date(start), [start]);
  const endDate = useMemo(() => new Date(end), [end]);
  const selectedCalendar = calendars.find((c) => c.id === calendarId);
  const selectableCalendars = useMemo(
    () => calendars.filter((c) => !(c as any).isSyncOnly),
    [calendars],
  );

  const startTimeStr = useMemo(() => formatTime12(startDate), [startDate]);
  const endTimeStr = useMemo(() => formatTime12(endDate), [endDate]);

  // ── Scroll-to-input on focus ─────────────────────────────────────────────
  // When a TextInput receives focus, measure its position relative to the
  // ScrollView and scroll so it's visible near the top of the viewport.

  const handleInputFocus = useCallback(
    (ref: TextInput | null) => {
      if (!ref || !scrollRef.current) return;
      const scrollNativeRef = scrollRef.current.getNativeScrollRef();
      if (!scrollNativeRef) return;
      ref.measureLayout(
        scrollNativeRef,
        (_x: number, y: number) => {
          // Scroll so the input sits ~80px from the top
          scrollRef.current?.scrollTo({ y: Math.max(0, y - 80), animated: true });
        },
        () => undefined,
      );
    },
    [],
  );

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleAllDayToggle = useCallback(
    (value: boolean) => {
      setAllDay(value);
      if (value) {
        const sd = start ? new Date(start) : defaultStart;
        setStart(toLocalISOString(startOfDay(sd)));
        setEnd(toLocalISOString(endOfDay(sd)));
      }
    },
    [start, defaultStart],
  );

  const handleStartDateSelect = useCallback(
    (date: Date) => {
      const current = new Date(start);
      date.setHours(current.getHours(), current.getMinutes(), 0, 0);
      setStart(toLocalISOString(date));
      if (date > new Date(end)) {
        const newEnd = new Date(date);
        const currentEnd = new Date(end);
        newEnd.setHours(currentEnd.getHours(), currentEnd.getMinutes(), 0, 0);
        setEnd(toLocalISOString(newEnd));
      }
      setShowStartDatePicker(false);
    },
    [start, end],
  );

  const handleEndDateSelect = useCallback(
    (date: Date) => {
      const current = new Date(end);
      date.setHours(current.getHours(), current.getMinutes(), 0, 0);
      setEnd(toLocalISOString(date));
      setShowEndDatePicker(false);
    },
    [end],
  );

  const handleStartTimeSelect = useCallback(
    (time: Date) => {
      const current = new Date(start);
      current.setHours(time.getHours(), time.getMinutes(), 0, 0);
      setStart(toLocalISOString(current));
      setShowStartTimePicker(false);
    },
    [start],
  );

  const handleEndTimeSelect = useCallback(
    (time: Date) => {
      const current = new Date(end);
      current.setHours(time.getHours(), time.getMinutes(), 0, 0);
      setEnd(toLocalISOString(current));
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
      categoryId: categoryId || undefined,
      recurrence,
      reminder,
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
    title, start, end, calendarId, allDay, location, description,
    color, categoryId, recurrence, reminder, onSubmit,
  ]);

  const renderFieldError = (field: string) => {
    const error = fieldErrors[field];
    if (!error) return null;
    return <Text style={styles.fieldError}>{error}</Text>;
  };

  const isEditMode = !!initialValues?.title;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <View style={styles.container}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.formInner}>
              {/* Server errors */}
              {serverErrors && serverErrors.length > 0 && (
                <View style={styles.errorContainer}>
                  {serverErrors.map((err, idx) => (
                    <Text key={idx} style={styles.errorText}>{err}</Text>
                  ))}
                </View>
              )}

              {/* General validation errors */}
              {generalErrors.length > 0 && (
                <View style={styles.errorContainer}>
                  {generalErrors.map((err, idx) => (
                    <Text key={idx} style={styles.errorText}>{err}</Text>
                  ))}
                </View>
              )}

              {/* ── Title ─────────────────────────────────────────── */}
              <TextInput
                ref={titleInputRef}
                style={[styles.titleInput, fieldErrors.title ? styles.inputError : null]}
                value={title}
                onChangeText={setTitle}
                placeholder="Event title"
                placeholderTextColor={theme.colors.mutedForeground}
                maxLength={255}
                returnKeyType="done"
                blurOnSubmit
                onFocus={() => handleInputFocus(titleInputRef.current)}
                accessibilityLabel="Event title"
              />
              {renderFieldError("title")}

              {/* ── Calendar ──────────────────────────────────────── */}
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Calendar</Text>
                <Pressable
                  style={[
                    styles.selectButton,
                    fieldErrors.calendarId ? styles.inputError : null,
                  ]}
                  onPress={() => {
                    Keyboard.dismiss();
                    setShowCalendarPicker((v) => !v);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Calendar: ${selectedCalendar?.name ?? "Select calendar"}`}
                >
                  <View style={styles.selectContent}>
                    {selectedCalendar && (
                      <View
                        style={[
                          styles.colorDot,
                          {
                            backgroundColor:
                              theme.colors.calendar[
                                selectedCalendar.color as keyof typeof theme.colors.calendar
                              ]?.bg ?? selectedCalendar.color,
                          },
                        ]}
                      />
                    )}
                    <Text
                      style={[
                        styles.selectText,
                        !selectedCalendar && styles.placeholderText,
                      ]}
                    >
                      {selectedCalendar?.name ?? "Select calendar"}
                    </Text>
                  </View>
                  <Feather
                    name="chevron-down"
                    size={14}
                    color={theme.colors.mutedForeground}
                  />
                </Pressable>
                {renderFieldError("calendarId")}

                {showCalendarPicker && (
                  <View style={styles.dropdownList}>
                    {selectableCalendars.map((cal) => (
                      <Pressable
                        key={cal.id}
                        style={[
                          styles.dropdownItem,
                          cal.id === calendarId && styles.dropdownItemActive,
                        ]}
                        onPress={() => {
                          setCalendarId(cal.id);
                          setShowCalendarPicker(false);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={cal.name}
                        accessibilityState={{ selected: cal.id === calendarId }}
                      >
                        <View
                          style={[
                            styles.colorDot,
                            {
                              backgroundColor:
                                theme.colors.calendar[
                                  cal.color as keyof typeof theme.colors.calendar
                                ]?.bg ?? cal.color,
                            },
                          ]}
                        />
                        <Text style={styles.dropdownItemText}>{cal.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>

              {/* ── Date & Time ────────────────────────────────────── */}
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Date & Time</Text>
                <View style={styles.dateTimeContainer}>
                  {/* Date row */}
                  <View style={styles.dateRow}>
                    <Pressable
                      style={styles.dateButton}
                      onPress={() => {
                        Keyboard.dismiss();
                        setShowEndDatePicker(false);
                        setShowStartDatePicker(true);
                      }}
                      accessibilityLabel={`Start date: ${format(startDate, "EEE, MMM d")}`}
                    >
                      <Feather
                        name="calendar"
                        size={14}
                        color={theme.colors.foreground}
                        style={{ marginRight: 8 }}
                      />
                      <Text style={styles.dateButtonText} numberOfLines={1}>
                        {format(startDate, "EEE, MMM d")}
                      </Text>
                    </Pressable>

                    <Text style={styles.arrowText}>→</Text>

                    <Pressable
                      style={styles.dateButton}
                      onPress={() => {
                        Keyboard.dismiss();
                        setShowStartDatePicker(false);
                        setShowEndDatePicker(true);
                      }}
                      accessibilityLabel={`End date: ${format(endDate, "EEE, MMM d")}`}
                    >
                      <Feather
                        name="calendar"
                        size={14}
                        color={theme.colors.foreground}
                        style={{ marginRight: 8 }}
                      />
                      <Text style={styles.dateButtonText} numberOfLines={1}>
                        {format(endDate, "EEE, MMM d")}
                      </Text>
                    </Pressable>
                  </View>

                  {/* Time row */}
                  {!allDay && (
                    <View style={styles.dateRow}>
                      <Pressable
                        style={styles.dateButton}
                        onPress={() => {
                          Keyboard.dismiss();
                          setShowEndTimePicker(false);
                          setShowStartTimePicker(true);
                        }}
                        accessibilityLabel={`Start time: ${startTimeStr}`}
                      >
                        <Feather
                          name="clock"
                          size={14}
                          color={theme.colors.foreground}
                          style={{ marginRight: 8 }}
                        />
                        <Text style={styles.dateButtonText}>{startTimeStr}</Text>
                      </Pressable>

                      <Text style={styles.arrowText}>→</Text>

                      <Pressable
                        style={styles.dateButton}
                        onPress={() => {
                          Keyboard.dismiss();
                          setShowStartTimePicker(false);
                          setShowEndTimePicker(true);
                        }}
                        accessibilityLabel={`End time: ${endTimeStr}`}
                      >
                        <Feather
                          name="clock"
                          size={14}
                          color={theme.colors.foreground}
                          style={{ marginRight: 8 }}
                        />
                        <Text style={styles.dateButtonText}>{endTimeStr}</Text>
                      </Pressable>
                    </View>
                  )}

                  {/* All-day toggle */}
                  <View style={styles.allDayRow}>
                    <Text style={styles.allDayLabel}>All day</Text>
                    <Switch
                      value={allDay}
                      onValueChange={(v) => { Keyboard.dismiss(); handleAllDayToggle(v); }}
                      trackColor={{
                        false: theme.colors.border,
                        true: theme.colors.primaryBase,
                      }}
                      accessibilityLabel="All day event"
                    />
                  </View>
                </View>
              </View>

              {/* ── Options toggle pills ──────────────────────────── */}
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Options</Text>
                <View style={styles.toggleRow}>
                  <TogglePill
                    icon="map-pin"
                    label="Location"
                    active={showLocation}
                    onPress={() => { Keyboard.dismiss(); setShowLocation((v) => !v); }}
                    theme={theme}
                  />
                  <TogglePill
                    icon="file-text"
                    label="Description"
                    active={showDescription}
                    onPress={() => { Keyboard.dismiss(); setShowDescription((v) => !v); }}
                    theme={theme}
                  />
                  <TogglePill
                    icon="rotate-ccw"
                    label="Repeat"
                    active={showRecurring}
                    onPress={() => { Keyboard.dismiss(); setShowRecurring((v) => !v); }}
                    theme={theme}
                  />
                  <TogglePill
                    icon="bell"
                    label="Reminder"
                    active={showReminder}
                    onPress={() => { Keyboard.dismiss(); setShowReminder((v) => !v); }}
                    theme={theme}
                  />
                </View>
              </View>

              {/* ── Expandable fields ─────────────────────────────── */}
              {(showLocation || showDescription || showRecurring || showReminder) && (
                <View style={styles.expandableSection}>
                  {showLocation && (
                    <TextInput
                      ref={locationInputRef}
                      style={[
                        styles.expandableInput,
                        fieldErrors.location ? styles.inputError : null,
                      ]}
                      value={location}
                      onChangeText={setLocation}
                      placeholder="Location"
                      placeholderTextColor={theme.colors.mutedForeground}
                      maxLength={255}
                      returnKeyType="done"
                      blurOnSubmit
                      onFocus={() => handleInputFocus(locationInputRef.current)}
                      accessibilityLabel="Event location"
                    />
                  )}
                  {renderFieldError("location")}

                  {showDescription && (
                    <TextInput
                      ref={descriptionInputRef}
                      style={[
                        styles.expandableInput,
                        styles.textareaInput,
                        fieldErrors.description ? styles.inputError : null,
                      ]}
                      value={description}
                      onChangeText={setDescription}
                      placeholder="Description..."
                      placeholderTextColor={theme.colors.mutedForeground}
                      maxLength={1000}
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                      onFocus={() => handleInputFocus(descriptionInputRef.current)}
                      accessibilityLabel="Event description"
                    />
                  )}
                  {renderFieldError("description")}

                  {showRecurring && (
                    <RecurrencePicker
                      value={recurrence}
                      onChange={setRecurrence}
                      eventStart={start}
                      eventEnd={end}
                    />
                  )}

                  {showReminder && (
                    <View style={styles.reminderSection}>
                      <Text style={styles.reminderLabel}>Reminder</Text>
                      <View style={styles.reminderRow}>
                        {REMINDER_OPTIONS.map((mins) => {
                          const isActive = reminder === mins;
                          const label =
                            mins === 0
                              ? "None"
                              : mins < 60
                                ? `${mins}m`
                                : `${mins / 60}h`;
                          return (
                            <Pressable
                              key={mins}
                              style={[
                                styles.reminderChip,
                                isActive && styles.reminderChipActive,
                                isActive && {
                                  backgroundColor: theme.colors.primaryBase,
                                },
                              ]}
                              onPress={() => { Keyboard.dismiss(); setReminder(mins); }}
                              accessibilityRole="button"
                              accessibilityLabel={`Reminder ${label}`}
                              accessibilityState={{ selected: isActive }}
                            >
                              <Text
                                style={[
                                  styles.reminderChipText,
                                  isActive && styles.reminderChipTextActive,
                                  isActive && {
                                    color: theme.colors.primaryForeground,
                                  },
                                ]}
                              >
                                {label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  )}
                </View>
              )}
            </View>
        </ScrollView>

        {/* ── Sticky footer ─────────────────────────────────────── */}
        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(12, insets.bottom) },
          ]}
        >
          {onCancel && (
            <Pressable
              style={styles.cancelButton}
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
          )}
          <View style={styles.footerSpacer} />
          <Pressable
            style={[
              styles.saveButton,
              { backgroundColor: theme.colors.primaryBase },
              isSubmitting && styles.saveButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={isSubmitting}
            accessibilityRole="button"
            accessibilityLabel={isEditMode ? "Save event" : "Create event"}
          >
            {isSubmitting ? (
              <ActivityIndicator
                size="small"
                color={theme.colors.primaryForeground}
              />
            ) : (
              <>
                <Feather
                  name="save"
                  size={14}
                  color={theme.colors.primaryForeground}
                />
                <Text
                  style={[
                    styles.saveButtonText,
                    { color: theme.colors.primaryForeground },
                  ]}
                >
                  {isEditMode ? "Save" : "Create"}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </View>

      {/* ── Modals (outside main layout) ──────────────────────── */}
      <DatePickerModal
        visible={showStartDatePicker}
        onClose={() => setShowStartDatePicker(false)}
        selectedDate={startDate}
        onSelect={handleStartDateSelect}
        title="Select start date"
        theme={theme}
        bottomInset={insets.bottom}
      />
      <DatePickerModal
        visible={showEndDatePicker}
        onClose={() => setShowEndDatePicker(false)}
        selectedDate={endDate}
        onSelect={handleEndDateSelect}
        minDate={startDate}
        title="Select end date"
        theme={theme}
        bottomInset={insets.bottom}
      />
      <TimePickerModal
        visible={showStartTimePicker}
        onClose={() => setShowStartTimePicker(false)}
        selectedTime={startDate}
        onSelect={handleStartTimeSelect}
        title="Select start time"
        theme={theme}
        bottomInset={insets.bottom}
      />
      <TimePickerModal
        visible={showEndTimePicker}
        onClose={() => setShowEndTimePicker(false)}
        selectedTime={endDate}
        onSelect={handleEndTimeSelect}
        title="Select end time"
        theme={theme}
        bottomInset={insets.bottom}
      />
    </>
  );
}


// ─── Time Picker Modal ───────────────────────────────────────────────────────
// Refactored to use a plain ScrollView grid instead of FlatList. The FlatList
// approach was broken because getItemLayout couldn't account for gaps between
// rows, causing initialScrollIndex to land in the wrong place and the grid to
// render incorrectly. A ScrollView with a simple map is more reliable here
// since we only have 96 items (24h × 4 per hour).

function TimePickerModal({
  visible,
  onClose,
  selectedTime,
  onSelect,
  title: titleText,
  theme,
  bottomInset,
}: {
  visible: boolean;
  onClose: () => void;
  selectedTime: Date;
  onSelect: (time: Date) => void;
  title?: string;
  theme: ThemeTokens;
  bottomInset: number;
}) {
  const timeScrollRef = useRef<ScrollView>(null);
  const selectedH = selectedTime.getHours();
  const selectedM = selectedTime.getMinutes();

  // Each row is 44px tall + 8px gap = 52px. 4 items per row.
  const selectedIndex = TIME_OPTIONS.findIndex(
    (t) => t.getHours() === selectedH && t.getMinutes() === selectedM,
  );
  const selectedRow = selectedIndex >= 0 ? Math.floor(selectedIndex / 4) : 0;
  const targetOffset = Math.max(0, selectedRow * 52 - 104);

  // Chunk the options into rows of 4
  const rows: Date[][] = useMemo(() => {
    const r: Date[][] = [];
    for (let i = 0; i < TIME_OPTIONS.length; i += 4) {
      r.push(TIME_OPTIONS.slice(i, i + 4));
    }
    return r;
  }, []);

  const modalStyles = useMemo(() => createModalStyles(theme), [theme]);

  // Scroll to the selected time after the ScrollView content is measured.
  // contentOffset is unreliable with animationType="slide" so we use
  // onContentSizeChange which fires once the content is laid out.
  const hasScrolled = useRef(false);

  // Reset scroll flag when modal closes
  if (!visible) {
    hasScrolled.current = false;
  }

  const handleContentSizeChange = useCallback(() => {
    if (!hasScrolled.current && targetOffset > 0) {
      hasScrolled.current = true;
      setTimeout(() => {
        timeScrollRef.current?.scrollTo({ y: targetOffset, animated: false });
      }, 50);
    }
  }, [targetOffset]);

  return (
    <PickerSheet
      visible={visible}
      onClose={onClose}
      title={titleText ?? "Select time"}
      theme={theme}
      bottomInset={bottomInset}
      maxHeightRatio={0.56}
    >
      <ScrollView
        ref={timeScrollRef}
        style={modalStyles.scrollArea}
        contentContainerStyle={modalStyles.grid}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={handleContentSizeChange}
      >
        {rows.map((row, ri) => (
          <View key={ri} style={modalStyles.gridRow}>
            {row.map((time) => {
              const isSelected =
                time.getHours() === selectedH &&
                time.getMinutes() === selectedM;
              const now = new Date();
              const isCurrent =
                time.getHours() === now.getHours() &&
                time.getMinutes() === now.getMinutes();
              return (
                <Pressable
                  key={`${time.getHours()}-${time.getMinutes()}`}
                  style={[
                    modalStyles.cell,
                    isSelected && { backgroundColor: theme.colors.primaryBase },
                    !isSelected && isCurrent && {
                      backgroundColor: theme.colors.primaryBase + "33",
                      borderWidth: 2,
                      borderColor: theme.colors.primaryBase,
                    },
                  ]}
                  onPress={() => onSelect(time)}
                >
                  <Text
                    style={[
                      modalStyles.cellText,
                      isSelected && { color: theme.colors.primaryForeground },
                      !isSelected && isCurrent && { color: theme.colors.primaryBase },
                    ]}
                  >
                    {formatTime12(time)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </PickerSheet>
  );
}

function PickerSheet({
  visible,
  onClose,
  title,
  theme,
  bottomInset,
  maxHeightRatio,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  theme: ThemeTokens;
  bottomInset: number;
  maxHeightRatio: number;
  children: React.ReactNode;
}) {
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const styles = useMemo(() => createModalStyles(theme), [theme]);
  const translateY = useSharedValue(height);
  const overlayOpacity = useSharedValue(0);

  const finishUnmount = useCallback(() => setMounted(false), []);
  const requestClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
    }
  }, [visible]);

  useEffect(() => {
    translateY.value = visible
      ? withSpring(0, PICKER_SPRING)
      : withTiming(height, { duration: PICKER_CLOSE_DURATION }, (finished) => {
          if (finished) runOnJS(finishUnmount)();
        });
    overlayOpacity.value = withTiming(visible ? 1 : 0, {
      duration: PICKER_CLOSE_DURATION,
    });
  }, [visible, height, translateY, overlayOpacity, finishUnmount]);

  const panGesture = Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetX([-20, 20])
    .onUpdate((e) => {
      "worklet";
      if (e.translationY > 0) {
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      "worklet";
      if (
        e.translationY > PICKER_DISMISS_DISTANCE ||
        e.velocityY > PICKER_DISMISS_VELOCITY
      ) {
        runOnJS(requestClose)();
      } else {
        translateY.value = withSpring(0, PICKER_SPRING);
      }
    });

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const sheetStyle = useAnimatedStyle(() => {
    const handleOpacity = interpolate(
      translateY.value,
      [0, height * 0.25],
      [1, 0.25],
      Extrapolation.CLAMP,
    );

    return {
      transform: [{ translateY: translateY.value }],
      opacity: handleOpacity,
    };
  });

  if (!mounted) return null;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={requestClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.42)" }, overlayStyle]}
        />
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={requestClose}
          accessibilityRole="button"
          accessibilityLabel="Close picker"
        />
        <Animated.View
          style={[
            styles.sheet,
            {
              maxHeight: height * maxHeightRatio,
              paddingBottom: Math.max(16, bottomInset + 8),
            },
            sheetStyle,
          ]}
        >
          <GestureDetector gesture={panGesture}>
            <View style={styles.handleArea}>
              <View style={styles.handle} />
            </View>
          </GestureDetector>
          <Text style={styles.title}>{title}</Text>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

/** Shared modal styles for time and date pickers. */
function createModalStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: theme.colors.card + "F2",
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      overflow: "hidden",
    },
    handleArea: {
      alignItems: "center",
      paddingTop: 12,
      paddingBottom: 8,
    },
    handle: {
      width: 42,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.colors.muted,
    },
    title: {
      fontSize: theme.typography.fontSize.base.size,
      fontWeight: theme.typography.fontWeight.semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
      textAlign: "center",
      marginBottom: 10,
      paddingHorizontal: 16,
    },
    scrollArea: {
      flexGrow: 0,
    },
    grid: {
      paddingHorizontal: 12,
      paddingBottom: 16,
    },
    gridRow: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 8,
    },
    calendarContent: {
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    cell: {
      flex: 1,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 12,
      backgroundColor: theme.colors.muted,
    },
    cellText: {
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: theme.typography.fontWeight.semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
  });
}

// ─── Date Picker Modal ───────────────────────────────────────────────────────

function DatePickerModal({
  visible,
  onClose,
  selectedDate,
  onSelect,
  minDate,
  title: titleText,
  theme,
  bottomInset,
}: {
  visible: boolean;
  onClose: () => void;
  selectedDate: Date;
  onSelect: (date: Date) => void;
  minDate?: Date;
  title?: string;
  theme: ThemeTokens;
  bottomInset: number;
}) {
  const dpStyles = useMemo(() => createModalStyles(theme), [theme]);
  return (
    <PickerSheet
      visible={visible}
      onClose={onClose}
      title={titleText ?? "Select date"}
      theme={theme}
      bottomInset={bottomInset}
      maxHeightRatio={0.7}
    >
      <View style={dpStyles.calendarContent}>
        <CalendarGrid
          selectedDate={selectedDate}
          onSelect={onSelect}
          minDate={minDate}
          theme={theme}
        />
      </View>
    </PickerSheet>
  );
}

// ─── Toggle Pill ─────────────────────────────────────────────────────────────

function TogglePill({
  icon,
  label,
  active,
  onPress,
  theme,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  active: boolean;
  onPress: () => void;
  theme: ThemeTokens;
}) {
  return (
    <Pressable
      style={[
        {
          flexDirection: "row" as const,
          alignItems: "center" as const,
          gap: 6,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: theme.borderRadius.full,
          borderWidth: 1,
        },
        active
          ? {
              backgroundColor: theme.colors.primaryBase + "1A",
              borderColor: theme.colors.primaryBase + "66",
            }
          : {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}${active ? ", active" : ""}`}
      accessibilityState={{ selected: active }}
    >
      <Feather
        name={icon}
        size={14}
        color={active ? theme.colors.primaryBase : theme.colors.mutedForeground}
      />
      <Text
        style={{
          fontSize: theme.typography.fontSize.sm.size,
          fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
          color: active ? theme.colors.primaryBase : theme.colors.foreground,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ─── Calendar Grid ───────────────────────────────────────────────────────────

function CalendarGrid({
  selectedDate,
  onSelect,
  minDate,
  theme,
}: {
  selectedDate: Date;
  onSelect: (date: Date) => void;
  minDate?: Date;
  theme: ThemeTokens;
}) {
  const [viewMonth, setViewMonth] = useState(
    new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
  );

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (firstDay + 6) % 7;

  const weeks: (number | null)[][] = [];
  let currentWeek: (number | null)[] = [];

  for (let i = 0; i < startOffset; i++) currentWeek.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    currentWeek.push(day);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push(null);
    weeks.push(currentWeek);
  }

  const prevMonth = () => setViewMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setViewMonth(new Date(year, month + 1, 1));

  const monthLabel = format(viewMonth, "MMMM yyyy");
  const dayHeaders = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

  const isSelected = (day: number) =>
    day === selectedDate.getDate() &&
    month === selectedDate.getMonth() &&
    year === selectedDate.getFullYear();

  const isDisabled = (day: number) => {
    if (!minDate) return false;
    const d = new Date(year, month, day);
    const min = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate());
    return d < min;
  };

  const today = new Date();
  const isToday = (day: number) =>
    day === today.getDate() &&
    month === today.getMonth() &&
    year === today.getFullYear();

  return (
    <View style={{ gap: 8 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 4,
        }}
      >
        <Pressable onPress={prevMonth} hitSlop={12} style={{ padding: 8 }}>
          <Feather name="chevron-left" size={18} color={theme.colors.foreground} />
        </Pressable>
        <Text
          style={{
            fontSize: theme.typography.fontSize.sm.size,
            fontWeight: theme.typography.fontWeight.semibold as TextStyle["fontWeight"],
            color: theme.colors.foreground,
          }}
        >
          {monthLabel}
        </Text>
        <Pressable onPress={nextMonth} hitSlop={12} style={{ padding: 8 }}>
          <Feather name="chevron-right" size={18} color={theme.colors.foreground} />
        </Pressable>
      </View>

      <View style={{ flexDirection: "row" }}>
        {dayHeaders.map((d) => (
          <View key={d} style={{ flex: 1, alignItems: "center", paddingVertical: 4 }}>
            <Text
              style={{
                fontSize: theme.typography.fontSize.xs.size,
                color: theme.colors.mutedForeground,
                fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
              }}
            >
              {d}
            </Text>
          </View>
        ))}
      </View>

      {weeks.map((week, wi) => (
        <View key={wi} style={{ flexDirection: "row" }}>
          {week.map((day, di) => {
            if (day === null) return <View key={`empty-${di}`} style={{ flex: 1 }} />;
            const selected = isSelected(day);
            const disabled = isDisabled(day);
            const todayDay = isToday(day);
            return (
              <Pressable
                key={day}
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 8,
                  borderRadius: theme.borderRadius.full,
                  backgroundColor: selected ? theme.colors.primaryBase : "transparent",
                  opacity: disabled ? 0.3 : 1,
                }}
                onPress={() => { if (!disabled) onSelect(new Date(year, month, day)); }}
                disabled={disabled}
              >
                <Text
                  style={{
                    fontSize: theme.typography.fontSize.sm.size,
                    fontWeight: selected || todayDay
                      ? (theme.typography.fontWeight.semibold as TextStyle["fontWeight"])
                      : (theme.typography.fontWeight.normal as TextStyle["fontWeight"]),
                    color: selected
                      ? theme.colors.primaryForeground
                      : todayDay
                        ? theme.colors.primaryBase
                        : theme.colors.foreground,
                  }}
                >
                  {day}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function createStyles(theme: ThemeTokens) {
  const view = {
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    scrollContent: {
      flexGrow: 1,
    },
    formInner: {
      padding: theme.spacing["4"],
      gap: theme.spacing["3"],
    },
    errorContainer: {
      backgroundColor: theme.colors.destructive + "18",
      borderRadius: theme.borderRadius.sm,
      padding: theme.spacing["3"],
      gap: theme.spacing["1"],
    },

    // Title
    titleInput: {
      fontSize: theme.typography.fontSize.lg.size,
      fontWeight: theme.typography.fontWeight.semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
      height: 44,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.sm,
      paddingHorizontal: theme.spacing["3"],
    } as ViewStyle & TextStyle,

    inputError: {
      borderColor: theme.colors.destructive,
    },

    section: {
      gap: 6,
    },

    // Select / dropdown
    selectButton: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      height: 36,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.sm,
      paddingHorizontal: theme.spacing["3"],
      backgroundColor: theme.colors.card,
    },
    selectContent: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["2"],
    },
    colorDot: {
      width: 10,
      height: 10,
      borderRadius: theme.borderRadius.full,
    },
    dropdownList: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.sm,
      backgroundColor: theme.colors.card,
      overflow: "hidden" as const,
    },
    dropdownItem: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["2"],
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["2"],
    },
    dropdownItemActive: {
      backgroundColor: theme.colors.muted,
    },

    // Date & Time
    dateTimeContainer: {
      gap: theme.spacing["2"],
    },
    dateRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["2"],
    },
    dateButton: {
      flex: 1,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      height: 36,
      paddingHorizontal: theme.spacing["3"],
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.sm,
      backgroundColor: theme.colors.card,
    },
    allDayRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      paddingVertical: 12,
      paddingHorizontal: 4,
    },

    // Toggle pills
    toggleRow: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      alignItems: "center" as const,
      gap: theme.spacing["2"],
    },

    // Expandable section
    expandableSection: {
      gap: theme.spacing["3"],
      paddingTop: theme.spacing["3"],
      marginTop: theme.spacing["3"],
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border + "80",
    },
    expandableInput: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.sm,
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["2"],
      height: 44,
      color: theme.colors.foreground,
      backgroundColor: theme.colors.card,
      fontSize: theme.typography.fontSize.sm.size,
    },
    textareaInput: {
      minHeight: 60,
      height: undefined as unknown as number,
      textAlignVertical: "top" as const,
    },

    // Reminder
    reminderSection: {
      gap: theme.spacing["2"],
    },
    reminderRow: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      gap: theme.spacing["2"],
    },
    reminderChip: {
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["1"],
      borderRadius: theme.borderRadius.full,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.card,
    },
    reminderChipActive: {
      borderColor: "transparent",
    },

    // Footer
    footer: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 12,
      paddingTop: 12,
      paddingHorizontal: theme.spacing["4"],
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border + "80",
      backgroundColor: theme.colors.muted + "4D",
    },
    footerSpacer: {
      flex: 1,
    },
    cancelButton: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: theme.borderRadius.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.background,
    },
    saveButton: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: theme.borderRadius.md,
    },
    saveButtonDisabled: {
      opacity: 0.6,
    },
  } satisfies Record<string, ViewStyle | TextStyle>;

  const text = {
    sectionLabel: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    selectText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
    },
    placeholderText: {
      color: theme.colors.mutedForeground,
    },
    dropdownItemText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
    },
    dateButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    arrowText: {
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.mutedForeground,
    },
    allDayLabel: {
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    reminderLabel: {
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    reminderChipText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
    },
    reminderChipTextActive: {
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
    },
    fieldError: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.destructive,
    },
    errorText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.destructive,
    },
    cancelButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    saveButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}

export type { EventFormProps };
