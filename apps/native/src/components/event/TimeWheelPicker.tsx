import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type ListRenderItemInfo,
  type TextStyle,
} from "react-native";
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import * as Haptics from "expo-haptics";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import {
  WHEEL_HOURS_12,
  WHEEL_HOURS_24,
  WHEEL_MERIDIEMS,
  WHEEL_MINUTES,
  isInMiddleCycle,
  middleRawIndex,
  nearestRawIndex,
  timeToWheelIndexes,
  wheelCycles,
  wheelIndexFromOffset,
  wheelIndexesToTime,
  wheelRowProjection,
  wheelValueAt,
  type TimeFormat,
  type TimeWheelIndexes,
} from "./time-wheel-utils";

const ITEM_HEIGHT = 34;
const VISIBLE_ROWS = 7;
const HALF_ROWS = (VISIBLE_ROWS - 1) / 2;
const WHEEL_PADDING = ITEM_HEIGHT * HALF_ROWS;
const COLUMN_WIDTH = 64;

type WheelStyles = ReturnType<typeof createStyles>;

export function TimeWheelPicker({
  value,
  onChange,
  timeFormat,
  accessibilityLabel,
}: {
  value: Date;
  onChange: (time: Date) => void;
  timeFormat: TimeFormat;
  accessibilityLabel: string;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { hourIndex, minuteIndex, meridiemIndex } = timeToWheelIndexes(
    value.getHours(),
    value.getMinutes(),
    timeFormat,
  );

  const commit = useCallback(
    (patch: Partial<TimeWheelIndexes>) => {
      const { hours, minutes } = wheelIndexesToTime(
        { hourIndex, minuteIndex, meridiemIndex, ...patch },
        timeFormat,
      );
      onChange(new Date(2000, 0, 1, hours, minutes));
    },
    [hourIndex, minuteIndex, meridiemIndex, onChange, timeFormat],
  );
  const selectHour = useCallback(
    (index: number) => commit({ hourIndex: index }),
    [commit],
  );
  const selectMinute = useCallback(
    (index: number) => commit({ minuteIndex: index }),
    [commit],
  );
  const selectMeridiem = useCallback(
    (index: number) => commit({ meridiemIndex: index }),
    [commit],
  );

  return (
    <View style={styles.wheel} accessibilityLabel={accessibilityLabel}>
      <View style={styles.band} pointerEvents="none" />
      <WheelColumn
        items={timeFormat === "24h" ? WHEEL_HOURS_24 : WHEEL_HOURS_12}
        selectedIndex={hourIndex}
        onSelect={selectHour}
        loop
        accessibilityLabel="Hour"
        styles={styles}
      />
      <WheelColumn
        items={WHEEL_MINUTES}
        selectedIndex={minuteIndex}
        onSelect={selectMinute}
        loop
        accessibilityLabel="Minute"
        styles={styles}
      />
      {timeFormat === "12h" ? (
        <WheelColumn
          items={WHEEL_MERIDIEMS}
          selectedIndex={meridiemIndex}
          onSelect={selectMeridiem}
          loop={false}
          accessibilityLabel="AM or PM"
          styles={styles}
        />
      ) : null}
    </View>
  );
}

function getItemLayout(_: ArrayLike<number> | null | undefined, index: number) {
  return { length: ITEM_HEIGHT, offset: WHEEL_PADDING + ITEM_HEIGHT * index, index };
}

function keyExtractor(rawIndex: number) {
  return String(rawIndex);
}

function WheelColumn({
  items,
  selectedIndex,
  onSelect,
  loop,
  accessibilityLabel,
  styles,
}: {
  items: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  loop: boolean;
  accessibilityLabel: string;
  styles: WheelStyles;
}) {
  const count = items.length;
  const cycles = wheelCycles(count, loop);
  const rows = useMemo(
    () => Array.from({ length: count * cycles }, (_, i) => i),
    [count, cycles],
  );
  const listRef = useRef<FlatList<number>>(null);
  const [initialRaw] = useState(() =>
    loop ? middleRawIndex(selectedIndex, count, cycles) : selectedIndex,
  );
  // The header spacer is exactly HALF_ROWS rows tall, so this index puts the selected row in the centre.
  const initialScrollIndex =
    initialRaw >= HALF_ROWS ? initialRaw - HALF_ROWS : undefined;
  const rawIndexRef = useRef(initialRaw);
  const committedValue = useRef(selectedIndex);
  const scrollY = useSharedValue(initialRaw * ITEM_HEIGHT);
  const tickValue = useSharedValue(selectedIndex);

  const scrollToRaw = useCallback((rawIndex: number, animated: boolean) => {
    rawIndexRef.current = rawIndex;
    listRef.current?.scrollToOffset({
      offset: rawIndex * ITEM_HEIGHT,
      animated,
    });
  }, []);

  const commitValue = useCallback(
    (value: number) => {
      if (value === committedValue.current) return;
      committedValue.current = value;
      onSelect(value);
    },
    [onSelect],
  );

  const settle = useCallback(
    (rawIndex: number) => {
      const value = wheelValueAt(rawIndex, count);
      // Jump back to the identical middle row so the loop never runs out; invisible because every cycle renders the same.
      if (loop && !isInMiddleCycle(rawIndex, count, cycles)) {
        scrollToRaw(middleRawIndex(value, count, cycles), false);
      } else {
        rawIndexRef.current = rawIndex;
      }
      commitValue(value);
    },
    [commitValue, count, cycles, loop, scrollToRaw],
  );

  const tick = useCallback(() => {
    void Haptics.selectionAsync();
  }, []);

  // Only scroll for outside changes; changes that came from this wheel already match committedValue.
  useEffect(() => {
    if (selectedIndex === committedValue.current) return;
    committedValue.current = selectedIndex;
    scrollToRaw(
      nearestRawIndex(rawIndexRef.current, selectedIndex, count, loop),
      true,
    );
  }, [count, loop, scrollToRaw, selectedIndex]);

  const totalRows = rows.length;
  const scrollHandler = useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        scrollY.value = event.contentOffset.y;
        const value = wheelValueAt(
          wheelIndexFromOffset(event.contentOffset.y, ITEM_HEIGHT, totalRows),
          count,
        );
        if (value !== tickValue.value) {
          tickValue.value = value;
          scheduleOnRN(tick);
        }
      },
      onEndDrag: (event) => {
        // A release without velocity snaps in place and may not emit a momentum end.
        if (Math.abs(event.velocity?.y ?? 0) < 0.05) {
          scheduleOnRN(
            settle,
            wheelIndexFromOffset(event.contentOffset.y, ITEM_HEIGHT, totalRows),
          );
        }
      },
      onMomentumEnd: (event) => {
        scheduleOnRN(
          settle,
          wheelIndexFromOffset(event.contentOffset.y, ITEM_HEIGHT, totalRows),
        );
      },
    },
    [count, settle, tick, totalRows],
  );

  const pressRow = useCallback(
    (rawIndex: number) => {
      scrollToRaw(rawIndex, true);
      commitValue(wheelValueAt(rawIndex, count));
    },
    [commitValue, count, scrollToRaw],
  );

  const renderItem = useCallback(
    ({ item: rawIndex }: ListRenderItemInfo<number>) => (
      <WheelRow
        label={items[rawIndex % count] ?? ""}
        rawIndex={rawIndex}
        scrollY={scrollY}
        onPress={pressRow}
        styles={styles}
      />
    ),
    [count, items, pressRow, scrollY, styles],
  );

  const handleAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      const step = event.nativeEvent.actionName === "increment" ? 1 : -1;
      const next = loop
        ? wheelValueAt(selectedIndex + step, count)
        : Math.min(count - 1, Math.max(0, selectedIndex + step));
      if (next !== selectedIndex) onSelect(next);
    },
    [count, loop, onSelect, selectedIndex],
  );

  return (
    <View
      style={styles.column}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: items[selectedIndex] }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={handleAccessibilityAction}
    >
      <Animated.FlatList
        ref={listRef}
        data={rows}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemLayout={getItemLayout}
        initialScrollIndex={initialScrollIndex}
        contentOffset={{ x: 0, y: initialRaw * ITEM_HEIGHT }}
        ListHeaderComponent={<View style={styles.spacer} />}
        ListFooterComponent={<View style={styles.spacer} />}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="normal"
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        initialNumToRender={VISIBLE_ROWS + 4}
        maxToRenderPerBatch={VISIBLE_ROWS * 2}
        windowSize={5}
      />
    </View>
  );
}

