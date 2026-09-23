import React, { useCallback, useMemo } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { resolveTimezone } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import type { NativeCalendarView } from "../../lib/calendar-views";
import { useAuth } from "../../providers/AuthProvider";
import { useCalendarView } from "../../providers/CalendarViewProvider";
import { useTheme } from "../../providers/ThemeProvider";
import { calendarApiService } from "../../lib/api";
import { QUERY_KEYS } from "../../lib/query-keys";
import { useDeferredSheetAction } from "../../hooks/use-deferred-sheet-action";
import { BottomSheet } from "../BottomSheet";
import { SidebarMiniCalendar } from "../SidebarMiniCalendar";
import { SheetButton, SheetScroll } from "../sheet/SheetSections";
import { CalendarViewToggle } from "./CalendarViewToggle";

interface CalendarDrawerSheetProps {
  visible: boolean;
  onDismiss: () => void;
  onTodayPress: () => void;
}

/** Calendar drawer: mini month, view picker, and a jump to today. */
export function CalendarDrawerSheet({
  visible,
  onDismiss,
  onTodayPress,
}: CalendarDrawerSheetProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { isAuthenticated } = useAuth();
  const { activeView, selectedDate, setActiveView, setCurrentDate, setSelectedDate } =
    useCalendarView();
  const { runAfterClose, onCloseComplete } = useDeferredSheetAction(onDismiss);

  const { data: settings } = useQuery({
    queryKey: QUERY_KEYS.settings(),
    queryFn: () => calendarApiService.getUserSettings(),
    enabled: isAuthenticated,
  });
  const resolvedTimezone = resolveTimezone(settings?.timezone);

  const handleToday = useCallback(
    () => runAfterClose(onTodayPress),
    [onTodayPress, runAfterClose],
  );

  const handleDayPress = useCallback(
    (date: Date) => {
      setCurrentDate(date);
      setSelectedDate(date);
      onDismiss();
    },
    [onDismiss, setCurrentDate, setSelectedDate],
  );

  const handleViewChange = useCallback(
    (view: NativeCalendarView) => {
      setActiveView(view);
      onDismiss();
    },
    [onDismiss, setActiveView],
  );

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      onCloseComplete={onCloseComplete}
      snapPoints={[0.72]}
    >
      <SheetScroll>
        <SidebarMiniCalendar
          weekStartDay={settings?.weekStartDay ?? 1}
          selectedDate={selectedDate}
          timezone={resolvedTimezone}
          onDayPress={handleDayPress}
        />

        <View style={styles.controls}>
          <View style={styles.toggle}>
            <CalendarViewToggle activeView={activeView} onViewChange={handleViewChange} />
          </View>
          <SheetButton label="Today" variant="secondary" onPress={handleToday} />
        </View>
      </SheetScroll>
    </BottomSheet>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    controls: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing["2"],
    },
    toggle: {
      flex: 1,
      minWidth: 0,
    },
  } satisfies Record<string, ViewStyle>);
}
