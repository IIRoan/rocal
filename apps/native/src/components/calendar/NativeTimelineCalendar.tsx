import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import {
  CalendarBody,
  CalendarContainer,
  CalendarHeader,
  type CalendarKitHandle,
  type DateOrDateTime,
  type DraggingEventProps,
  type EventItem,
  type OnEventResponse,
  type PackedAllDayEvent,
  type PackedEvent,
  type RenderHourProps,
  type WeekdayNumbers,
} from "@howljs/calendar-kit";
import type { DecoratedCalendarEvent } from "@workspace/calendar-core";
import { isCancelledCalendarEvent, resolveTimezone } from "@workspace/calendar-core";
import { useTheme } from "../../providers/ThemeProvider";
import { resolveEventBlockColor } from "../../lib/calendar-color-utils";
import {
  KIT_DRAG_STEP_MINUTES,
  KIT_HOUR_HEIGHT,
  KIT_INITIAL_HOUR,
  KIT_NUMBER_OF_DAYS,
  kitBackgroundToCreateSlot,
  kitDropToEventMove,
  kitDropToVisibleDate,
  kitScrollByDay,
  parseKitVisibleDate,
  shouldCommitDragVisibleDate,
  shouldSyncTimelineDate,
  fromKitPageDate,
  toKitEvent,
  toKitFirstDay,
  toKitHourFormat,
  toKitHourWidth,
  toKitInitialDate,
  toKitPageDate,
  type KitCreateSlot,
  type KitEventMove,
  type TimelineKitView,
} from "./calendar-kit-adapter";
import { toKitTheme } from "./calendar-kit-theme";
import { TimelineDraggingEvent } from "./TimelineDraggingEvent";
import { TimelineEventContent } from "./TimelineEventContent";
import {
  resolveTimelineEventDensity,
  timelineEventTitleLines,
} from "./timeline-event-content";

export type NativeTimelineCalendarHandle = {
  goToDate: (date: Date, options?: { animated?: boolean; hourScroll?: boolean }) => void;
  goToNextPage: (animated?: boolean) => void;
  goToPrevPage: (animated?: boolean) => void;
};

interface NativeTimelineCalendarProps {
  view: TimelineKitView;
  selectedDate: Date;
  events: DecoratedCalendarEvent[];
  timezone: string;
  weekStartDay: number;
  timeFormat?: "12h" | "24h";
  swipeEnabled?: boolean;
  isLoading?: boolean;
  onEventPress: (eventId: string) => void;
  onTimeSlotPress: (slot: KitCreateSlot) => void;
  onDateChange: (date: Date, committed: boolean) => void;
  onEventMove: (move: KitEventMove) => void | Promise<void>;
}

export const NativeTimelineCalendar = forwardRef<
  NativeTimelineCalendarHandle,
  NativeTimelineCalendarProps
