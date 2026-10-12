import { Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  formatReminderShort,
  hasOptionalEventParticipants,
  isCancelledCalendarEvent,
  type CalendarEvent,
  type TimeFormat,
} from "@workspace/calendar-core";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { BottomSheetScrollView } from "@workspace/native-core/components/BottomSheet";
import { BlobatarAvatar } from "@workspace/native-core/components/BlobatarAvatar";
import { resolveCalendarSwatchColor } from "../../lib/calendar-color-utils";
import { EncryptionStatusIcon } from "../calendar/EncryptionStatusIcon";
import { EventEditorRow } from "./EventEditorPrimitives";
import { FormErrorList } from "./FormErrorList";
import { formatEventDate, formatEventTime } from "./event-detail-utils";
import type { EventSheetStyles } from "./event-sheet-styles";

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

export function EventDetailsView({
  event,
  styles,
  resolvedTimezone,
  timeFormat,
  recurrenceLabel,
  calendarInfo,
  calendarSwatch,
  categoryInfo,
  eventReminders,
  serverErrors,
}: {
  event: CalendarEvent;
  styles: EventSheetStyles;
  resolvedTimezone: string;
  timeFormat: TimeFormat;
  recurrenceLabel: string | null;
  calendarInfo: { name: string } | null;
  calendarSwatch: string;
  categoryInfo: { name: string; color: string } | null;
  eventReminders: number[];
  serverErrors: string[];
}) {
  const { theme } = useTheme();
  return (
    <BottomSheetScrollView
      style={styles.viewScroll}
      contentContainerStyle={styles.viewBody}
      showsVerticalScrollIndicator={false}
      bounces={false}
      overScrollMode="never"
    >
      {isCancelledCalendarEvent(event) ? (
        <View style={styles.cancelledBanner}>
          <Feather
            name="alert-triangle"
            size={16}
            color={theme.colors.destructive}
          />
          <View style={styles.viewRowContent}>
            <Text style={styles.cancelledTitle}>Cancelled event</Text>
            <Text style={styles.viewSubtext}>
              The organiser cancelled this event. It stays on your calendar
              until you remove it.
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.viewTitleRow}>
        <Text
          style={[
            styles.viewEventTitle,
            isCancelledCalendarEvent(event) && styles.viewEventTitleCancelled,
          ]}
        >
          {event.title || "Untitled event"}
        </Text>
        <View style={styles.titleIcon}>
          <EncryptionStatusIcon
            item={event}
            color={theme.colors.mutedForeground}
            size={16}
          />
        </View>
      </View>
      {event.isSynced ? (
        <Text style={styles.viewSyncedHint}>
          Synced from an external calendar (view only)
        </Text>
      ) : null}

      <View style={styles.viewRows}>
        <EventEditorRow icon="clock" label="Date and time">
          <View style={styles.viewRowText}>
            <Text style={styles.viewText}>
              {formatEventDate(event, resolvedTimezone)}
            </Text>
            <Text style={styles.viewSubtext}>
              {formatEventTime(event, resolvedTimezone, timeFormat)}
              {recurrenceLabel ? ` · ${recurrenceLabel}` : ""}
            </Text>
          </View>
        </EventEditorRow>

        {calendarInfo ? (
          <EventEditorRow icon="calendar" label="Calendar">
            <View style={styles.viewInlineRow}>
              <View
                style={[
                  styles.calendarDot,
                  { backgroundColor: calendarSwatch },
                ]}
              />
              <Text style={styles.viewText} numberOfLines={1}>
                {calendarInfo.name}
              </Text>
            </View>
          </EventEditorRow>
        ) : null}

        {categoryInfo ? (
          <EventEditorRow icon="tag" label="Category">
            <View style={styles.viewInlineRow}>
              <View
                style={[
                  styles.calendarDot,
                  {
                    backgroundColor: resolveCalendarSwatchColor(
                      categoryInfo.color,
                      theme,
                    ),
                  },
                ]}
              />
              <Text style={styles.viewText} numberOfLines={1}>
                {categoryInfo.name}
              </Text>
            </View>
          </EventEditorRow>
        ) : null}

        {hasOptionalEventParticipants(event.participants) ? (
          <EventEditorRow icon="users" label="Participants">
            <View style={styles.viewInlineRow}>
              <Text style={styles.viewMutedText}>
                {event.participants?.length ?? 0}{" "}
                {event.participants?.length === 1
                  ? "participant"
                  : "participants"}
              </Text>
            </View>
            <View style={styles.participantList}>
              {(event.participants ?? []).map((participant) => (
                <View key={participant.id} style={styles.participantRow}>
                  <BlobatarAvatar
                    email={participant.email}
                    name={participant.displayName}
                    src={participant.image}
                    size={28}
                  />
                  <View style={styles.participantMeta}>
                    <Text style={styles.viewText} numberOfLines={1}>
                      {participant.displayName || participant.email}
                    </Text>
                    <Text style={styles.viewSubtext} numberOfLines={1}>
                      {participant.role === "organizer"
                        ? "Organizer"
                        : formatParticipantStatus(participant.status)}
                      {participant.displayName ? ` · ${participant.email}` : ""}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </EventEditorRow>
        ) : null}

        {event.location ? (
          <EventEditorRow icon="map-pin" label="Location">
            <Text style={[styles.viewText, styles.viewRowText]}>
              {event.location}
            </Text>
          </EventEditorRow>
        ) : null}

        {eventReminders.length > 0 ? (
          <EventEditorRow icon="bell" label="Reminders">
            <Text style={[styles.viewText, styles.viewRowText]}>
              {eventReminders
                .map((minutes) => `${formatReminderShort(minutes)} before`)
                .join(", ")}
            </Text>
          </EventEditorRow>
        ) : null}

        {event.description ? (
          <EventEditorRow icon="align-left" label="Description">
            <Text style={[styles.viewDescription, styles.viewRowText]}>
              {event.description}
            </Text>
          </EventEditorRow>
        ) : null}
      </View>

      <FormErrorList errors={serverErrors} styles={styles} />
    </BottomSheetScrollView>
  );
}
