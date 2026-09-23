import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type TextStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { format } from "date-fns";
import type { ThemeTokens } from "@workspace/design-tokens";

const PICKER_SPRING = { damping: 28, stiffness: 280, mass: 0.8 };
const PICKER_CLOSE_DURATION = 180;
const PICKER_DISMISS_DISTANCE = 64;
const PICKER_DISMISS_VELOCITY = 650;

export function PickerSheet({
  visible,
  onClose,
  title,
  theme,
  bottomInset,
  maxHeightRatio,
  avoidKeyboard = false,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  theme: ThemeTokens;
  bottomInset: number;
  maxHeightRatio: number;
  avoidKeyboard?: boolean;
  children: React.ReactNode;
}) {
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const styles = useMemo(() => createModalStyles(theme), [theme]);
  const closeSequenceRef = useRef(0);
  const closeFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const translateY = useSharedValue(height);
  const overlayOpacity = useSharedValue(0);

  const clearCloseFallbackTimer = useCallback(() => {
    if (closeFallbackTimerRef.current !== null) {
      clearTimeout(closeFallbackTimerRef.current);
      closeFallbackTimerRef.current = null;
    }
  }, []);

  const finishUnmount = useCallback(() => {
    clearCloseFallbackTimer();
    setMounted(false);
  }, [clearCloseFallbackTimer]);
  const finishUnmountIfCurrent = useCallback(
    (sequence: number) => {
      if (sequence !== closeSequenceRef.current || visible) {
        return;
      }
      finishUnmount();
    },
    [finishUnmount, visible],
  );
  const requestClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
    }
  }, [visible]);

  useEffect(() => {
    if (visible) {
      clearCloseFallbackTimer();
      closeSequenceRef.current += 1;
      cancelAnimation(translateY);
      cancelAnimation(overlayOpacity);
      translateY.value = height;
      overlayOpacity.value = 0;
      translateY.value = withSpring(0, PICKER_SPRING);
      overlayOpacity.value = withTiming(1, {
        duration: PICKER_CLOSE_DURATION,
      });
    } else {
      const closeSequence = closeSequenceRef.current + 1;
      closeSequenceRef.current = closeSequence;
      clearCloseFallbackTimer();
      cancelAnimation(translateY);
      cancelAnimation(overlayOpacity);
      translateY.value = withTiming(
        height,
        { duration: PICKER_CLOSE_DURATION },
        (finished) => {
          if (finished) {
            scheduleOnRN(finishUnmountIfCurrent, closeSequence);
          }
        },
      );
      overlayOpacity.value = withTiming(0, {
        duration: PICKER_CLOSE_DURATION,
      });
      closeFallbackTimerRef.current = setTimeout(() => {
        finishUnmountIfCurrent(closeSequence);
      }, PICKER_CLOSE_DURATION + 120);
    }

    return clearCloseFallbackTimer;
  }, [
    visible,
    height,
    translateY,
    overlayOpacity,
    clearCloseFallbackTimer,
    finishUnmountIfCurrent,
  ]);

  useEffect(
    () => () => {
      clearCloseFallbackTimer();
    },
    [clearCloseFallbackTimer],
  );

  const panGesture = Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetX([-20, 20])
    .onStart(() => {
      "worklet";
      cancelAnimation(translateY);
    })
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
        scheduleOnRN(requestClose);
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
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior="padding"
        enabled={avoidKeyboard}
      >
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: "rgba(0,0,0,0.42)" },
            overlayStyle,
          ]}
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
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Shared picker sheet chrome styles. */
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
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
      textAlign: "center",
      marginBottom: 10,
      paddingHorizontal: 16,
    },
  });
}

const CALENDAR_DAY_HEADERS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