const WheelRow = memo(function WheelRow({
  label,
  rawIndex,
  scrollY,
  onPress,
  styles,
}: {
  label: string;
  rawIndex: number;
  scrollY: SharedValue<number>;
  onPress: (rawIndex: number) => void;
  styles: WheelStyles;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const distance = (scrollY.value - rawIndex * ITEM_HEIGHT) / ITEM_HEIGHT;
    const { rotateX, translateY, opacity } = wheelRowProjection(
      distance,
      ITEM_HEIGHT,
    );
    return {
      opacity,
      transform: [
        { perspective: 800 },
        { translateY },
        { rotateX: `${rotateX}deg` },
      ],
    };
  });

  return (
    <Pressable
      style={styles.item}
      onPress={() => onPress(rawIndex)}
      accessible={false}
    >
      <Animated.Text style={[styles.itemText, animatedStyle]}>
        {label}
      </Animated.Text>
    </Pressable>
  );
});

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    wheel: {
      flexDirection: "row",
      justifyContent: "center",
      height: ITEM_HEIGHT * VISIBLE_ROWS,
      marginTop: theme.spacing["2"],
    },
    band: {
      position: "absolute",
      left: 0,
      right: 0,
      top: WHEEL_PADDING,
      height: ITEM_HEIGHT,
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.accent,
    },
    column: {
      width: COLUMN_WIDTH,
    },
    spacer: {
      height: WHEEL_PADDING,
    },
    item: {
      height: ITEM_HEIGHT,
      alignItems: "center",
      justifyContent: "center",
    },
    itemText: {
      fontSize: theme.typography.fontSize.lg.size,
      fontWeight: theme.typography.fontWeight
        .medium as TextStyle["fontWeight"],
      fontVariant: ["tabular-nums"],
      color: theme.colors.foreground,
    },
  });
}
