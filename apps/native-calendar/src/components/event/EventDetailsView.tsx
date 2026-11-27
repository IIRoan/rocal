import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  EVENT_CONTENT_UNAVAILABLE_MESSAGE,
  findEventCallLink,
  formatReminderShort,
  getEventLinkLabel,
  getEventLocationMapQuery,
  hasOptionalEventParticipants,
  isCancelledCalendarEvent,
  splitEventDescription,
  type CalendarEvent,
  type EventTextRun,
  type TimeFormat,
} from "@workspace/calendar-core";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { BottomSheetScrollView } from "@workspace/native-core/components/BottomSheet";
import { BlobatarAvatar } from "@workspace/native-core/components/BlobatarAvatar";
import { openExternalLink } from "@workspace/native-core/lib/open-external-link";
import { resolveCalendarSwatchColor } from "../../lib/calendar-color-utils";
import { EncryptionStatusIcon } from "../calendar/EncryptionStatusIcon";
import { EventEditorRow } from "./EventEditorPrimitives";
import { FormErrorList } from "./FormErrorList";
import { formatEventDate, formatEventTime } from "./event-detail-utils";
import type { EventSheetStyles } from "./event-sheet-styles";

function renderRuns(runs: EventTextRun[], linkStyle: EventSheetStyles["viewLink"]): ReactNode[] {
  const parts: ReactNode[] = [];
  // Runs only grow the offset, so it keys each link uniquely within its line.
  let offset = 0;
  for (const run of runs) {
    if (run.kind === "text") {
      parts.push(run.text);
      offset += run.text.length;
      continue;
    }
    const label = run.label ?? getEventLinkLabel(run.url);
    parts.push(
      <Text
        key={offset}
        style={linkStyle}
        onPress={() => openExternalLink(run.url)}
        accessibilityRole="link"
        accessibilityHint={`Opens ${getEventLinkLabel(run.url)}`}
      >
        {label}
      </Text>,
    );
    offset += run.url.length;
  }
  return parts;
}

function EventDescriptionText({
  description,
  styles,
}: {
  description: string;
  styles: EventSheetStyles;
}) {
  return (
    <Text style={[styles.viewDescription, styles.viewRowText]}>
      {splitEventDescription(description).map(({ key, runs }, index) => (
        <Text key={key}>
          {index > 0 ? "\n" : ""}
          {renderRuns(runs, styles.viewLink)}
        </Text>
      ))}
    </Text>
  );
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
  const cancelled = isCancelledCalendarEvent(event);
  const callLink = cancelled ? null : findEventCallLink(event);
  const mapQuery = getEventLocationMapQuery(event.location);
  return (
    <BottomSheetScrollView
      style={styles.viewScroll}
      contentContainerStyle={styles.viewBody}
      showsVerticalScrollIndicator={false}
      bounces={false}
      overScrollMode="never"
    >
      {cancelled ? (
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
          testID="event-details-title"
          style={[
            styles.viewEventTitle,
            cancelled && styles.viewEventTitleCancelled,
          ]}
        >
          {event.title || "Untitled event"}
        </Text>
        <EncryptionStatusIcon
          item={event}
          color={theme.colors.mutedForeground}
          size={16}
        />
      </View>
      {event.isSynced ? (
        <Text style={styles.viewSyncedHint}>
          Synced from an external calendar (view only)
        </Text>
      ) : null}
      {event.contentUnavailable ? (
        <Text style={styles.viewSyncedHint}>{EVENT_CONTENT_UNAVAILABLE_MESSAGE}</Text>
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

        {callLink ? (
          <EventEditorRow icon="video" label="Video call">
            <View style={styles.viewInlineRow}>
              <Pressable
                onPress={() => openExternalLink(callLink)}
                hitSlop={4}
                style={({ pressed }) => [
                  styles.joinButton,
                  pressed && styles.rsvpButtonPressed,
                ]}
                accessibilityRole="link"
                accessibilityLabel={`Join video call on ${getEventLinkLabel(callLink)}`}
              >
                <Feather
                  name="video"
                  size={16}
                  color={theme.colors.primaryForeground}
                />
                <Text style={styles.joinButtonText}>Join</Text>
              </Pressable>
              <Text style={[styles.viewMutedText, styles.viewRowContent]} numberOfLines={1}>
                {getEventLinkLabel(callLink)}
              </Text>
            </View>
          </EventEditorRow>
        ) : null}

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
            <View style={styles.viewRowText}>
              <Text style={styles.viewText}>{event.location}</Text>
              {mapQuery ? (
                <Pressable
                  onPress={() =>
                    openExternalLink(
                      `https://maps.apple.com/?q=${encodeURIComponent(mapQuery)}`,
                    )
                  }
                  hitSlop={10}
                  style={({ pressed }) => [
                    styles.mapLink,
                    pressed && styles.rsvpButtonPressed,
                  ]}
                  accessibilityRole="link"
                  accessibilityLabel="Open location in Maps"
                >
                  <Text style={styles.viewLink}>Open in Maps</Text>
                </Pressable>
              ) : null}
            </View>
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
            <EventDescriptionText
              description={event.description}
              styles={styles}
            />
          </EventEditorRow>
        ) : null}
      </View>

      <FormErrorList errors={serverErrors} styles={styles} />
    </BottomSheetScrollView>
  );
}
