import * as React from "react";
import { Dimensions, Pressable, ScrollView, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { cn } from "../../lib/utils";
import type { Calendar, CalendarEvent, User } from "../calendar/types";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { SidebarCalendar } from "../navigation/sidebar-calendar.native";

const DRAWER_WIDTH = Math.min(Dimensions.get("window").width * 0.88, 380);

const CALENDAR_COLOR_CLASSES: Record<string, string> = {
  blue: "bg-event-blue",
  sky: "bg-event-blue",
  violet: "bg-event-violet",
  purple: "bg-event-violet",
  orange: "bg-event-orange",
  rose: "bg-event-rose",
  emerald: "bg-event-emerald",
  green: "bg-event-emerald",
};

interface MobileSidebarDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: User;
  calendars: Calendar[];
  calendarVisibility: Record<string, boolean>;
  savingCalendarId?: string | null;
  onToggleCalendar: (calendarId: string) => void | Promise<void>;
  events?: CalendarEvent[];
  currentDate: Date;
  onCurrentDateChange: (date: Date) => void;
  onMiniCalendarMonthChange?: (dateRange: { start: Date; end: Date }) => void;
  onCreateEvent?: () => void;
  onOpenSettings?: () => void;
  onOpenCalendarManagement?: () => void;
}

