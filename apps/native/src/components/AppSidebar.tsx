import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Platform,
  Pressable,
  ScrollView,
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
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, usePathname } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Calendar, CalendarView } from "@workspace/calendar-core";
import { getErrorMessage } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../providers/ThemeProvider";
import { useAuth } from "../providers/AuthProvider";
import { useSidebar } from "../providers/SidebarProvider";
import { useCalendarView } from "../providers/CalendarViewProvider";
import { calendarApiService } from "../lib/api";
import { QUERY_KEYS } from "../lib/query-keys";
import {
  buildSidebarCalendarSections,
  getViewLabel,
  SIDEBAR_VIEW_OPTIONS,
} from "./app-sidebar-utils";
import { BottomSheet } from "./BottomSheet";

// ─── Constants ───────────────────────────────────────────────────────────────
const SCREEN_WIDTH = Dimensions.get("window").width;
const SIDEBAR_WIDTH = SCREEN_WIDTH * 0.78;
const EDGE_SWIPE_WIDTH = 24;
const OPEN_THRESHOLD = 60;
const CLOSE_THRESHOLD = 35;
const VELOCITY_THRESHOLD = 400;
const DRAWER_SPRING = { damping: 24, stiffness: 280, mass: 0.8 };

// ─── Logo ─────────────────────────────────────────────────────────────────────

const logoSource = require("../assets/logo.png");

// ─── Component ───────────────────────────────────────────────────────────────

