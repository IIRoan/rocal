/** Gate shown while the encrypted workspace is prepared after sign-in; owns its mount lifecycle so it can fade into the app. */
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../providers/ThemeProvider";
import { useReduceMotion } from "../lib/use-reduce-motion";
import { afterPaint } from "@workspace/calendar-core";
import { usePaintedValue } from "../hooks/use-painted-value";

const logoSource = require("../assets/logo.png");

const FADE_OUT_MS = 460;

interface WorkspaceLoadingScreenProps {
  /** When true the gate is shown; when it flips to false the screen fades out. */
  active: boolean;
  message: string;
}

const WEEKDAY_FORMAT = new Intl.DateTimeFormat(undefined, { weekday: "long" });
const MONTH_FORMAT = new Intl.DateTimeFormat(undefined, { month: "long" });

function getDateParts(now: Date) {
  return {
    weekday: WEEKDAY_FORMAT.format(now).toUpperCase(),
    day: now.getDate().toString().padStart(2, "0"),
    month: MONTH_FORMAT.format(now),
    year: now.getFullYear().toString(),
  };
}

export function WorkspaceLoadingScreen({
  active,
  message,
}: WorkspaceLoadingScreenProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const reduceMotion = useReduceMotion();

  const [mounted, setMounted] = useState(false);
  if (active && !mounted) {
    setMounted(true);
  }
  const logoPulse = useSharedValue(0);
  const sweep = useSharedValue(0);
  const messageOpacity = useSharedValue(1);

  const [now, setNow] = useState(() => new Date());
  const { weekday, day, month, year } = useMemo(() => getDateParts(now), [now]);

  // Keep the date current without churning every render.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Covering is immediate; once `active` clears, the layer fades only after the app underneath has drawn.
  const revealing = usePaintedValue(!active) && !active;
  const screenOpacity = useDerivedValue(
    () =>
      revealing
        ? withTiming(
            0,
            { duration: FADE_OUT_MS, easing: Easing.out(Easing.cubic) },
            (finished) => {
              if (finished) scheduleOnRN(setMounted, false);
            },
          )
        : 1,
    [revealing],
  );

  useEffect(() => {
    if (!mounted || reduceMotion) {
      logoPulse.value = 0;
      return;
    }
    const pulse = { duration: 1200, easing: Easing.inOut(Easing.sin) };
    logoPulse.value = withRepeat(
      withSequence(withTiming(1, pulse), withTiming(0, pulse)),
      -1,
    );
    return () => cancelAnimation(logoPulse);
  }, [logoPulse, mounted, reduceMotion]);

  useEffect(() => {
    sweep.value = reduceMotion ? 0.5 : 0;
    if (!mounted || reduceMotion) return;
    sweep.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
      -1,
      false,
    );
    return () => cancelAnimation(sweep);
  }, [sweep, mounted, reduceMotion]);

  useEffect(() => {
    if (reduceMotion) {
      messageOpacity.value = 1;
      return;
    }
    messageOpacity.value = 0.35;
    return afterPaint(() => {
      messageOpacity.value = withTiming(1, {
        duration: 320,
        easing: Easing.out(Easing.quad),
      });
    });
  }, [message, messageOpacity, reduceMotion]);

  const sweepTravel = width * 0.62;
  const screenStyle = useAnimatedStyle(() => ({ opacity: screenOpacity.value }));
  const logoStyle = useAnimatedStyle(() => ({
    opacity: interpolate(logoPulse.value, [0, 1], [1, 0.55]),
    transform: [{ scale: interpolate(logoPulse.value, [0, 1], [1, 1.06]) }],
  }));
  const sweepStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(sweep.value, [0, 1], [-sweepTravel, sweepTravel]) },
    ],
  }));
  const messageStyle = useAnimatedStyle(() => ({ opacity: messageOpacity.value }));

  if (!mounted) return null;

  const giantSize = Math.min(Math.max(width * 0.58, 160), 280);
  const monthSize = Math.min(Math.max(width * 0.1, 28), 46);

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        styles.screen,
        screenStyle,
      ]}
    >
      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top + theme.spacing["6"],
            paddingBottom: insets.bottom + theme.spacing["8"],
          },
        ]}
      >
        <View style={styles.topRow}>
          <View style={styles.brand}>
            <Animated.Image
              source={logoSource}
              style={[styles.logo, logoStyle]}
            />
            <Text style={styles.wordmark}>SOLACE</Text>
          </View>
          <Text style={styles.weekday}>{weekday}</Text>
        </View>

        <View style={styles.center}>
          <Text
            allowFontScaling={false}
            style={[styles.giantDay, { fontSize: giantSize, lineHeight: giantSize }]}
          >
            {day}
          </Text>
          <View style={styles.centerOverlay} pointerEvents="none">
            <Text
              allowFontScaling={false}
              style={[styles.month, { fontSize: monthSize }]}
            >
              {month}
            </Text>
            <Text style={styles.year}>{year}</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Animated.Text
            style={[styles.status, messageStyle]}
            numberOfLines={1}
          >
            {message.replace(/…$/, "")}
          </Animated.Text>
          <View style={styles.track}>
            <Animated.View
              style={[
                styles.sweep,
                { backgroundColor: theme.colors.primaryBase },
                sweepStyle,
              ]}
            />
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    screen: {
      backgroundColor: theme.colors.background,
      pointerEvents: "auto",
    },
    content: {
      flex: 1,
      justifyContent: "space-between",
      paddingHorizontal: theme.spacing["6"],
    },
    topRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    brand: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing["2"],
    },
    logo: {
      width: 22,
      height: 22,
      borderRadius: 6,
    },
    wordmark: {
      color: theme.colors.mutedForeground,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 5,
      opacity: 0.6,
    },
    weekday: {
      color: theme.colors.mutedForeground,
      fontSize: 11,
      fontWeight: "600",
      letterSpacing: 3,
      opacity: 0.45,
    },
    center: {
      alignItems: "center",
      justifyContent: "center",
    },
    giantDay: {
      color: theme.colors.foreground,
      fontWeight: "800",
      textAlign: "center",
      opacity: 0.07,
    },
    centerOverlay: {
      ...StyleSheet.absoluteFill,
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
    },
    month: {
      color: theme.colors.foreground,
      fontWeight: "800",
      letterSpacing: -0.5,
    },
    year: {
      color: theme.colors.mutedForeground,
      fontSize: 15,
      fontWeight: "500",
      opacity: 0.6,
    },
    footer: {
      gap: theme.spacing["3"],
    },
    status: {
      color: theme.colors.mutedForeground,
      fontSize: 11,
      fontWeight: "500",
      letterSpacing: 1.5,
      textTransform: "uppercase",
      opacity: 0.6,
    },
    track: {
      height: 2,
      borderRadius: 999,
      overflow: "hidden",
      backgroundColor: theme.colors.border,
    },
    sweep: {
      position: "absolute",
      top: 0,
      bottom: 0,
      width: "38%",
      borderRadius: 999,
    },
  });
}
