import {
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  type Ref,
} from "react";
import { Keyboard, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import {
  SheetActions,
  SheetPrimaryButton,
  SheetSecondaryButton,
} from "@workspace/native-core/components/sheet";
import {
  REMINDER_MINUTE_OPTIONS,
  findRepeatPreset,
  getRepeatPresets,
  isMailInvitationStagingCalendar,
  resolveTimezone,
  type Calendar,
  type CreateEventRequest,
  type EventCategory,
  type TimeFormat,
} from "@workspace/calendar-core";
import { summarizeRecurrenceRule } from "./event-detail-utils";
import {
  pickerISOStringToUtc,
  pickerISOStringToWallClock,
  validateForm,
} from "./event-form-utils";
import { createEventFormStyles } from "./event-form-styles";
import { eventFormRequest } from "./event-form-options";
import {
  useEventFormFields,
  useEventFormUi,
  type OpenSheet,
} from "./use-event-form-state";
import { useEventFormParticipants } from "./use-event-form-participants";
import { useEventFormDateTime } from "./use-event-form-date-time";
import { EventFormDateTimeRows } from "./EventFormDateTimeRows";
import { EventFormRepeatRows } from "./EventFormRepeatRows";
import { EventFormCalendarRows } from "./EventFormCalendarRows";
import { EventFormNotesFields } from "./EventFormNotesFields";
import { EventFormSheets } from "./EventFormSheets";
import { FieldError } from "./FieldError";
import { EventFormTitleField } from "./EventFormTitleField";
import { EventFormParticipantSection } from "./EventFormParticipantSection";
import { FormErrorList } from "./FormErrorList";

const NO_CATEGORIES: EventCategory[] = [];

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
  categories?: EventCategory[];
  serverErrors?: string[];
  isSubmitting?: boolean;
  onSubmit: (submission: EventFormSubmission) => void;
  onCancel?: () => void;
  actionsPlacement?: "footer" | "external";
}

export interface EventFormHandle {
  submit: () => void;
}