export function CalendarGrid({
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

  const isSelected = (day: number) =>
    day === selectedDate.getDate() &&
    month === selectedDate.getMonth() &&
    year === selectedDate.getFullYear();

  const isDisabled = (day: number) => {
    if (!minDate) return false;
    const d = new Date(year, month, day);
    const min = new Date(
      minDate.getFullYear(),
      minDate.getMonth(),
      minDate.getDate(),
    );
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
          <Feather
            name="chevron-left"
            size={18}
            color={theme.colors.foreground}
          />
        </Pressable>
        <Text
          style={{
            fontSize: theme.typography.fontSize.sm.size,
            fontWeight: theme.typography.fontWeight
              .semibold as TextStyle["fontWeight"],
            color: theme.colors.foreground,
          }}
        >
          {monthLabel}
        </Text>
        <Pressable onPress={nextMonth} hitSlop={12} style={{ padding: 8 }}>
          <Feather
            name="chevron-right"
            size={18}
            color={theme.colors.foreground}
          />
        </Pressable>
      </View>

      <View style={{ flexDirection: "row" }}>
        {CALENDAR_DAY_HEADERS.map((d) => (
          <View
            key={d}
            style={{ flex: 1, alignItems: "center", paddingVertical: 4 }}
          >
            <Text
              style={{
                fontSize: theme.typography.fontSize.xs.size,
                color: theme.colors.mutedForeground,
                fontWeight: theme.typography.fontWeight
                  .medium as TextStyle["fontWeight"],
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
            if (day === null)
              return <View key={`empty-${di}`} style={{ flex: 1 }} />;
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
                  backgroundColor: selected
                    ? theme.colors.primaryBase
                    : "transparent",
                  opacity: disabled ? 0.3 : 1,
                }}
                onPress={() => {
                  if (!disabled) onSelect(new Date(year, month, day));
                }}
                disabled={disabled}
              >
                <Text
                  style={{
                    fontSize: theme.typography.fontSize.sm.size,
                    fontWeight:
                      selected || todayDay
                        ? (theme.typography.fontWeight
                            .semibold as TextStyle["fontWeight"])
                        : (theme.typography.fontWeight
                            .normal as TextStyle["fontWeight"]),
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


export interface OptionSheetItem {
  key: string;
  label: string;
  selected: boolean;
  onSelect: () => void;
  swatch?: string;
  separatorBefore?: boolean;
}

export function OptionSheet({
  visible,
  onClose,
  title,
  items,
  theme,
  bottomInset,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  items: OptionSheetItem[];
  theme: ThemeTokens;
  bottomInset: number;
}) {
  const styles = useMemo(() => createOptionStyles(theme), [theme]);
  return (
    <PickerSheet
      visible={visible}
      onClose={onClose}
      title={title}
      theme={theme}
      bottomInset={bottomInset}
      maxHeightRatio={0.7}
    >
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {items.map((item) => (
          <View key={item.key}>
            {item.separatorBefore ? <View style={styles.separator} /> : null}
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={item.onSelect}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: item.selected }}
            >
              <Feather
                name="check"
                size={16}
                color={
                  item.selected ? theme.colors.foreground : "transparent"
                }
              />
              {item.swatch ? (
                <View
                  style={[styles.swatch, { backgroundColor: item.swatch }]}
                />
              ) : null}
              <Text style={styles.rowText} numberOfLines={1}>
                {item.label}
              </Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </PickerSheet>
  );
}

function createOptionStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    list: {
      flexGrow: 0,
    },
    listContent: {
      paddingHorizontal: theme.spacing["2"],
      paddingBottom: theme.spacing["2"],
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing["3"],
      minHeight: 48,
      paddingHorizontal: theme.spacing["3"],
      borderRadius: theme.borderRadius.md,
    },
    rowPressed: {
      backgroundColor: theme.colors.accent,
    },
    swatch: {
      width: 10,
      height: 10,
      borderRadius: theme.borderRadius.full,
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border,
      marginVertical: theme.spacing["1"],
      marginHorizontal: theme.spacing["3"],
    },
    rowText: {
      flex: 1,
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.foreground,
    },
  });
}
