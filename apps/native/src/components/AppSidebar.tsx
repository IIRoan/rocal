import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useSegments } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { Calendar } from "@workspace/calendar-core";
import { getErrorMessage, resolveTimezone } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../providers/ThemeProvider";
import { useAuth } from "../providers/AuthProvider";
import { useToast } from "../providers/ToastProvider";
import { useCalendarView } from "../providers/CalendarViewProvider";
import { useSidebar } from "../providers/SidebarProvider";
import { useMailSelection } from "../providers/MailSelectionProvider";
import { useCommandPalette } from "../providers/CommandPaletteProvider";
import { calendarApiService } from "../lib/api";
import {
  CALENDAR_TAB_ROUTE,
  MAIL_TAB_ROUTE,
  SETTINGS_ROUTE,
  isCalendarRouteSegments,
  isMailRouteSegments,
  isSidebarGestureRootSegments,
} from "../lib/navigation-routes";
import { QUERY_KEYS } from "../lib/query-keys";
import { buildSidebarCalendarSections } from "./app-sidebar-utils";
import { SidebarMiniCalendar } from "./SidebarMiniCalendar";
import { AppSwitcher } from "./AppSwitcher";
import {
  useMailAccount,
  useMailRuntime,
} from "../lib/mail/use-mail";
import { getMailboxIcon, sortMailboxes } from "../lib/mail/mail-helpers";
import { InlineLoader } from "./ui/loading";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SIDEBAR_WIDTH = SCREEN_WIDTH * 0.78;
const EDGE_SWIPE_WIDTH = 24;
const OPEN_THRESHOLD = 60;
const CLOSE_THRESHOLD = 35;
const VELOCITY_THRESHOLD = 0.5;
const DRAWER_SPRING = {
  damping: 24,
  stiffness: 280,
  mass: 0.8,
  useNativeDriver: true,
};

const logoSource = require("../assets/logo.png");