export function MobileSidebarDrawer({
  open,
  onOpenChange,
  user,
  calendars,
  calendarVisibility,
  savingCalendarId,
  onToggleCalendar,
  events,
  currentDate,
  onCurrentDateChange,
  onMiniCalendarMonthChange,
  onCreateEvent,
  onOpenSettings,
  onOpenCalendarManagement,
}: MobileSidebarDrawerProps) {
  const [isMounted, setIsMounted] = React.useState(open);
  const translateX = useSharedValue(open ? 0 : -DRAWER_WIDTH);
  const gestureStartX = useSharedValue(-DRAWER_WIDTH);

  React.useEffect(() => {
    if (open) {
      setIsMounted(true);
      translateX.value = withSpring(0, { damping: 22, stiffness: 260 });
      return;
    }

    if (!isMounted) {
      translateX.value = -DRAWER_WIDTH;
      return;
    }

    translateX.value = withSpring(
      -DRAWER_WIDTH,
      { damping: 24, stiffness: 300 },
      (finished) => {
        if (finished) {
          runOnJS(setIsMounted)(false);
        }
      },
    );
  }, [isMounted, open, translateX]);

  const edgeSwipeGesture = React.useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([10, 9999])
        .onBegin(() => {
          if (open) return;
          runOnJS(setIsMounted)(true);
          gestureStartX.value = -DRAWER_WIDTH;
          translateX.value = -DRAWER_WIDTH;
        })
        .onUpdate((event) => {
          if (open && event.translationX < 0) return;
          if (event.translationX <= 0) return;

          const nextX = Math.min(0, -DRAWER_WIDTH + event.translationX);
          translateX.value = nextX;
        })
        .onEnd((event) => {
          const shouldOpen = event.translationX > DRAWER_WIDTH * 0.25 || event.velocityX > 650;

          if (shouldOpen) {
            translateX.value = withSpring(0, { damping: 22, stiffness: 260 });
            runOnJS(onOpenChange)(true);
            return;
          }

          translateX.value = withSpring(
            -DRAWER_WIDTH,
            { damping: 24, stiffness: 300 },
            (finished) => {
              if (finished) {
                runOnJS(setIsMounted)(false);
              }
            },
          );
          runOnJS(onOpenChange)(false);
        }),
    [gestureStartX, onOpenChange, open, translateX],
  );

  const drawerPanGesture = React.useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          gestureStartX.value = translateX.value;
        })
        .onUpdate((event) => {
          const nextX = Math.max(
            -DRAWER_WIDTH,
            Math.min(0, gestureStartX.value + event.translationX),
          );
          translateX.value = nextX;
        })
        .onEnd((event) => {
          const shouldClose =
            event.velocityX < -650 || translateX.value < -DRAWER_WIDTH * 0.45;

          if (shouldClose) {
            translateX.value = withSpring(
              -DRAWER_WIDTH,
              { damping: 24, stiffness: 300 },
              (finished) => {
                if (finished) {
                  runOnJS(setIsMounted)(false);
                }
              },
            );
            runOnJS(onOpenChange)(false);
            return;
          }

          translateX.value = withSpring(0, { damping: 22, stiffness: 260 });
          runOnJS(onOpenChange)(true);
        }),
    [gestureStartX, onOpenChange, translateX],
  );

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => {
    const progress = Math.max(0, Math.min(1, 1 + translateX.value / DRAWER_WIDTH));
    return {
      opacity: progress * 0.55,
    };
  });

  const initials = (user?.name || "Guest User")
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleCreateEvent = () => {
    onCreateEvent?.();
    onOpenChange(false);
  };

  return (
    <>
      <GestureDetector gesture={edgeSwipeGesture}>
        <View className="absolute left-0 top-0 z-40 h-full w-6" pointerEvents={open ? "none" : "auto"} />
      </GestureDetector>

      {isMounted ? (
        <View className="absolute inset-0 z-50" pointerEvents="box-none">
          <Pressable className="absolute inset-0" onPress={() => onOpenChange(false)}>
            <Animated.View className="absolute inset-0 bg-black/40" style={backdropStyle} />
          </Pressable>

          <GestureDetector gesture={drawerPanGesture}>
            <Animated.View
              className="absolute inset-y-0 left-0 w-[88%] max-w-[380px] border-r border-border bg-background"
              style={panelStyle}
            >
              <View className="flex-row items-center justify-between px-6 pb-2 pt-6">
                <View className="flex-row items-center gap-3">
                  <View className="size-10 items-center justify-center rounded-xl bg-primary/10">
                    <Text className="text-base font-black text-primary">S</Text>
                  </View>
                  <Text className="text-xl font-extrabold tracking-tight text-foreground">Workspace</Text>
                </View>

                <Pressable
                  onPress={() => onOpenChange(false)}
                  className="min-h-11 min-w-11 items-center justify-center rounded-xl bg-muted/40 px-3"
                  accessibilityRole="button"
                  accessibilityLabel="Close sidebar"
                >
                  <Text className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Close</Text>
                </Pressable>
              </View>

              <ScrollView className="flex-1 px-6">
                <View className="pb-32 pt-2">
                  <View className="space-y-3">
                  <Text className="px-1 text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                    User
                  </Text>
                  <Pressable
                    className="flex-row items-center gap-3 rounded-[22px] border border-border bg-background p-4 active:scale-[0.99]"
                    onPress={onOpenSettings}
                  >
                    <Avatar className="size-10 rounded-xl shadow-none">
                      <AvatarImage src={user?.avatar} alt={user?.name || "Guest User"} className="rounded-xl" />
                      <AvatarFallback className="rounded-xl bg-transparent text-primary font-bold text-sm">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <View className="flex-1">
                      <Text className="text-sm font-bold text-foreground">{user?.name || "Guest User"}</Text>
                      <Text className="text-[11px] text-muted-foreground" numberOfLines={1}>
                        {user?.email || "guest@example.com"}
                      </Text>
                    </View>
                  </Pressable>
                  </View>

                  <View className="mt-6 space-y-4">
                    <Text className="px-1 text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                      Calendar Preview
                    </Text>
                    <View className="rounded-[32px] border border-border/50 bg-muted/30 p-5 shadow-sm">
                      <SidebarCalendar
                        events={events}
                        onDisplayMonthChange={onMiniCalendarMonthChange}
                        isMobile={true}
                        currentDate={currentDate}
                        onCurrentDateChange={onCurrentDateChange}
                      />
                    </View>
                  </View>

                  <View className="mt-6 space-y-4">
                    <View className="flex-row items-center justify-between px-1">
                      <Text className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                        Your Calendars
                      </Text>
                      <Pressable
                        className="min-h-11 justify-center rounded-lg bg-muted px-3"
                        onPress={onOpenCalendarManagement}
                      >
                        <Text className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                          Manage
                        </Text>
                      </Pressable>
                    </View>

                    <View className="gap-2">
                      {calendars.map((calendar) => {
                        const isVisible = calendarVisibility[calendar.id] ?? calendar.isVisible;
                        const colorClass = CALENDAR_COLOR_CLASSES[(calendar.color || "").toLowerCase()];
                        const colorStyle =
                          !colorClass && calendar.color?.startsWith("#")
                            ? { backgroundColor: calendar.color }
                            : undefined;

                        return (
                          <Pressable
                            key={calendar.id}
                            onPress={() => void onToggleCalendar(calendar.id)}
                            className={cn(
                              "w-full flex-row items-center justify-between gap-4 rounded-[22px] border p-4 transition-all active:scale-[0.99]",
                              isVisible
                                ? "border-border bg-background shadow-sm"
                                : "border-transparent bg-muted/20 opacity-60",
                            )}
                          >
                            <View className="flex-1 flex-row items-center gap-4">
                              <View
                                className={cn(
                                  "size-6 items-center justify-center rounded-lg border transition-all",
                                  isVisible ? "border-primary bg-primary" : "border-primary/20 bg-background",
                                )}
                              >
                                {isVisible ? (
                                  <Text className="text-[11px] font-black text-primary-foreground">✓</Text>
                                ) : null}
                              </View>

                              <Text
                                className={cn(
                                  "text-[15px] font-bold transition-colors",
                                  isVisible ? "text-foreground" : "text-foreground/40",
                                )}
                              >
                                {calendar.name}
                              </Text>
                            </View>

                            <View className="items-end gap-1">
                              <View className={cn("size-2 rounded-full", colorClass)} style={colorStyle} />
                              {savingCalendarId === calendar.id ? (
                                <Text className="text-[10px] font-bold text-muted-foreground">Saving…</Text>
                              ) : null}
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </View>
              </ScrollView>

              <View className="absolute bottom-6 right-6">
                <Pressable
                  onPress={handleCreateEvent}
                  className="h-20 w-20 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-2xl shadow-primary/30 active:scale-95"
                >
                  <Text className="text-4xl font-black text-primary-foreground">+</Text>
                  <Text className="mt-[-4px] text-[10px] font-black uppercase tracking-widest text-primary-foreground/80">
                    New
                  </Text>
                </Pressable>
              </View>
            </Animated.View>
          </GestureDetector>
        </View>
      ) : null}
    </>
  );
}
