import React, { useMemo } from "react";
import { getErrorMessage, type Calendar } from "@workspace/calendar-core";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { useToggleCalendarVisibility } from "../../hooks/use-toggle-calendar-visibility";
import { useCalendarSubscriptions, useCalendars } from "../../hooks/use-calendar-management";
import { useSheetPageNavigator } from "@workspace/native-core/components/sheet/SheetPageStack";
import {
  SheetCenteredState,
  SheetGroup,
  SheetItem,
  SheetScroll,
  SheetSection,
  SheetSwatch,
} from "@workspace/native-core/components/sheet/SheetSections";
import {
  CALENDAR_CREATE_PAGE,
  SUBSCRIPTION_CREATE_PAGE,
  calendarEditPage,
  subscriptionEditPage,
} from "../../lib/calendars-sheet-pages";
import {
  buildCalendarsSheetModel,
  ownedCalendarDetail,
  readOnlyCalendarDetail,
  type ReadOnlyCalendarEntry,
} from "../../lib/calendars-sheet-model";
import { resolveCalendarSwatchColor } from "../../lib/calendar-color-utils";
import { CalendarVisibilityCheck } from "./CalendarVisibilityCheck";

/** Calendars drawer root: owned, holiday, and subscribed calendars with visibility checkboxes. */
export function CalendarsListPage() {
  const { push } = useSheetPageNavigator();
  const calendarsQuery = useCalendars();
  const subscriptionsQuery = useCalendarSubscriptions();
  const { toggle, pendingCalendarId } = useToggleCalendarVisibility();

  const model = useMemo(
    () => buildCalendarsSheetModel(calendarsQuery.data ?? [], subscriptionsQuery.data ?? []),
    [calendarsQuery.data, subscriptionsQuery.data],
  );

  if (calendarsQuery.isLoading) {
    return <SheetCenteredState loading message="Loading calendars…" />;
  }

  if (calendarsQuery.isError) {
    return (
      <SheetCenteredState
        tone="destructive"
        message={getErrorMessage(calendarsQuery.error, "Failed to load calendars")}
      />
    );
  }

  const renderReadOnly = (entry: ReadOnlyCalendarEntry) => (
    <ReadOnlyCalendarRow
      key={entry.subscription.id}
      entry={entry}
      pending={pendingCalendarId === entry.subscription.calendar.id}
      onToggle={toggle}
      onOpen={() => push(subscriptionEditPage(entry.subscription.id))}
    />
  );

  return (
    <SheetScroll>
      <SheetSection title="My calendars">
        <SheetGroup>
          {model.owned.map((calendar) => (
            <SheetItem
              key={calendar.id}
              label={calendar.name}
              detail={ownedCalendarDetail(calendar)}
              leading={
                <CalendarVisibilityCheck
                  color={calendar.color}
                  visible={calendar.isVisible}
                  pending={pendingCalendarId === calendar.id}
                  calendarName={calendar.name}
                  onToggle={() => toggle(calendar)}
                />
              }
              chevron
              onPress={() => push(calendarEditPage(calendar.id))}
            />
          ))}
          <SheetItem
            key="new-calendar"
            label="New calendar"
            icon="plus"
            tone="accent"
            onPress={() => push(CALENDAR_CREATE_PAGE)}
          />
        </SheetGroup>
      </SheetSection>

      {model.holidays.length > 0 ? (
        <SheetSection title="Holidays">
          <SheetGroup>{model.holidays.map(renderReadOnly)}</SheetGroup>
        </SheetSection>
      ) : null}

      {model.feeds.length > 0 ? (
        <SheetSection title="Subscribed">
          <SheetGroup>{model.feeds.map(renderReadOnly)}</SheetGroup>
        </SheetSection>
      ) : null}

      <SheetSection footer="Subscribe to a feed, import an .ics file, or add public holidays.">
        <SheetGroup>
          <SheetItem
            label="Add read-only calendar"
            icon="rss"
            chevron
            onPress={() => push(SUBSCRIPTION_CREATE_PAGE)}
          />
        </SheetGroup>
      </SheetSection>
    </SheetScroll>
  );
}

function ReadOnlyCalendarRow({
  entry,
  pending,
  onToggle,
  onOpen,
}: {
  entry: ReadOnlyCalendarEntry;
  pending: boolean;
  onToggle: (calendar: Calendar) => void;
  onOpen: () => void;
}) {
  const { theme } = useTheme();
  const { calendar, subscription } = entry;
  return (
    <SheetItem
      label={subscription.calendar.name}
      detail={readOnlyCalendarDetail(entry)}
      detailTone={subscription.lastErrorMessage ? "destructive" : "muted"}
      leading={
        calendar ? (
          <CalendarVisibilityCheck
            color={calendar.color}
            visible={calendar.isVisible}
            pending={pending}
            calendarName={subscription.calendar.name}
            onToggle={() => onToggle(calendar)}
          />
        ) : (
          <SheetSwatch color={resolveCalendarSwatchColor(subscription.calendar.color, theme)} />
        )
      }
      chevron
      onPress={onOpen}
    />
  );
}