export function AppSidebar() {
  const { theme } = useTheme();
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const { selectedDate, setCurrentDate, setSelectedDate } = useCalendarView();
  const { isOpen, open, close } = useSidebar();
  const { open: openCommandPalette } = useCommandPalette();
  const { selectedMailboxId, setSelectedMailboxId } = useMailSelection();
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const router = useRouter();
  const queryClient = useQueryClient();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [pendingVisibilityCalendarId, setPendingVisibilityCalendarId] =
    useState<string | null>(null);
  const [avatarError, setAvatarError] = useState(false);

  const { data: calendars = [], isLoading: calendarsLoading } = useQuery({
    queryKey: QUERY_KEYS.calendars(),
    queryFn: () => calendarApiService.getCalendars(),
    enabled: isAuthenticated,
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });

  const { data: settings } = useQuery({
    queryKey: QUERY_KEYS.settings(),
    queryFn: () => calendarApiService.getUserSettings(),
    enabled: isAuthenticated,
  });
  const resolvedTimezone = resolveTimezone(settings?.timezone);

  const calendarSections = useMemo(
    () => buildSidebarCalendarSections(calendars, theme),
    [calendars, theme],
  );

  const isMailContext = isMailRouteSegments(segments);
  const isCalendarContext = isCalendarRouteSegments(segments);
  const isMainScreen = isSidebarGestureRootSegments(segments);

  const mailAccountQuery = useMailAccount();
  const mailProvisioned = mailAccountQuery.data?.provisioned ?? false;
  const mailRuntimeQuery = useMailRuntime(isMailContext && mailProvisioned);
  const mailRuntime = mailRuntimeQuery.data;
  const sortedMailboxes = useMemo(
    () => (mailRuntime ? sortMailboxes(mailRuntime.mailboxes) : []),
    [mailRuntime],
  );

  const calendarById = useMemo(
    () => new Map(calendars.map((calendar) => [calendar.id, calendar])),
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
      toast(getErrorMessage(error, "Failed to update calendar visibility"), "error");
    },
    onSettled: () => {
      setPendingVisibilityCalendarId(null);
    },
  });

  const translateX = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;

  const animateSidebar = useCallback(
    (toValue: number) => {
      Animated.spring(translateX, {
        toValue,
        ...DRAWER_SPRING,
      }).start();
    },
    [translateX],
  );

  useEffect(() => {
    animateSidebar(isOpen ? 0 : -SIDEBAR_WIDTH);
  }, [animateSidebar, isOpen]);

  const overlayOpacity = useMemo(
    () =>
      translateX.interpolate({
        inputRange: [-SIDEBAR_WIDTH, 0],
        outputRange: [0, 0.5],
        extrapolate: "clamp",
      }),
    [translateX],
  );

  const edgePanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          gestureState.dx > 10 && Math.abs(gestureState.dy) < 20,
        onPanResponderMove: (_, gestureState) => {
          const next = -SIDEBAR_WIDTH + gestureState.dx;
          translateX.setValue(Math.min(0, Math.max(-SIDEBAR_WIDTH, next)));
        },
        onPanResponderRelease: (_, gestureState) => {
          if (
            gestureState.dx > OPEN_THRESHOLD ||
            gestureState.vx > VELOCITY_THRESHOLD
          ) {
            open();
            animateSidebar(0);
            return;
          }

          close();
          animateSidebar(-SIDEBAR_WIDTH);
        },
        onPanResponderTerminate: () => {
          close();
          animateSidebar(-SIDEBAR_WIDTH);
        },
      }),
    [animateSidebar, close, open, translateX],
  );

  const closePanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          isOpen &&
          Math.abs(gestureState.dx) > 6 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
        onPanResponderGrant: () => {
          translateX.stopAnimation();
        },
        onPanResponderMove: (_, gestureState) => {
          const clamped = Math.min(0, Math.max(-SIDEBAR_WIDTH, gestureState.dx));
          translateX.setValue(clamped);
        },
        onPanResponderRelease: (_, gestureState) => {
          if (
            gestureState.dx < -CLOSE_THRESHOLD ||
            gestureState.vx < -VELOCITY_THRESHOLD
          ) {
            close();
            animateSidebar(-SIDEBAR_WIDTH);
            return;
          }

          open();
          animateSidebar(0);
        },
        onPanResponderTerminate: () => {
          open();
          animateSidebar(0);
        },
      }),
    [animateSidebar, close, isOpen, open, translateX],
  );

  const handleNavigate = useCallback(
    (route: string) => {
      close();
      setTimeout(() => {
        router.push(route as any);
      }, 100);
    },
    [close, router],
  );

  const handleOpenSearch = useCallback(() => {
    close();
    setTimeout(() => openCommandPalette(), 100);
  }, [close, openCommandPalette]);

  const handleToggleCalendarVisibility = useCallback(
    (calendar: Calendar) => {
      toggleCalendarVisibilityMutation.mutate({
        calendarId: calendar.id,
        isVisible: !calendar.isVisible,
      });
    },
    [toggleCalendarVisibilityMutation],
  );

  const handleSelectMailbox = useCallback(
    (mailboxId: string) => {
      setSelectedMailboxId(mailboxId);
      void queryClient.invalidateQueries({ queryKey: ["mail", "messages"] });
      close();
      if (!isMailContext) {
        setTimeout(() => router.replace(MAIL_TAB_ROUTE as any), 80);
      }
    },
    [close, isMailContext, queryClient, router, setSelectedMailboxId],
  );

  const handleSelectCalendarDate = useCallback(
    (date: Date) => {
      setCurrentDate(date);
      setSelectedDate(date);
      close();

      if (isCalendarContext) {
        return;
      }

      setTimeout(() => router.replace(CALENDAR_TAB_ROUTE as any), 80);
    },
    [close, isCalendarContext, router, setCurrentDate, setSelectedDate],
  );

  return (
    <>
      {!isOpen && isMainScreen ? (
        <View
          {...edgePanResponder.panHandlers}
          style={[styles.edgeZone, { height: "100%", paddingTop: insets.top }]}
        />
      ) : null}

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
        <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="Close sidebar"
          />
        </Animated.View>

        <Animated.View
          {...closePanResponder.panHandlers}
          style={[
            styles.sidebar,
            { width: SIDEBAR_WIDTH, transform: [{ translateX }] },
          ]}
        >
            <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
              <View style={styles.headerRow}>
                <View style={styles.headerBrand}>
                  <Image source={logoSource} style={styles.logoImage} />
                  <Text style={styles.appName}>solace</Text>
                </View>
                <View style={styles.headerActions}>
                  <Pressable
                    onPress={handleOpenSearch}
                    style={({ pressed }) => [
                      styles.headerIconButton,
                      pressed && styles.pressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Search"
                  >
                    <Feather
                      name="search"
                      size={18}
                      color={theme.colors.mutedForeground}
                    />
                  </Pressable>
                  <Pressable
                    onPress={() => handleNavigate(SETTINGS_ROUTE)}
                    style={({ pressed }) => [
                      styles.avatarButton,
                      pressed && styles.pressed,
                    ]}
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
                      <View style={styles.avatarFallback}>
                        <Text style={styles.avatarText}>
                          {user?.name?.charAt(0)?.toUpperCase() ?? "?"}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                </View>
              </View>
            </View>

            <ScrollView
              style={styles.sidebarScroll}
              contentContainerStyle={styles.sidebarScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.sectionBlock}>
                <AppSwitcher onNavigate={close} />
              </View>

              {isMailContext ? (
                <MailSidebarBody
                  styles={styles}
                  theme={theme}
                  isLoading={
                    mailAccountQuery.isLoading || mailRuntimeQuery.isLoading
                  }
                  provisioned={mailProvisioned}
                  mailboxes={sortedMailboxes}
                  selectedMailboxId={selectedMailboxId}
                  onSelectMailbox={handleSelectMailbox}
                  onCompose={() => handleNavigate(`${MAIL_TAB_ROUTE}/compose`)}
                />
              ) : (
                <>
                  <View style={styles.sectionBlock}>
                <View style={styles.primaryActionRow}>
                  <Pressable
                    onPress={() => handleNavigate("/event/create")}
                    style={({ pressed }) => [
                      styles.newEventButton,
                      pressed && styles.newEventButtonPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Create new event"
                  >
                    <Feather
                      name="plus"
                      size={16}
                      color={theme.colors.primaryForeground}
                    />
                    <Text style={styles.newEventText}>New event</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => handleSelectCalendarDate(new Date())}
                    style={({ pressed }) => [
                      styles.todayButton,
                      pressed && styles.pressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Go to today"
                  >
                    <Text style={styles.todayButtonText}>Today</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.sectionBlock}>
                <SidebarMiniCalendar
                  weekStartDay={1}
                  selectedDate={selectedDate}
                  onDayPress={handleSelectCalendarDate}
                  timezone={resolvedTimezone}
                />
              </View>

              <View>
                <View style={styles.calendarsSectionHeader}>
                  <Text style={styles.sectionLabel}>Calendars</Text>
                  <View style={styles.calendarsSectionActions}>
                    <Pressable
                      onPress={() => handleNavigate("/calendar-manage/create")}
                      style={({ pressed }) => [
                        styles.sectionActionButton,
                        pressed && styles.pressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Create calendar"
                    >
                      <Feather
                        name="plus"
                        size={14}
                        color={theme.colors.mutedForeground}
                      />
                    </Pressable>
                    <Pressable
                      onPress={() => handleNavigate("/calendar-manage")}
                      style={({ pressed }) => [
                        styles.sectionActionButton,
                        pressed && styles.pressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Manage calendars"
                    >
                      <Feather
                        name="settings"
                        size={13}
                        color={theme.colors.mutedForeground}
                      />
                    </Pressable>
                  </View>
                </View>

                {calendarsLoading ? (
                  <InlineLoader theme={theme} />
                ) : calendars.length === 0 ? (
                  <Text style={styles.emptyText}>
                    No calendars yet. Tap + to create one.
                  </Text>
                ) : (
                  calendarSections.map((section) => (
                    <View key={section.key}>
                      {section.title ? (
                        <Text style={styles.sectionSeparator}>
                          {section.title}
                        </Text>
                      ) : null}
                      {section.rows.map((row) => {
                        const calendar = calendarById.get(row.id);
                        const isPending =
                          pendingVisibilityCalendarId === row.id;

                        return (
                          <Pressable
                            key={row.id}
                            onPress={() =>
                              calendar &&
                              handleToggleCalendarVisibility(calendar)
                            }
                            style={({ pressed }) => [
                              styles.calendarRow,
                              !row.isVisible && styles.calendarRowHidden,
                              pressed && styles.pressed,
                            ]}
                            accessibilityRole="button"
                            accessibilityLabel={`${row.isVisible ? "Hide" : "Show"} ${row.name}`}
                            accessibilityState={{ checked: row.isVisible }}
                          >
                            {isPending ? (
                              <ActivityIndicator
                                size="small"
                                color={theme.colors.primaryBase}
                                style={styles.calendarDotPlaceholder}
                              />
                            ) : (
                              <View
                                style={[
                                  styles.calendarDot,
                                  { backgroundColor: row.swatchColor },
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
                </>
              )}
            </ScrollView>
          </Animated.View>
      </View>
    </>
  );
}

function MailSidebarBody({
  styles,
  theme,
  isLoading,
  provisioned,
  mailboxes,
  selectedMailboxId,
  onSelectMailbox,
  onCompose,
}: {
  styles: ReturnType<typeof createStyles>;
  theme: ThemeTokens;
  isLoading: boolean;
  provisioned: boolean;
  mailboxes: { id: string; name: string; role?: string | null }[];
  selectedMailboxId: string | null;
  onSelectMailbox: (id: string) => void;
  onCompose: () => void;
}) {
  return (
    <>
      <View style={styles.sectionBlock}>
        <View style={styles.primaryActionRow}>
          <Pressable
            onPress={onCompose}
            style={({ pressed }) => [
              styles.newEventButton,
              pressed && styles.newEventButtonPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Compose message"
          >
            <Feather
              name="edit"
              size={16}
              color={theme.colors.primaryForeground}
            />
            <Text style={styles.newEventText}>Compose</Text>
          </Pressable>
        </View>
      </View>

      <View>
        <View style={styles.calendarsSectionHeader}>
          <Text style={styles.sectionLabel}>Mailboxes</Text>
        </View>

        {isLoading ? (
          <InlineLoader theme={theme} />
        ) : !provisioned ? (
          <Text style={styles.emptyText}>
            Your mailbox is being set up. Check back soon.
          </Text>
        ) : mailboxes.length === 0 ? (
          <Text style={styles.emptyText}>No mailboxes found.</Text>
        ) : (
          mailboxes.map((mailbox) => {
            const active = mailbox.id === selectedMailboxId;
            return (
              <Pressable
                key={mailbox.id}
                onPress={() => onSelectMailbox(mailbox.id)}
                style={({ pressed }) => [
                  styles.calendarRow,
                  active && styles.mailRowActive,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={mailbox.name}
              >
                <Feather
                  name={
                    getMailboxIcon(mailbox) as keyof typeof Feather.glyphMap
                  }
                  size={16}
                  color={
                    active
                      ? theme.colors.primaryBase
                      : theme.colors.mutedForeground
                  }
                />
                <Text
                  style={[
                    styles.calendarRowLabel,
                    active && styles.mailRowLabelActive,
                  ]}
                  numberOfLines={1}
                >
                  {mailbox.name}
                </Text>
              </Pressable>
            );
          })
        )}
      </View>
    </>
  );
}

function createStyles(theme: ThemeTokens) {
  const borderSubtle = theme.colors.border + "66";
  const borderMedium = theme.colors.border + "99";
  const primaryTint = theme.colors.primaryBase + "1A";

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
      borderRightColor: borderSubtle,
      zIndex: 10,
    },
    header: {
      paddingHorizontal: 20,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: borderSubtle,
    },
    headerRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
    },
    headerBrand: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 10,
    },
    logoImage: {
      width: 28,
      height: 28,
      borderRadius: 7,
    },
    headerActions: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 2,
    },
    headerIconButton: {
      width: 36,
      height: 36,
      borderRadius: theme.borderRadius.xl,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    avatarButton: {
      borderRadius: 16,
      marginLeft: 2,
    },
    avatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
    },
    avatarFallback: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: primaryTint,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    sidebarScroll: {
      flex: 1,
    },
    sidebarScrollContent: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 24,
    },
    sectionBlock: {
      marginBottom: 20,
    },
    primaryActionRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 10,
    },
    newEventButton: {
      flexDirection: "row" as const,
      flex: 1,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: 8,
      height: 44,
      borderRadius: 9999,
      backgroundColor: theme.colors.primaryBase,
    },
    newEventButtonPressed: {
      opacity: 0.85,
    },
    todayButton: {
      height: 44,
      paddingHorizontal: 16,
      borderRadius: theme.borderRadius.xl,
      borderWidth: 1,
      borderColor: borderMedium,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    calendarsSectionHeader: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      marginBottom: 6,
    },
    calendarsSectionActions: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 2,
    },
    sectionActionButton: {
      width: 28,
      height: 28,
      borderRadius: 9999,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    pressed: {
      opacity: 0.6,
    },
    calendarRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 12,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: theme.borderRadius.xl,
    },
    calendarRowHidden: {
      opacity: 0.5,
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
    mailRowActive: {
      backgroundColor: primaryTint,
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
      color: theme.colors.primaryBase,
    },
    newEventText: {
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: "600" as TextStyle["fontWeight"],
      color: theme.colors.primaryForeground,
    },
    todayButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: "500" as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    sectionLabel: {
      fontSize: 11,
      fontWeight: "600" as TextStyle["fontWeight"],
      color: theme.colors.mutedForeground,
      textTransform: "uppercase" as const,
      letterSpacing: 0.7,
    },
    sectionSeparator: {
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 2,
      fontSize: 10,
      fontWeight: "600" as TextStyle["fontWeight"],
      textTransform: "uppercase" as const,
      letterSpacing: 0.7,
      color: theme.colors.mutedForeground,
    },
    calendarRowLabel: {
      flex: 1,
      fontSize: 14,
      fontWeight: "500" as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    calendarRowLabelHidden: {
      color: theme.colors.mutedForeground,
    },
    mailRowLabelActive: {
      color: theme.colors.primaryBase,
      fontWeight: "600" as TextStyle["fontWeight"],
    },
    emptyText: {
      fontSize: theme.typography.fontSize.xs.size,
      color: theme.colors.mutedForeground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
