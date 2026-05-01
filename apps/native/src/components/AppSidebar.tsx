import React, { useCallback, useMemo } from "react";
import {
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useSegments } from "expo-router";
import { Feather } from "@expo/vector-icons";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../providers/ThemeProvider";
import { useAuth } from "../providers/AuthProvider";
import { useSidebar } from "../providers/SidebarProvider";

// ─── Constants ───────────────────────────────────────────────────────────────

const SCREEN_WIDTH = Dimensions.get("window").width;
const SIDEBAR_WIDTH = SCREEN_WIDTH * 0.78;

/** Width of the invisible left-edge hit zone for swipe-to-open. */
const EDGE_SWIPE_WIDTH = 24;

/** Distance (px) the finger must travel before we commit to open/close. */
const OPEN_THRESHOLD = 60;

/** Distance (px) to commit a close — intentionally low for responsiveness. */
const CLOSE_THRESHOLD = 35;

/** Velocity (px/s) that also triggers open/close regardless of distance. */
const VELOCITY_THRESHOLD = 400;

/** Spring config matching iOS drawer feel. */
const DRAWER_SPRING = { damping: 24, stiffness: 280, mass: 0.8 };

type FeatherIcon = React.ComponentProps<typeof Feather>["name"];

interface MenuItem {
  key: string;
  label: string;
  icon: FeatherIcon;
  route: string;
}