export function AppSidebar() {
  const { theme } = useTheme();
  const { user, isAuthenticated } = useAuth();
  const { isOpen, open, close } = useSidebar();
  const { activeView, setActiveView } = useCalendarView();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [pendingVisibilityCalendarId, setPendingVisibilityCalendarId] =
    useState<string | null>(null);
  const [viewSheetOpen, setViewSheetOpen] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  const isOnCalendar = pathname.includes("/calendar") || pathname === "/";

  const { data: calendars = [], isLoading: calendarsLoading } = useQuery({
    queryKey: QUERY_KEYS.calendars(),
    queryFn: () => calendarApiService.getCalendars(),
    enabled: isAuthenticated,
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });

  const calendarSections = useMemo(
    () => buildSidebarCalendarSections(calendars, theme),
    [calendars, theme],
  );

  const calendarById = useMemo(
    () => new Map(calendars.map((c) => [c.id, c])),
    [calendars],
  );

  const toggleCalendarVisibilityMutation = useMutation({
    mutationFn: ({
      calendarId,
      isVisible,
    }: {
      calendarId: string;
      isVisible: boolean;
    }) => calendarApiService.updateCalendar(calendarId, { isVisible }),
    onMutate: ({ calendarId }) => {
      setPendingVisibilityCalendarId(calendarId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.calendars() });
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
    onError: (error) => {
      Alert.alert(
        "Unable to update visibility",
        getErrorMessage(error, "Failed to update calendar visibility"),
      );
    },
    onSettled: () => {
      setPendingVisibilityCalendarId(null);
    },
  });

  // ── Shared animation value ─────────────────────────────────────────────

  const translateX = useSharedValue(-SIDEBAR_WIDTH);

  React.useEffect(() => {
    translateX.value = withSpring(isOpen ? 0 : -SIDEBAR_WIDTH, DRAWER_SPRING);
  }, [isOpen, translateX]);

  const sidebarAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const overlayAnimatedStyle = useAnimatedStyle(() => {
    const progress = (translateX.value + SIDEBAR_WIDTH) / SIDEBAR_WIDTH;
    return { opacity: progress * 0.5 };
  });

  // Active view label
  const activeViewLabel = getViewLabel(activeView);

  // ── Swipe-to-open gesture ─────────────────────────────────────────────

  const edgePanGesture = Gesture.Pan()
    .activeOffsetX(10)
    .failOffsetX(-5)
    .onUpdate((e) => {
      const next = -SIDEBAR_WIDTH + e.translationX;
      translateX.value = Math.min(0, Math.max(-SIDEBAR_WIDTH, next));
    })
    .onEnd((e) => {
      if (e.translationX > OPEN_THRESHOLD || e.velocityX > VELOCITY_THRESHOLD) {
        translateX.value = withSpring(0, DRAWER_SPRING);
        runOnJS(open)();
      } else {
        translateX.value = withSpring(-SIDEBAR_WIDTH, DRAWER_SPRING);
        runOnJS(close)();
      }
    });

  // ── Swipe-to-close gesture ────────────────────────────────────────────

  const closePanGesture = Gesture.Pan()
    .activeOffsetX([-6, 20])
    .failOffsetY([-15, 15])
    .onUpdate((e) => {
      "worklet";
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

  const handleToggleCalendarVisibility = useCallback(
    (calendar: Calendar) => {
      toggleCalendarVisibilityMutation.mutate({
        calendarId: calendar.id,
        isVisible: !calendar.isVisible,
      });
    },
    [toggleCalendarVisibilityMutation],
  );

  const handleSelectView = useCallback(
    (view: CalendarView) => {
      setActiveView(view);
      setViewSheetOpen(false);
      // Navigate to calendar if not already there
      if (!pathname.includes("/calendar") && pathname !== "/") {
        setTimeout(() => router.push("/(tabs)/calendar" as any), 60);
      }
      close();
    },
    [setActiveView, pathname, router, close],
  );

  // ── Render ────────────────────────────────────────────────────────────

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
        style={[
          StyleSheet.absoluteFill,
          Platform.OS === "web"
            ? ({
                pointerEvents: isOpen ? "auto" : "none",
              } as unknown as ViewStyle)
            : null,
        ]}
        pointerEvents={
          Platform.OS === "web" ? undefined : isOpen ? "auto" : "none"
        }
      >
        {/* Scrim */}
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

        {/* Sidebar panel */}
        <GestureDetector gesture={closePanGesture}>
          <Animated.View
            style={[styles.sidebar, sidebarAnimatedStyle, { width: SIDEBAR_WIDTH }]}
          >
            {/* ── Header: logo + search + avatar ──────────────────── */}
            <View
              style={[
                styles.header,
                { paddingTop: insets.top + 20 },
              ]}
            >
              <View style={styles.headerLeft}>
                <Image source={logoSource} style={styles.logoImage} />
                <Text style={styles.appName}>solace</Text>
              </View>
              <View style={styles.headerRight}>
                <Pressable
                  onPress={() => handleNavigate("/(tabs)/search")}
                  style={styles.headerIconBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Search"
                >
                  <Feather name="search" size={18} color={theme.colors.mutedForeground} />
                </Pressable>
                <Pressable
                  onPress={() => handleNavigate("/(tabs)/settings")}
                  style={styles.avatarButton}
                  accessibilityRole="button"
                  accessibilityLabel="Account settings"
                >
                  {user?.image && !avatarError ? (
                    <Image
                      source={{ uri: user.image }}
                      style={styles.avatar}
                      onError={() => setAvatarError(true)}
                    />
                  ) : (
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {user?.name?.charAt(0)?.toUpperCase() ?? "?"}
                      </Text>
                    </View>
                  )}
                </Pressable>
              </View>
            </View>

            {/* ── Scrollable content ───────────────────────────────── */}
            <ScrollView
              style={styles.sidebarScroll}
              contentContainerStyle={styles.sidebarScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* New Event CTA */}
              <Pressable
                onPress={() => handleNavigate("/event/create")}
                style={({ pressed }) => [
                  styles.newEventButton,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Create new event"
              >
                <Feather name="plus" size={17} color={theme.colors.foreground} style={{ opacity: 0.8 }} />
                <Text style={styles.newEventText}>New event</Text>
              </Pressable>

              {/* View switcher section */}
              <View style={styles.viewSection}>
                <Pressable
                  onPress={() => setViewSheetOpen(true)}
                  style={({ pressed }) => [styles.viewTriggerRow, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`Calendar view: ${activeViewLabel}. Tap to change`}
                >
                  <Feather
                    name="eye"
                    size={15}
                    color={theme.colors.mutedForeground}
                    style={{ opacity: 0.7 }}
                  />
                  <Text style={styles.viewTriggerLabel}>{activeViewLabel}</Text>
                  <Feather name="chevron-down" size={14} color={theme.colors.mutedForeground} style={{ opacity: 0.5 }} />
                </Pressable>
              </View>

              {/* Calendars section */}
              <View>
                {/* Section header */}
                <View style={styles.calendarsSectionHeader}>
                  <Text style={styles.calendarsSectionLabel}>Calendars</Text>
                  <Pressable
                    onPress={() => handleNavigate("/calendar-manage")}
                    style={({ pressed }) => [styles.headerIconBtn, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel="Manage calendars"
                  >
                    <Feather name="settings" size={14} color={theme.colors.mutedForeground} style={{ opacity: 0.5 }} />
                  </Pressable>
                </View>

                {/* Calendar rows */}
                {calendarsLoading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator size="small" color={theme.colors.primaryBase} />
                  </View>
                ) : calendars.length === 0 ? (
                  <Text style={styles.emptyText}>No calendars yet. Tap + to create one.</Text>
                ) : (
                  calendarSections.map((section) => (
                    <View key={section.key}>
                      {section.title ? (
                        <Text style={styles.sectionSeparator}>{section.title}</Text>
                      ) : null}
                      {section.rows.map((row) => {
                        const calendar = calendarById.get(row.id);
                        const isPending = pendingVisibilityCalendarId === row.id;
                        return (
                          <Pressable
                            key={row.id}
                            onPress={() => calendar && handleToggleCalendarVisibility(calendar)}
                            style={({ pressed }) => [
                              styles.calendarRow,
                              pressed && styles.pressed,
                            ]}
                            accessibilityRole="button"
                            accessibilityLabel={`${row.isVisible ? "Hide" : "Show"} ${row.name}`}
                            accessibilityState={{ checked: row.isVisible }}
                          >
                            {isPending ? (
                              <ActivityIndicator size="small" color={theme.colors.primaryBase} style={styles.calendarDotPlaceholder} />
                            ) : (
                              <View
                                style={[
                                  styles.calendarDot,
                                  {
                                    backgroundColor: row.swatchColor,
                                    opacity: row.isVisible ? 1 : 0.35,
                                  },
                                ]}
                              />
                            )}
                            <Text
                              style={[
                                styles.calendarRowLabel,
                                !row.isVisible && styles.calendarRowLabelHidden,
                              ]}
                              numberOfLines={1}
                            >
                              {row.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ))
                )}
              </View>
            </ScrollView>

            {/* ── Footer ──────────────────────────────────────────── */}
            <View style={[styles.footerContainer, { paddingBottom: insets.bottom + 12 }]}>
              {!isOnCalendar && (
                <Pressable
                  onPress={() => handleNavigate("/(tabs)/calendar")}
                  style={({ pressed }) => [styles.backToCalendarButton, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Go to Calendar"
                >
                  <Feather name="chevron-left" size={16} color={theme.colors.primaryBase} />
                  <Text style={styles.backToCalendarText}>Back to Calendar</Text>
                </Pressable>
              )}
              <Pressable
                onPress={close}
                style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel="Close sidebar"
              >
                <Text style={styles.closeButtonText}>Close</Text>
              </Pressable>
            </View>
          </Animated.View>
        </GestureDetector>
      </View>

      {/* View selector sheet */}
      <BottomSheet
        visible={viewSheetOpen}
        onDismiss={() => setViewSheetOpen(false)}
        title="Calendar View"
      >
        <View style={styles.viewSheetContent}>
          {SIDEBAR_VIEW_OPTIONS.map((opt) => {
            const isActive = activeView === opt.view;
            return (
              <Pressable
                key={opt.view}
                onPress={() => handleSelectView(opt.view)}
                style={({ pressed }) => [
                  styles.viewSheetOption,
                  isActive && styles.viewSheetOptionActive,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="menuitem"
                accessibilityLabel={opt.label}
                accessibilityState={{ selected: isActive }}
              >
                <Feather
                  name={opt.icon}
                  size={18}
                  color={isActive ? theme.colors.primaryBase : theme.colors.mutedForeground}
                />
                <Text
                  style={[
                    styles.viewSheetLabel,
                    isActive && styles.viewSheetLabelActive,
                  ]}
                >
                  {opt.label}
                </Text>
                {isActive && (
                  <Feather name="check" size={16} color={theme.colors.primaryBase} />
                )}
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>
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
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: theme.colors.border,
      zIndex: 10,
    },
    // ── Header ──────────────────────────────────────────────
    header: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      paddingHorizontal: 20,
      paddingBottom: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    headerLeft: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 10,
    },
    logoImage: {
      width: 28,
      height: 28,
      borderRadius: 7,
    },
    headerRight: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 2,
    },
    headerIconBtn: {
      width: 36,
      height: 36,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderRadius: theme.borderRadius.xl,
    },
    avatarButton: {
      borderRadius: 16,
    },
    avatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: theme.colors.primaryBase,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    // ── Scroll ──────────────────────────────────────────────
    sidebarScroll: {
      flex: 1,
    },
    sidebarScrollContent: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 16,
      gap: 24,
    },
    // ── New event button ─────────────────────────────────────
    newEventButton: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: 8,
      height: 44,
      borderRadius: theme.borderRadius.xl,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: "transparent" as const,
    },
    // ── View switcher ────────────────────────────────────────
    viewSection: {
      marginTop: 4,
      borderRadius: theme.borderRadius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    viewTriggerRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 10,
      paddingHorizontal: 14,
      height: 44,
    },
    viewDropdown: {
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    viewOptionRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 10,
      height: 44,
      paddingHorizontal: 14,
    },
    viewOptionRowActive: {
      backgroundColor: theme.colors.primaryBase + "12",
    },
    viewSheetContent: {
      paddingVertical: 8,
      paddingHorizontal: 0,
    },
    viewSheetOption: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 14,
      paddingHorizontal: 20,
      height: 52,
    },
    viewSheetOptionActive: {
      backgroundColor: theme.colors.primaryBase + "10",
    },
    // ── Calendars section ────────────────────────────────────
    calendarsSectionHeader: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      marginBottom: 8,
    },
    loadingRow: {
      alignItems: "center" as const,
      paddingVertical: theme.spacing["3"],
    },
    pressed: {
      opacity: 0.6,
    },
    calendarRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 12,
      paddingVertical: 9,
      paddingHorizontal: 10,
      borderRadius: theme.borderRadius.lg,
    },
    calendarDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      flexShrink: 0,
    },
    calendarDotPlaceholder: {
      width: 10,
      height: 10,
    },
    // ── Footer ──────────────────────────────────────────────
    footerContainer: {
      paddingHorizontal: 20,
      paddingTop: 12,
      gap: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
    },
    backToCalendarButton: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: 6,
      height: 44,
      borderRadius: theme.borderRadius.xl,
      borderWidth: 1,
      borderColor: theme.colors.primaryBase,
    },
    closeButton: {
      width: "100%" as const,
      height: 44,
      borderRadius: theme.borderRadius.xl,
      backgroundColor: theme.colors.muted,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    appName: {
      fontSize: 17,
      letterSpacing: -0.68,
      color: theme.colors.foreground,
      fontWeight: "400" as TextStyle["fontWeight"],
    },
    avatarText: {
      fontSize: theme.typography.fontSize.xs.size,
      fontWeight: "600" as TextStyle["fontWeight"],
      color: theme.colors.primaryForeground,
    },
    newEventText: {
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: "500" as TextStyle["fontWeight"],
      color: theme.colors.foreground,
      opacity: 0.8,
    },
    calendarsSectionLabel: {
      fontSize: 11,
      fontWeight: "600" as TextStyle["fontWeight"],
      color: theme.colors.mutedForeground,
      textTransform: "uppercase" as const,
      letterSpacing: 0.7,
    },
    sectionSeparator: {
      paddingHorizontal: 12,
      paddingTop: 12,
      paddingBottom: 4,
      fontSize: 11,
      fontWeight: "600" as TextStyle["fontWeight"],
      textTransform: "uppercase" as const,
      letterSpacing: 0.7,
      color: theme.colors.mutedForeground,
      opacity: 0.7,
    },
    viewTriggerLabel: {
      flex: 1,
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: "500" as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    viewOptionLabel: {
      flex: 1,
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.foreground,
    },
    viewOptionLabelActive: {
      color: theme.colors.primaryBase,
      fontWeight: "600" as TextStyle["fontWeight"],
    },
    viewSheetLabel: {
      flex: 1,
      fontSize: theme.typography.fontSize.base.size,
      color: theme.colors.foreground,
    },
    viewSheetLabelActive: {
      color: theme.colors.primaryBase,
      fontWeight: "600" as TextStyle["fontWeight"],
    },
    calendarRowLabel: {
      flex: 1,
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: "500" as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    calendarRowLabelHidden: {
      color: theme.colors.mutedForeground,
      opacity: 0.55,
    },
    emptyText: {
      fontSize: theme.typography.fontSize.xs.size,
      color: theme.colors.mutedForeground,
    },
    closeButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: "500" as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    backToCalendarText: {
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: "500" as TextStyle["fontWeight"],
      color: theme.colors.primaryBase,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
