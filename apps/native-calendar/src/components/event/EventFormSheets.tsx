import {
  normalizeReminderMinutes,
  type Calendar,
  type EventCategory,
  type RecurrenceRule,
  type RepeatPreset,
  type TimeFormat,
} from "@workspace/calendar-core";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { OptionSheet } from "./OptionSheet";
import { ParticipantPickerSheet } from "./ParticipantPickerSheet";
import { EventFormDateTimeSheet } from "./EventFormDateTimeSheet";
import type { EventFormStyles } from "./event-form-styles";
import type { useEventFormDateTime } from "./use-event-form-date-time";
import type { useEventFormParticipants } from "./use-event-form-participants";
import {
  calendarOptionItems,
  categoryOptionItems,
  reminderOptionItems,
  repeatOptionItems,
} from "./event-form-options";
import type {
  EventFormUi,
  UpdateFields,
  UpdateUi,
} from "./use-event-form-state";

export function EventFormSheets({
  ui,
  dateTime,
  participants,
  startWallClock,
  endWallClock,
  timeFormat,
  styles,
  bottomInset,
  calendars,
  calendarId,
  calendarSwatch,
  categories,
  categoryId,
  repeatPresets,
  recurrenceRule,
  activePresetKey,
  startWeekday,
  reminders,
  updateFields,
  updateUi,
}: {
  ui: EventFormUi;
  dateTime: ReturnType<typeof useEventFormDateTime>;
  participants: ReturnType<typeof useEventFormParticipants>;
  startWallClock: Date;
  endWallClock: Date;
  timeFormat: TimeFormat;
  styles: EventFormStyles;
  bottomInset: number;
  calendars: Calendar[];
  calendarId: string;
  calendarSwatch: (calendar: Calendar) => string;
  categories: EventCategory[];
  categoryId: string;
  repeatPresets: RepeatPreset[];
  recurrenceRule: RecurrenceRule | null;
  activePresetKey?: string;
  startWeekday: number;
  reminders: number[];
  updateFields: UpdateFields;
  updateUi: UpdateUi;
}) {
  const { theme } = useTheme();
  const { openSheet } = ui;
  const editedReminder =
    ui.reminderEditIndex === null ? undefined : reminders[ui.reminderEditIndex];
  const close = () => updateUi({ openSheet: null });
  const pickAndClose = (patch: Parameters<UpdateFields>[0]) => {
    updateFields(patch);
    close();
  };

  return (
    <>
      <EventFormDateTimeSheet
        visible={ui.dateTimePickerOpen}
        target={ui.dateTimeTarget}
        startWallClock={startWallClock}
        endWallClock={endWallClock}
        timeFormat={timeFormat}
        bottomInset={bottomInset}
        styles={styles}
        onClose={() => updateUi({ dateTimePickerOpen: false })}
        onStartDate={dateTime.handleStartDateSelect}
        onEndDate={dateTime.handleEndDateSelect}
        onStartTime={dateTime.handleStartTimeChange}
        onEndTime={dateTime.handleEndTimeChange}
      />
      <ParticipantPickerSheet
        visible={openSheet === "participants"}
        onClose={close}
        participants={participants.sortedParticipants}
        onInvite={participants.inviteParticipant}
        onRemove={participants.removeParticipant}
        error={ui.fieldErrors.participants}
        onClearError={participants.clearParticipantError}
        bottomInset={bottomInset}
      />
      <OptionSheet
        visible={openSheet === "calendar"}
        onClose={close}
        title="Calendar"
        items={calendarOptionItems(
          calendars,
          calendarId,
          calendarSwatch,
          (id) => pickAndClose({ pickedCalendarId: id }),
        )}
        theme={theme}
        bottomInset={bottomInset}
      />
      <OptionSheet
        visible={openSheet === "category"}
        onClose={close}
        title="Category"
        items={categoryOptionItems(categories, categoryId, theme, (id) =>
          pickAndClose({ categoryId: id }),
        )}
        theme={theme}
        bottomInset={bottomInset}
      />
      <OptionSheet
        visible={openSheet === "repeat"}
        onClose={close}
        title="Repeat"
        items={repeatOptionItems({
          presets: repeatPresets,
          rule: recurrenceRule,
          activePresetKey,
          startWeekday,
          onPick: (rule, custom) => {
            updateUi({ customRepeatOpen: custom });
            pickAndClose({ recurrenceRule: rule });
          },
        })}
        theme={theme}
        bottomInset={bottomInset}
      />
      <OptionSheet
        visible={openSheet === "reminder"}
        onClose={close}
        title={editedReminder === undefined ? "Add reminder" : "Reminder"}
        items={reminderOptionItems(reminders, editedReminder, (minutes) =>
          pickAndClose((current) => ({
            reminders: normalizeReminderMinutes(
              editedReminder === undefined
                ? [...current.reminders, minutes]
                : current.reminders.map((value) =>
                    value === editedReminder ? minutes : value,
                  ),
            ),
          })),
        )}
        theme={theme}
        bottomInset={bottomInset}
      />
    </>
  );
}