const MENU_ITEMS: MenuItem[] = [
  { key: "calendar", label: "Calendar", icon: "calendar", route: "/(tabs)/calendar" },
  { key: "search", label: "Search", icon: "search", route: "/(tabs)/search" },
  { key: "settings", label: "Settings", icon: "settings", route: "/(tabs)/settings" },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function AppSidebar() {
  const { theme } = useTheme();
  const { user, signOut } = useAuth();
  const { isOpen, open, close } = useSidebar();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const segments = useSegments();
  const styles = useMemo(() => createStyles(theme), [theme]);

  // ── Shared animation value ─────────────────────────────────────────────
  // translateX: -SIDEBAR_WIDTH (fully hidden) → 0 (fully open)

  const translateX = useSharedValue(-SIDEBAR_WIDTH);

  // Sync with isOpen state (for button taps / programmatic open/close)
  React.useEffect(() => {
    translateX.value = withSpring(isOpen ? 0 : -SIDEBAR_WIDTH, DRAWER_SPRING);
  }, [isOpen, translateX]);

  // ── Animated styles ────────────────────────────────────────────────────

  const sidebarAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const overlayAnimatedStyle = useAnimatedStyle(() => {
    const progress = (translateX.value + SIDEBAR_WIDTH) / SIDEBAR_WIDTH;
    return { opacity: progress * 0.5 };
  });

  // ── Swipe-to-open: left-edge pan gesture ──────────────────────────────
  // Only activates when the finger starts near the left edge and moves right.

  const edgePanGesture = Gesture.Pan()
    .activeOffsetX(10)
    .failOffsetX(-5)
    .onUpdate((e) => {
      // Clamp between fully hidden and fully open
      const next = -SIDEBAR_WIDTH + e.translationX;
      translateX.value = Math.min(0, Math.max(-SIDEBAR_WIDTH, next));
    })
    .onEnd((e) => {
      if (
        e.translationX > OPEN_THRESHOLD ||
        e.velocityX > VELOCITY_THRESHOLD
      ) {
        translateX.value = withSpring(0, DRAWER_SPRING);
        runOnJS(open)();
      } else {
        translateX.value = withSpring(-SIDEBAR_WIDTH, DRAWER_SPRING);
        runOnJS(close)();
      }
    });

  // ── Swipe-to-close: single pan gesture for the entire open area ───────
  // Covers both the sidebar panel and the overlay behind it.
  // Low activation offset so it picks up immediately on any leftward drag.

  const closePanGesture = Gesture.Pan()
    .activeOffsetX([-6, 20])
    .failOffsetY([-15, 15])
    .onUpdate((e) => {
      "worklet";
      // Track finger: allow dragging left from current position (0 → -SIDEBAR_WIDTH)
      // Also allow a small rightward drag so the gesture doesn't feel stuck
      const clamped = Math.min(5, Math.max(e.translationX, -SIDEBAR_WIDTH));
      translateX.value = clamped;
    })
    .onEnd((e) => {
      "worklet";
      if (
        e.translationX < -CLOSE_THRESHOLD ||
        e.velocityX < -VELOCITY_THRESHOLD
      ) {
        translateX.value = withSpring(-SIDEBAR_WIDTH, DRAWER_SPRING);
        runOnJS(close)();
      } else {
        translateX.value = withSpring(0, DRAWER_SPRING);
      }
    });

  // ── Navigation ────────────────────────────────────────────────────────

  const handleNavigate = useCallback(
    (route: string) => {
      close();
      setTimeout(() => {
        router.push(route as any);
      }, 100);
    },
    [close, router],
  );

  const handleLogout = useCallback(async () => {
    close();
    await signOut();
  }, [close, signOut]);

  const activeTab = useMemo(() => {
    const segmentArray = segments as string[];
    if (segmentArray.length >= 2 && segmentArray[0] === "(tabs)") {
      return segmentArray[1];
    }
    return "calendar";
  }, [segments]);

  // ── Render ────────────────────────────────────────────────────────────
  // Always mounted so the edge gesture zone is always active.

  return (
    <>
      {/* Invisible left-edge swipe zone — always present for swipe-to-open */}
      {!isOpen && (
        <GestureDetector gesture={edgePanGesture}>
          <Animated.View
            style={[
              styles.edgeZone,
              { height: "100%", paddingTop: insets.top },
            ]}
          />
        </GestureDetector>
      )}

      {/* Overlay + sidebar — interactive only when open */}
      <View
        style={StyleSheet.absoluteFill}
        pointerEvents={isOpen ? "auto" : "none"}
      >
        {/* Overlay: tap to close + swipe-to-close */}
        <GestureDetector gesture={closePanGesture}>
          <Animated.View style={[styles.overlay, overlayAnimatedStyle]}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={close}
              accessibilityRole="button"
              accessibilityLabel="Close sidebar"
            />
          </Animated.View>
        </GestureDetector>

        {/* Sidebar panel — also supports swipe-to-close */}
        <GestureDetector gesture={closePanGesture}>
          <Animated.View
            style={[
              styles.sidebar,
              sidebarAnimatedStyle,
              {
                width: SIDEBAR_WIDTH,
                paddingTop: insets.top + theme.spacing["4"],
                paddingBottom: insets.bottom + theme.spacing["4"],
              },
            ]}
          >
            {/* User info header */}
            <View style={styles.header}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {user?.name?.charAt(0)?.toUpperCase() ?? "?"}
                </Text>
              </View>
              <View style={styles.userInfo}>
                <Text style={styles.userName} numberOfLines={1}>
                  {user?.name ?? "User"}
                </Text>
                <Text style={styles.userEmail} numberOfLines={1}>
                  {user?.email ?? ""}
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            {/* Menu items */}
            <View style={styles.menuSection}>
              {MENU_ITEMS.map((item) => {
                const isActive = activeTab === item.key;
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => handleNavigate(item.route)}
                    style={({ pressed }) => [
                      styles.menuItem,
                      isActive && styles.menuItemActive,
                      pressed && styles.menuItemPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                    accessibilityState={{ selected: isActive }}
                  >
                    <Feather
                      name={item.icon}
                      size={20}
                      color={
                        isActive
                          ? theme.colors.primaryBase
                          : theme.colors.foreground
                      }
                    />
                    <Text
                      style={[
                        styles.menuLabel,
                        isActive && styles.menuLabelActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Spacer */}
            <View style={{ flex: 1 }} />

            {/* Logout */}
            <View style={styles.divider} />
            <Pressable
              onPress={handleLogout}
              style={({ pressed }) => [
                styles.menuItem,
                styles.logoutItem,
                pressed && styles.menuItemPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Sign out"
            >
              <Feather
                name="log-out"
                size={20}
                color={theme.colors.destructive}
              />
              <Text style={styles.logoutLabel}>Sign Out</Text>
            </Pressable>
          </Animated.View>
        </GestureDetector>
      </View>
    </>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function createStyles(theme: ThemeTokens) {
  const view = {
    edgeZone: {
      position: "absolute" as const,
      top: 0,
      left: 0,
      width: EDGE_SWIPE_WIDTH,
      bottom: 0,
      zIndex: 5,
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "#000",
    },
    sidebar: {
      position: "absolute" as const,
      top: 0,
      left: 0,
      bottom: 0,
      backgroundColor: theme.colors.card,
      borderRightWidth: 1,
      borderRightColor: theme.colors.border,
      paddingHorizontal: theme.spacing["4"],
      zIndex: 10,
    },
    header: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["3"],
      paddingVertical: theme.spacing["2"],
      paddingHorizontal: theme.spacing["2"],
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.colors.primaryBase,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    userInfo: {
      flex: 1,
    },
    divider: {
      height: 1,
      backgroundColor: theme.colors.border,
      marginVertical: theme.spacing["3"],
    },
    menuSection: {
      gap: theme.spacing["1"],
    },
    menuItem: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["3"],
      paddingVertical: theme.spacing["3"],
      paddingHorizontal: theme.spacing["3"],
      borderRadius: theme.borderRadius.md,
    },
    menuItemActive: {
      backgroundColor: theme.colors.accent,
    },
    menuItemPressed: {
      opacity: 0.7,
    },
    logoutItem: {
      marginTop: theme.spacing["1"],
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    avatarText: {
      fontSize: theme.typography.fontSize.lg.size,
      fontWeight: theme.typography.fontWeight
        .bold as TextStyle["fontWeight"],
      color: theme.colors.primaryForeground,
    },
    userName: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    userEmail: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
    },
    menuLabel: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      fontWeight: theme.typography.fontWeight
        .medium as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    menuLabelActive: {
      color: theme.colors.primaryBase,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
    },
    logoutLabel: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      fontWeight: theme.typography.fontWeight
        .medium as TextStyle["fontWeight"],
      color: theme.colors.destructive,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
