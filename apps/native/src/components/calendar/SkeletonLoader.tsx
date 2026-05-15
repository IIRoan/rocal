import React, { useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, View, type ViewStyle } from "react-native";
import { useTheme } from "../../providers/ThemeProvider";
import type { CalendarView } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";

// ─── Props ───────────────────────────────────────────────────────────────────

interface SkeletonLoaderProps {
  /** The view type to show skeleton for */
  view: CalendarView;
}

// ─── Skeleton Pulse Hook ─────────────────────────────────────────────────────

function useSkeletonPulse() {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return opacity;
}

// ─── Skeleton Sub-Components ─────────────────────────────────────────────────

function MonthSkeleton({
  styles,
  opacity,
}: {
  styles: ReturnType<typeof createStyles>;
  opacity: Animated.Value;
}) {
  return (
    <View style={styles.monthContainer}>
      {Array.from({ length: 6 }, (_, row) => (
        <View key={row} style={styles.monthRow}>
          {Array.from({ length: 7 }, (_, col) => (
            <Animated.View key={col} style={[styles.monthCell, { opacity }]} />
          ))}
        </View>
      ))}
    </View>
  );
}

function TimelineSkeleton({
  styles,
  opacity,
  columns,
}: {
  styles: ReturnType<typeof createStyles>;
  opacity: Animated.Value;
  columns: number;
}) {
  return (
    <View style={styles.timelineContainer}>
      {/* Time gutter + columns */}
      <View style={styles.timelineRow}>
        {/* Time gutter */}
        <View style={styles.timeGutter}>
          {Array.from({ length: 8 }, (_, i) => (
            <Animated.View key={i} style={[styles.timeLabel, { opacity }]} />
          ))}
        </View>

        {/* Day columns */}
        {Array.from({ length: columns }, (_, col) => (
          <View key={col} style={styles.timelineColumn}>
            {/* Horizontal hour lines */}
            {Array.from({ length: 8 }, (_, i) => (
              <Animated.View
                key={`line-${i}`}
                style={[styles.hourLine, { opacity }]}
              />
            ))}
            {/* Fake event blocks */}
            {col % 2 === 0 && (
              <Animated.View
                style={[styles.fakeEvent, { top: 40, height: 60, opacity }]}
              />
            )}
            {col % 3 === 0 && (
              <Animated.View
                style={[styles.fakeEvent, { top: 160, height: 40, opacity }]}
              />
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

function AgendaSkeleton({
  styles,
  opacity,
}: {
  styles: ReturnType<typeof createStyles>;
  opacity: Animated.Value;
}) {
  return (
    <View style={styles.agendaContainer}>
      {Array.from({ length: 4 }, (_, section) => (
        <View key={section} style={styles.agendaSection}>
          {/* Section header bar */}
          <Animated.View style={[styles.agendaSectionHeader, { opacity }]} />
          {/* Event rows */}
          {Array.from({ length: 2 + (section % 2) }, (_, row) => (
            <Animated.View
              key={row}
              style={[styles.agendaEventRow, { opacity }]}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SkeletonLoader({ view }: SkeletonLoaderProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const opacity = useSkeletonPulse();

  switch (view) {
    case "month":
      return <MonthSkeleton styles={styles} opacity={opacity} />;
    case "week":
      return <TimelineSkeleton styles={styles} opacity={opacity} columns={7} />;
    case "day":
      return <TimelineSkeleton styles={styles} opacity={opacity} columns={1} />;
    case "3day":
      return <TimelineSkeleton styles={styles} opacity={opacity} columns={3} />;
    case "agenda":
      return <AgendaSkeleton styles={styles} opacity={opacity} />;
    default:
      return <MonthSkeleton styles={styles} opacity={opacity} />;
  }
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function createStyles(theme: ThemeTokens) {
  const skeletonBg = theme.colors.muted;

  const view = {
    // Month skeleton
    monthContainer: {
      padding: theme.spacing["3"],
    },
    monthRow: {
      flexDirection: "row" as const,
      justifyContent: "space-around" as const,
      marginBottom: theme.spacing["2"],
    },
    monthCell: {
      width: 32,
      height: 32,
      borderRadius: theme.borderRadius.full,
      backgroundColor: skeletonBg,
    },

    // Timeline skeleton (week/day/3day)
    timelineContainer: {
      flex: 1,
      padding: theme.spacing["2"],
    },
    timelineRow: {
      flexDirection: "row" as const,
      flex: 1,
    },
    timeGutter: {
      width: 48,
      paddingRight: theme.spacing["1"],
    },
    timeLabel: {
      width: 32,
      height: 12,
      borderRadius: theme.borderRadius.sm,
      backgroundColor: skeletonBg,
      marginBottom: 28,
    },
    timelineColumn: {
      flex: 1,
      position: "relative" as const,
      marginLeft: 1,
    },
    hourLine: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: skeletonBg,
      marginBottom: 40,
    },
    fakeEvent: {
      position: "absolute" as const,
      left: 2,
      right: 2,
      borderRadius: theme.borderRadius.sm,
      backgroundColor: skeletonBg,
    },

    // Agenda skeleton
    agendaContainer: {
      padding: theme.spacing["3"],
    },
    agendaSection: {
      marginBottom: theme.spacing["4"],
    },
    agendaSectionHeader: {
      height: 20,
      width: 120,
      borderRadius: theme.borderRadius.sm,
      backgroundColor: skeletonBg,
      marginBottom: theme.spacing["2"],
    },
    agendaEventRow: {
      height: 48,
      borderRadius: theme.borderRadius.md,
      backgroundColor: skeletonBg,
      marginBottom: theme.spacing["2"],
    },
  } satisfies Record<string, ViewStyle>;

  return StyleSheet.create(view);
}

export type { SkeletonLoaderProps };
