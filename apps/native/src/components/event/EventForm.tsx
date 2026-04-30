import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { useTheme } from "../../providers/ThemeProvider";
import type { ThemeTokens } from "@workspace/design-tokens";
import type {
  Calendar,
  CreateEventRequest,
  EventCategory,
  EventColor,
} from "@workspace/calendar-core";
import { ColorPicker } from "./ColorPicker";
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

// ─── Props ───────────────────────────────────────────────────────────────────

interface EventFormProps {
  /** Initial form values (for edit mode) */
  initialValues?: Partial<CreateEventRequest>;
  /** Available calendars for the calendar selector */
  calendars: Calendar[];
  /** Available categories for the category selector */
  categories: EventCategory[];
  /** Server-side error messages to display */
  serverErrors?: string[];
  /** Whether the form is submitting */
  isSubmitting?: boolean;
  /** Callback when the form is submitted with valid data */
  onSubmit: (data: CreateEventRequest) => void;
  /** Callback when cancel is pressed */
  onCancel?: () => void;
  /**
   * When true, the form renders as a plain View instead of wrapping in its
   * own ScrollView. Use this when the form is already inside a scrollable
   * container (e.g. BottomSheet).
   */
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
  const styles = useMemo(() => createStyles(theme), [theme]);

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
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalErrors, setGeneralErrors] = useState<string[]>([]);

  // ── Derived values ───────────────────────────────────────────────────────

  const selectedCalendar = calendars.find((c) => c.id === calendarId);
  const selectedCategory = categories.find((c) => c.id === categoryId);

  // ── All-day toggle handler ───────────────────────────────────────────────

  const handleAllDayToggle = useCallback(
    (value: boolean) => {
      setAllDay(value);
      if (value) {
        const startDate = start ? new Date(start) : defaultStart;
        setStart(toLocalISOString(startOfDay(startDate)));
        setEnd(toLocalISOString(endOfDay(startDate)));
      }
    },
    [start, defaultStart],
  );

  // ── Submit handler ───────────────────────────────────────────────────────

  const handleSubmit = useCallback(() => {
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
    title,
    start,
    end,
    calendarId,
    allDay,
    location,
    description,
    color,
    categoryId,
    recurrence,
    reminder,
    onSubmit,
  ]);

  // ── Render helpers ───────────────────────────────────────────────────────

  const renderFieldError = (field: string) => {
    const error = fieldErrors[field];
    if (!error) return null;
    return <Text style={styles.fieldError}>{error}</Text>;
  };

  const isEditMode = !!initialValues?.title;

  const formContent = (
    <>
      {/* Server errors */}
      {serverErrors && serverErrors.length > 0 && (
        <View style={styles.serverErrorContainer}>
          {serverErrors.map((err, idx) => (
            <Text key={idx} style={styles.serverErrorText}>
              {err}
            </Text>
          ))}
        </View>
      )}

      {/* General validation errors */}
      {generalErrors.length > 0 && (
        <View style={styles.serverErrorContainer}>
          {generalErrors.map((err, idx) => (
            <Text key={idx} style={styles.serverErrorText}>
              {err}
            </Text>
          ))}
        </View>
      )}

      {/* ── Title ─────────────────────────────────────────────────────── */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Title *</Text>
        <TextInput
          style={[styles.input, fieldErrors.title ? styles.inputError : null]}
          value={title}
          onChangeText={setTitle}
          placeholder="Event title"
          placeholderTextColor={theme.colors.mutedForeground}
          maxLength={255}
          accessibilityLabel="Event title"
        />
        {renderFieldError("title")}
      </View>

      {/* ── All-day toggle ────────────────────────────────────────────── */}
      <View style={styles.switchRow}>
        <Text style={styles.label}>All day</Text>
        <Switch
          value={allDay}
          onValueChange={handleAllDayToggle}
          trackColor={{
            false: theme.colors.border,
            true: theme.colors.primaryBase,
          }}
          accessibilityLabel="All day event"
        />
      </View>

      {/* ── Start date/time ───────────────────────────────────────────── */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>{allDay ? "Start date" : "Start"}</Text>
        <TextInput
          style={styles.input}
          value={start}
          onChangeText={setStart}
          placeholder="YYYY-MM-DDTHH:mm"
          placeholderTextColor={theme.colors.mutedForeground}
          accessibilityLabel={allDay ? "Start date" : "Start date and time"}
        />
      </View>

      {/* ── End date/time ─────────────────────────────────────────────── */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>{allDay ? "End date" : "End"}</Text>
        <TextInput
          style={[styles.input, fieldErrors.end ? styles.inputError : null]}
          value={end}
          onChangeText={setEnd}
          placeholder="YYYY-MM-DDTHH:mm"
          placeholderTextColor={theme.colors.mutedForeground}
          accessibilityLabel={allDay ? "End date" : "End date and time"}
        />
        {renderFieldError("end")}
      </View>

      {/* ── Calendar selector ─────────────────────────────────────────── */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Calendar *</Text>
        <Pressable
          style={[
            styles.selectorButton,
            fieldErrors.calendarId ? styles.inputError : null,
          ]}
          onPress={() => setShowCalendarPicker((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={`Calendar: ${selectedCalendar?.name ?? "Select calendar"}`}
        >
          <View style={styles.selectorContent}>
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
                styles.selectorText,
                !selectedCalendar && styles.placeholderText,
              ]}
            >
              {selectedCalendar?.name ?? "Select calendar"}
            </Text>
          </View>
          <Text style={styles.chevron}>▼</Text>
        </Pressable>
        {renderFieldError("calendarId")}

        {showCalendarPicker && (
          <View style={styles.dropdownList}>
            {calendars.map((cal) => (
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

      {/* ── Category selector ─────────────────────────────────────────── */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Category</Text>
        <Pressable
          style={styles.selectorButton}
          onPress={() => setShowCategoryPicker((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={`Category: ${selectedCategory?.name ?? "None"}`}
        >
          <View style={styles.selectorContent}>
            {selectedCategory && (
              <View
                style={[
                  styles.colorDot,
                  { backgroundColor: selectedCategory.color },
                ]}
              />
            )}
            <Text
              style={[
                styles.selectorText,
                !selectedCategory && styles.placeholderText,
              ]}
            >
              {selectedCategory?.name ?? "None"}
            </Text>
          </View>
          <Text style={styles.chevron}>▼</Text>
        </Pressable>

        {showCategoryPicker && (
          <View style={styles.dropdownList}>
            <Pressable
              style={[
                styles.dropdownItem,
                !categoryId && styles.dropdownItemActive,
              ]}
              onPress={() => {
                setCategoryId("");
                setShowCategoryPicker(false);
              }}
              accessibilityRole="button"
              accessibilityLabel="No category"
              accessibilityState={{ selected: !categoryId }}
            >
              <Text style={styles.dropdownItemText}>None</Text>
            </Pressable>
            {categories.map((cat) => (
              <Pressable
                key={cat.id}
                style={[
                  styles.dropdownItem,
                  cat.id === categoryId && styles.dropdownItemActive,
                ]}
                onPress={() => {
                  setCategoryId(cat.id);
                  setShowCategoryPicker(false);
                }}
                accessibilityRole="button"
                accessibilityLabel={cat.name}
                accessibilityState={{ selected: cat.id === categoryId }}
              >
                <View
                  style={[styles.colorDot, { backgroundColor: cat.color }]}
                />
                <Text style={styles.dropdownItemText}>{cat.name}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* ── Location ──────────────────────────────────────────────────── */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Location</Text>
        <TextInput
          style={[
            styles.input,
            fieldErrors.location ? styles.inputError : null,
          ]}
          value={location}
          onChangeText={setLocation}
          placeholder="Add location"
          placeholderTextColor={theme.colors.mutedForeground}
          maxLength={255}
          accessibilityLabel="Event location"
        />
        {renderFieldError("location")}
      </View>

      {/* ── Description ───────────────────────────────────────────────── */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[
            styles.input,
            styles.multilineInput,
            fieldErrors.description ? styles.inputError : null,
          ]}
          value={description}
          onChangeText={setDescription}
          placeholder="Add description"
          placeholderTextColor={theme.colors.mutedForeground}
          maxLength={1000}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          accessibilityLabel="Event description"
        />
        {renderFieldError("description")}
      </View>

      {/* ── Color picker ──────────────────────────────────────────────── */}
      <View style={styles.fieldGroup}>
        <ColorPicker
          selectedColor={color}
          onColorSelect={setColor}
          label="Color"
        />
        {renderFieldError("color")}
      </View>

      {/* ── Recurrence picker ─────────────────────────────────────────── */}
      <View style={styles.fieldGroup}>
        <RecurrencePicker
          value={recurrence}
          onChange={setRecurrence}
          eventStart={start}
          eventEnd={end}
        />
      </View>

      {/* ── Reminder ──────────────────────────────────────────────────── */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Reminder</Text>
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
                  isActive && { backgroundColor: theme.colors.primaryBase },
                ]}
                onPress={() => setReminder(mins)}
                accessibilityRole="button"
                accessibilityLabel={`Reminder ${label}`}
                accessibilityState={{ selected: isActive }}
              >
                <Text
                  style={[
                    styles.reminderChipText,
                    isActive && styles.reminderChipTextActive,
                    isActive && { color: theme.colors.primaryForeground },
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── Action buttons ────────────────────────────────────────────── */}
      <View style={styles.buttonRow}>
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
        <Pressable
          style={[
            styles.submitButton,
            { backgroundColor: theme.colors.primaryBase },
            isSubmitting && styles.submitButtonDisabled,
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
            <Text
              style={[
                styles.submitButtonText,
                { color: theme.colors.primaryForeground },
              ]}
            >
              {isEditMode ? "Save" : "Create"}
            </Text>
          )}
        </Pressable>
      </View>
    </>
  );

  if (noScroll) {
    return (
      <View style={[styles.container, styles.contentContainer]}>
        {formContent}
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      keyboardShouldPersistTaps="handled"
    >
      {formContent}
    </ScrollView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function createStyles(theme: ThemeTokens) {
  const view = {
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    contentContainer: {
      padding: theme.spacing["4"],
      paddingBottom: theme.spacing["10"],
      gap: theme.spacing["4"],
    },
    serverErrorContainer: {
      backgroundColor: theme.colors.destructive + "18",
      borderRadius: theme.borderRadius.sm,
      padding: theme.spacing["3"],
      gap: theme.spacing["1"],
    },
    fieldGroup: {
      gap: theme.spacing["1"],
    },
    switchRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.sm,
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["2"],
      color: theme.colors.foreground,
      backgroundColor: theme.colors.card,
    },
    inputError: {
      borderColor: theme.colors.destructive,
    },
    multilineInput: {
      minHeight: 100,
    },
    selectorButton: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.sm,
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["2"],
      backgroundColor: theme.colors.card,
    },
    selectorContent: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["2"],
    },
    colorDot: {
      width: 12,
      height: 12,
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
    buttonRow: {
      flexDirection: "row" as const,
      gap: theme.spacing["3"],
      marginTop: theme.spacing["2"],
    },
    cancelButton: {
      flex: 1,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      paddingVertical: theme.spacing["3"],
      borderRadius: theme.borderRadius.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.card,
    },
    submitButton: {
      flex: 1,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      paddingVertical: theme.spacing["3"],
      borderRadius: theme.borderRadius.sm,
    },
    submitButtonDisabled: {
      opacity: 0.6,
    },
  } satisfies Record<string, ViewStyle | TextStyle>;

  const text = {
    label: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      fontWeight: theme.typography.fontWeight
        .medium as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    fieldError: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.destructive,
    },
    serverErrorText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.destructive,
    },
    selectorText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
    },
    placeholderText: {
      color: theme.colors.mutedForeground,
    },
    chevron: {
      fontSize: 10,
      color: theme.colors.mutedForeground,
    },
    dropdownItemText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
    },
    reminderChipText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
    },
    reminderChipTextActive: {
      fontWeight: theme.typography.fontWeight
        .medium as TextStyle["fontWeight"],
    },
    cancelButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      fontWeight: theme.typography.fontWeight
        .medium as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    submitButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}

export type { EventFormProps };
