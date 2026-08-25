/**
 * WorkspaceLoadingScreen
 *
 * Full-screen gate shown while the encrypted workspace is being prepared
 * after sign-in. It mirrors the web "loading board": a faint oversized date,
 * the Solace wordmark, the weekday, and a moving sweep line beneath a status
 * message. The screen owns its own mount lifecycle so it can fade smoothly
 * into the app content once preparation finishes.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../providers/ThemeProvider";

const logoSource = require("../assets/logo.png");

const FADE_OUT_MS = 460;

interface WorkspaceLoadingScreenProps {
  /** When true the gate is shown; when it flips to false the screen fades out. */
  active: boolean;
  /** Status text describing the current preparation phase. */
  message: string;
}

function getDateParts(now: Date) {
  return {
    weekday: new Intl.DateTimeFormat(undefined, { weekday: "long" })
      .format(now)
      .toUpperCase(),
    day: now.getDate().toString().padStart(2, "0"),
    month: new Intl.DateTimeFormat(undefined, { month: "long" }).format(now),
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

  const [mounted, setMounted] = useState(active);
  const screenOpacity = useRef(new Animated.Value(active ? 1 : 0)).current;
  const logoPulse = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const messageOpacity = useRef(new Animated.Value(1)).current;

  const [now, setNow] = useState(() => new Date());
  const { weekday, day, month, year } = useMemo(() => getDateParts(now), [now]);

  // Keep the date current without churning every render.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Mount / fade lifecycle. Children render underneath once `active` clears,
  // so fading this layer out reveals the app smoothly.
  useEffect(() => {
    if (active) {
      setMounted(true);
      screenOpacity.setValue(1);
      return;
    }
    Animated.timing(screenOpacity, {
      toValue: 0,
      duration: FADE_OUT_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [active, screenOpacity]);

  // Gentle breathing on the logo.
  useEffect(() => {
    if (!mounted) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(logoPulse, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(logoPulse, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [logoPulse, mounted]);

  // Sweep line travelling across the footer rule.
  useEffect(() => {
    if (!mounted) return;
    sweep.setValue(0);
    const loop = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: 2200,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [sweep, mounted]);

  // Soft cross-fade when the status phase changes.
  useEffect(() => {
    messageOpacity.setValue(0.35);
    Animated.timing(messageOpacity, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [message, messageOpacity]);

  if (!mounted) return null;

  const sweepTravel = width * 0.62;
  const logoOpacity = logoPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.55],
  });
  const logoScale = logoPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.06],
  });
  const sweepTranslate = sweep.interpolate({
    inputRange: [0, 1],
    outputRange: [-sweepTravel, sweepTravel],
  });

  const giantSize = Math.min(Math.max(width * 0.58, 160), 280);
  const monthSize = Math.min(Math.max(width * 0.1, 28), 46);

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        styles.screen,
        { opacity: screenOpacity },
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
              style={[
                styles.logo,
                { opacity: logoOpacity, transform: [{ scale: logoScale }] },
              ]}
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
            style={[styles.status, { opacity: messageOpacity }]}
            numberOfLines={1}
          >
            {message.replace(/…$/, "")}
          </Animated.Text>
          <View style={styles.track}>
            <Animated.View
              style={[
                styles.sweep,
                {
                  backgroundColor: theme.colors.primaryBase,
                  transform: [{ translateX: sweepTranslate }],
                },
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