export function EventForm({
  ref,
  initialValues,
  initialReminders,
  timezone,
  timeFormat,
  calendars,
  categories = NO_CATEGORIES,
  serverErrors,
  isSubmitting = false,
  onSubmit,
  onCancel,
  actionsPlacement = "footer",
}: EventFormProps & { ref?: Ref<EventFormHandle> }) {
  const { theme } = useTheme();
  const resolvedTimezone = resolveTimezone(initialValues?.timezone ?? timezone);
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createEventFormStyles(theme), [theme]);
  const scrollRef = useRef<ScrollView>(null);

  const [fields, updateFields] = useEventFormFields({
    initialValues,
    initialReminders,
    timezone: resolvedTimezone,
  });
  const [ui, updateUi] = useEventFormUi();
  const { allDay, start, end, categoryId, recurrenceRule, reminders } = fields;

  const startWallClock = useMemo(
    () => pickerISOStringToWallClock(start),
    [start],
  );
  const endWallClock = useMemo(() => pickerISOStringToWallClock(end), [end]);
  const endBeforeStart = allDay
    ? end.slice(0, 10) < start.slice(0, 10)
    : pickerISOStringToUtc(end, resolvedTimezone) <=
      pickerISOStringToUtc(start, resolvedTimezone);
  const selectableCalendars = useMemo(
    () =>
      calendars.filter(
        (calendar) =>
          !calendar.isSyncOnly && !isMailInvitationStagingCalendar(calendar),
      ),
    [calendars],
  );
  // Calendars can arrive after the form opens, so the default is derived instead of stored.
  const calendarId =
    fields.pickedCalendarId || (selectableCalendars[0]?.id ?? "");
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

  const handleInputFocus = useCallback((input: TextInput | null) => {
    if (!input || !scrollRef.current) return;
    const scrollNativeRef = scrollRef.current.getNativeScrollRef();
    if (!scrollNativeRef) return;
    input.measureLayout(
      scrollNativeRef,
      (_x: number, y: number) => {
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 80), animated: true });
      },
      () => undefined,
    );
  }, []);

  const openPicker = (open: () => void) => {
    Keyboard.dismiss();
    open();
  };
  const openSheet = (sheet: OpenSheet) =>
    openPicker(() => updateUi({ openSheet: sheet }));
  const dateTime = useEventFormDateTime({
    start,
    end,
    allDay,
    timezone: resolvedTimezone,
    updateFields,
    updateUi,
  });
  const participants = useEventFormParticipants(
    fields.participants,
    updateFields,
    updateUi,
  );

  const handleSubmit = useCallback(() => {
    Keyboard.dismiss();
    const request = eventFormRequest(fields, {
      calendarId,
      color: initialValues?.color ?? undefined,
      initialCategoryId: initialValues?.categoryId || undefined,
      timezone: resolvedTimezone,
    });
    const { fieldErrors, generalErrors } = validateForm(request);
    updateUi({ fieldErrors, generalErrors });
    if (Object.keys(fieldErrors).length > 0 || generalErrors.length > 0) return;
    onSubmit({ request, reminders: fields.reminders });
  }, [fields, calendarId, initialValues, resolvedTimezone, onSubmit, updateUi]);

  useImperativeHandle(ref, () => ({ submit: handleSubmit }), [handleSubmit]);

  const selectedCategory = categories.find(
    (category) => category.id === categoryId,
  );

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
            <FormErrorList errors={serverErrors} styles={styles} />
            <FormErrorList errors={ui.generalErrors} styles={styles} />

            <EventFormTitleField
              title={fields.title}
              error={ui.fieldErrors.title}
              styles={styles}
              onChange={(title) => updateFields({ title })}
              onFieldFocus={handleInputFocus}
            />

            <EventFormDateTimeRows
              startWallClock={startWallClock}
              endWallClock={endWallClock}
              allDay={allDay}
              endBeforeStart={endBeforeStart}
              timeFormat={timeFormat}
              styles={styles}
              onOpen={(target) =>
                openPicker(() =>
                  updateUi({
                    dateTimeTarget: target,
                    dateTimePickerOpen: true,
                  }),
                )
              }
            />
            <FieldError
              message={ui.fieldErrors.end}
              style={styles.fieldError}
            />

            <EventFormRepeatRows
              allDay={allDay}
              repeatLabel={
                !recurrenceRule
                  ? "Does not repeat"
                  : (activePreset?.label ??
                    summarizeRecurrenceRule(recurrenceRule))
              }
              recurrenceRule={recurrenceRule}
              showCustomRepeat={
                recurrenceRule !== null &&
                (ui.customRepeatOpen || activePreset === null)
              }
              // Times are kept while all-day is on so switching it off restores them; all-day saves only the dates.
              onToggleAllDay={() =>
                openPicker(() =>
                  updateFields((current) => ({ allDay: !current.allDay })),
                )
              }
              onOpenRepeat={() => openSheet("repeat")}
              onRuleChange={(rule) => updateFields({ recurrenceRule: rule })}
            />

            <View style={styles.divider} />

            <EventFormParticipantSection
              participants={participants.sortedParticipants}
              error={ui.fieldErrors.participants}
              styles={styles}
              onAdd={() => openSheet("participants")}
              onRemove={participants.removeParticipant}
            />

            <View style={styles.divider} />

            <EventFormCalendarRows
              selectedCalendar={selectedCalendar}
              swatchColor={
                selectedCalendar
                  ? calendarSwatch(selectedCalendar)
                  : theme.colors.mutedForeground
              }
              calendarError={ui.fieldErrors.calendarId}
              showCategory={categories.length > 0 || !!categoryId}
              categoryLabel={
                !categoryId
                  ? "No category"
                  : (selectedCategory?.name ?? "Category")
              }
              hasCategory={!!categoryId}
              reminders={reminders}
              canAddReminder={REMINDER_MINUTE_OPTIONS.some(
                (minutes) => !reminders.includes(minutes),
              )}
              styles={styles}
              onOpenCalendar={() => openSheet("calendar")}
              onOpenCategory={() => openSheet("category")}
              onOpenReminder={(index) =>
                openPicker(() =>
                  updateUi({ reminderEditIndex: index, openSheet: "reminder" }),
                )
              }
              onRemoveReminder={(minutes) =>
                updateFields((current) => ({
                  reminders: current.reminders.filter(
                    (value) => value !== minutes,
                  ),
                }))
              }
            />

            <View style={styles.divider} />

            <EventFormNotesFields
              location={fields.location}
              description={fields.description}
              locationError={ui.fieldErrors.location}
              descriptionError={ui.fieldErrors.description}
              styles={styles}
              onChangeLocation={(location) => updateFields({ location })}
              onChangeDescription={(description) =>
                updateFields({ description })
              }
              onFieldFocus={handleInputFocus}
            />
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

      <EventFormSheets
        ui={ui}
        dateTime={dateTime}
        participants={participants}
        startWallClock={startWallClock}
        endWallClock={endWallClock}
        timeFormat={timeFormat}
        styles={styles}
        bottomInset={insets.bottom}
        calendars={selectableCalendars}
        calendarId={calendarId}
        calendarSwatch={calendarSwatch}
        categories={categories}
        categoryId={categoryId}
        repeatPresets={repeatPresets}
        recurrenceRule={recurrenceRule}
        activePresetKey={activePreset?.key}
        startWeekday={startWallClock.getDay()}
        reminders={reminders}
        updateFields={updateFields}
        updateUi={updateUi}
      />
    </>
  );
}