>(function NativeTimelineCalendar(
  {
    view,
    selectedDate,
    events,
    timezone,
    weekStartDay,
    timeFormat = "12h",
    swipeEnabled = true,
    isLoading = false,
    onEventPress,
    onTimeSlotPress,
    onDateChange,
    onEventMove,
  },
  ref,
) {
  const { theme } = useTheme();
  const calendarRef = useRef<CalendarKitHandle>(null);
  const isDraggingRef = useRef(false);
  const dragOriginalRef = useRef<DecoratedCalendarEvent | null>(null);
  const resolvedTimezone = resolveTimezone(timezone);
  const kitTheme = useMemo(() => toKitTheme(theme), [theme]);
  const initialDate = toKitInitialDate(toKitPageDate(view, selectedDate));
  const lastDateKeyRef = useRef(initialDate);

  const kitEvents = useMemo<EventItem[]>(
    () =>
      events.map((event) => {
        const colors = resolveEventBlockColor(event.color, theme);
        return toKitEvent(event, resolvedTimezone, {
          color: colors.bg,
          titleColor: colors.fg,
        });
      }),
    [events, resolvedTimezone, theme],
  );

  const eventsById = useMemo(() => {
    const map = new Map<string, DecoratedCalendarEvent>();
    for (const event of events) {
      map.set(event.id, event);
    }
    return map;
  }, [events]);

  const emitDate = useCallback(
    (value: string, committed: boolean) => {
      if (!shouldSyncTimelineDate(isDraggingRef.current)) {
        return;
      }

      const kitDate = parseKitVisibleDate(value, resolvedTimezone);
      const key = toKitInitialDate(kitDate);
      if (committed) {
        lastDateKeyRef.current = key;
      }
      onDateChange(fromKitPageDate(view, kitDate), committed);
    },
    [onDateChange, resolvedTimezone, view],
  );

  const handleChange = useCallback(
    (value: string) => {
      emitDate(value, false);
    },
    [emitDate],
  );

  const handleDateChanged = useCallback(
    (value: string) => {
      emitDate(value, true);
    },
    [emitDate],
  );

  const handlePressEvent = useCallback(
    (event: { id: string }) => {
      onEventPress(event.id);
    },
    [onEventPress],
  );

  const handlePressBackground = useCallback(
    (slot: DateOrDateTime) => {
      onTimeSlotPress(kitBackgroundToCreateSlot(slot, resolvedTimezone));
    },
    [onTimeSlotPress, resolvedTimezone],
  );

  const handlePressDayNumber = useCallback(
    (date: string) => {
      if (!shouldSyncTimelineDate(isDraggingRef.current)) {
        return;
      }

      const center = parseKitVisibleDate(date, resolvedTimezone);
      onDateChange(center, true);
    },
    [onDateChange, resolvedTimezone],
  );

  const handleDragEventStart = useCallback(
    (event: { id: string }) => {
      isDraggingRef.current = true;
      dragOriginalRef.current = eventsById.get(event.id) ?? null;
    },
    [eventsById],
  );

  const handleDragEventEnd = useCallback(
    async (dropped: OnEventResponse) => {
      const original =
        eventsById.get(dropped.id) ?? dragOriginalRef.current ?? undefined;
      isDraggingRef.current = false;
      dragOriginalRef.current = null;

      const move = kitDropToEventMove(dropped, original);
      if (move) {
        await onEventMove(move);
      }

      const destination = kitDropToVisibleDate(dropped, resolvedTimezone);
      if (
        destination &&
        shouldCommitDragVisibleDate(
          toKitPageDate(view, destination),
          lastDateKeyRef.current,
        )
      ) {
        onDateChange(destination, true);
      }
    },
    [eventsById, onDateChange, onEventMove, resolvedTimezone, view],
  );

  const renderDraggingEvent = useCallback(
    (props: DraggingEventProps) => <TimelineDraggingEvent {...props} />,
    [],
  );

  const renderEventBlock = useCallback(
    (
      event: PackedEvent | PackedAllDayEvent,
      options: { allDay: boolean },
    ) => {
      const source = eventsById.get(event.id);
      const titleColor = event.titleColor ?? theme.colors.primaryForeground;
      const durationMinutes = event._internal.duration ?? 0;
      const density = resolveTimelineEventDensity({
        durationMinutes,
        allDay: options.allDay,
      });
      const titleLines = timelineEventTitleLines(density, durationMinutes);

      const content = (
        <TimelineEventContent
          title={source?.title ?? event.title ?? ""}
          titleColor={titleColor}
          cancelled={source ? isCancelledCalendarEvent(source) : false}
          density={density}
          titleLines={titleLines}
        />
      );

      if (event.editable !== false) {
        return content;
      }

      return (
        <Pressable
          onPress={() => onEventPress(event.id)}
          onLongPress={() => undefined}
          style={StyleSheet.absoluteFill}
        >
          {content}
        </Pressable>
      );
    },
    [eventsById, onEventPress, theme.colors.primaryForeground],
  );

  const renderEvent = useCallback(
    (event: PackedEvent) => renderEventBlock(event, { allDay: false }),
    [renderEventBlock],
  );

  const renderAllDayEvent = useCallback(
    (event: PackedAllDayEvent) => renderEventBlock(event, { allDay: true }),
    [renderEventBlock],
  );

  const renderHour = useCallback((props: RenderHourProps) => {
    return (
      <Text
        style={[props.style, styles.hourLabel]}
        numberOfLines={1}
        ellipsizeMode="clip"
        allowFontScaling={false}
      >
        {props.hourStr}
      </Text>
    );
  }, []);

  const handleLoad = useCallback(() => {
    calendarRef.current?.goToHour(KIT_INITIAL_HOUR, false);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      goToDate: (date, options) => {
        const key = toKitInitialDate(toKitPageDate(view, date));
        lastDateKeyRef.current = key;
        calendarRef.current?.goToDate({
          date: key,
          animatedDate: options?.animated ?? true,
          hourScroll: false,
          animatedHour: false,
        });
        if (options?.hourScroll) {
          calendarRef.current?.goToHour(
            KIT_INITIAL_HOUR,
            options?.animated ?? true,
          );
        }
      },
      goToNextPage: (animated = true) => {
        calendarRef.current?.goToNextPage(animated);
      },
      goToPrevPage: (animated = true) => {
        calendarRef.current?.goToPrevPage(animated);
      },
    }),
    [view],
  );

  useLayoutEffect(() => {
    if (isDraggingRef.current) {
      return;
    }

    const key = toKitInitialDate(toKitPageDate(view, selectedDate));
    if (key === lastDateKeyRef.current) {
      return;
    }
    lastDateKeyRef.current = key;
    calendarRef.current?.goToDate({
      date: key,
      animatedDate: true,
      hourScroll: false,
    });
  }, [selectedDate, view]);

  return (
    <View style={styles.container}>
      <CalendarContainer
        key={view}
        ref={calendarRef}
        events={kitEvents}
        numberOfDays={KIT_NUMBER_OF_DAYS[view]}
        scrollByDay={kitScrollByDay(view)}
        firstDay={toKitFirstDay(weekStartDay) as WeekdayNumbers}
        timeZone={resolvedTimezone}
        initialDate={initialDate}
        theme={kitTheme}
        hourWidth={toKitHourWidth(timeFormat)}
        start={0}
        end={1440}
        timeInterval={60}
        timeIntervalHeight={KIT_HOUR_HEIGHT}
        initialTimeIntervalHeight={KIT_HOUR_HEIGHT}
        minTimeIntervalHeight={KIT_HOUR_HEIGHT}
        maxTimeIntervalHeight={KIT_HOUR_HEIGHT}
        useAllDayEvent
        showWeekNumber={false}
        allowHorizontalSwipe={swipeEnabled}
        allowPinchToZoom={false}
        allowDragToEdit
        allowDragToCreate={false}
        dragStep={KIT_DRAG_STEP_MINUTES}
        useHaptic
        scrollToNow={false}
        isLoading={isLoading}
        onLoad={handleLoad}
        onChange={handleChange}
        onDateChanged={handleDateChanged}
        onPressEvent={handlePressEvent}
        onPressBackground={handlePressBackground}
        onPressDayNumber={handlePressDayNumber}
        onDragEventStart={handleDragEventStart}
        onDragEventEnd={handleDragEventEnd}
      >
        <CalendarHeader dayBarHeight={52} renderEvent={renderAllDayEvent} />
        <CalendarBody
          hourFormat={toKitHourFormat(timeFormat)}
          renderHour={renderHour}
          showNowIndicator
          renderEvent={renderEvent}
          renderDraggingEvent={renderDraggingEvent}
        />
      </CalendarContainer>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  } satisfies ViewStyle,
  hourLabel: {
    fontSize: 9,
    lineHeight: 11,
    includeFontPadding: false,
  } satisfies TextStyle,
});
