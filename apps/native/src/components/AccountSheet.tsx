import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  cancelAnimation,
  clamp,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../providers/ThemeProvider";
import { useAuth } from "../providers/AuthProvider";
import { useToast } from "../providers/ToastProvider";
import {
  BottomSheet,
  BottomSheetScrollView,
  SheetScrollFocusProvider,
} from "./BottomSheet";
import { BlobatarAvatar } from "./BlobatarAvatar";
import { WorkspaceAppSwitch } from "./WorkspaceAppSwitch";
import { SheetPortalHostProvider } from "./SheetPortal";
import { HeaderIconButton } from "./layout/HeaderIconButton";
import { SettingsSheetPageProvider } from "./settings/SettingsPage";
import {
  SETTINGS_SHEET_PAGES,
  settingsSheetPageTitle,
} from "./settings/sections";
import { buildAccountSheetGroups } from "../lib/account-sheet-model";
import {
  popSheetPage,
  pushSheetPage,
  sheetPageTranslateX,
  topSheetPage,
} from "../lib/settings-sheet-stack";
import { SETTINGS_HUB_ICONS, SETTINGS_MAIL_ICONS } from "../lib/settings-nav-icons";
import { useDeferredSheetAction } from "../hooks/use-deferred-sheet-action";
import { LAYOUT_METRICS } from "../lib/app-layout";
import type { AppSwitchKey } from "../lib/app-switcher-config";
import { useWorkspaceTabSwitch } from "../lib/use-workspace-tab-switch";

const ROW_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  ...SETTINGS_HUB_ICONS,
  ...SETTINGS_MAIL_ICONS,
};

const ROOT_PAGE = "root";
const PAGE_SLIDE_MS = 260;
const PAGE_SLIDE_EASING = Easing.out(Easing.cubic);
const BACK_SWIPE_COMMIT_FRACTION = 0.35;
const BACK_SWIPE_VELOCITY = 500;

interface AccountSheetProps {
  visible: boolean;
  activeApp: AppSwitchKey;
  onDismiss: () => void;
}

/** Account drawer: profile, app switch, and searchable settings that open in-sheet. */
export function AccountSheet({ visible, activeApp, onDismiss }: AccountSheetProps) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { width: screenWidth } = useWindowDimensions();
  const [query, setQuery] = useState("");
  const groups = useMemo(() => buildAccountSheetGroups(query), [query]);
  const { runAfterClose, onCloseComplete } = useDeferredSheetAction(onDismiss);
  const switchTab = useWorkspaceTabSwitch();

  const [stack, setStack] = useState<string[]>([ROOT_PAGE]);
  // Fractional index of the visible page; animating it drives every page's slide.
  const position = useSharedValue(0);
  const page = topSheetPage(stack, ROOT_PAGE);
  const topIndex = stack.length - 1;

  const commitPop = useCallback((length: number) => {
    setStack((current) => current.slice(0, Math.max(1, length)));
  }, []);

  const animatePopTo = useCallback(
    (targetIndex: number) => {
      "worklet";
      position.value = withTiming(
        targetIndex,
        { duration: PAGE_SLIDE_MS, easing: PAGE_SLIDE_EASING },
        (finished) => {
          if (finished) {
            scheduleOnRN(commitPop, targetIndex + 1);
          }
        },
      );
    },
    [commitPop, position],
  );

  const pushPage = useCallback(
    (pagePath: string) => {
      const id = pagePath.split("/").filter(Boolean).pop() ?? ROOT_PAGE;
      if (!SETTINGS_SHEET_PAGES[id]) {
        runAfterClose(() => router.push(pagePath as never));
        return;
      }
      if (id === page) {
        return;
      }
      const next = pushSheetPage(stack, id);
      setStack(next);
      cancelAnimation(position);
      position.value = withTiming(next.length - 1, {
        duration: PAGE_SLIDE_MS,
        easing: PAGE_SLIDE_EASING,
      });
      setQuery("");
    },
    [page, position, router, runAfterClose, stack],
  );

  const popPage = useCallback(() => {
    if (stack.length <= 1) {
      return;
    }
    cancelAnimation(position);
    animatePopTo(popSheetPage(stack, ROOT_PAGE).length - 1);
  }, [animatePopTo, position, stack]);

  useEffect(() => {
    if (!visible || stack.length <= 1) {
      return;
    }
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        popPage();
        return true;
      },
    );
    return () => subscription.remove();
  }, [visible, stack.length, popPage]);

  const backGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(topIndex > 0)
        .activeOffsetX(12)
        .failOffsetX(-12)
        .failOffsetY([-12, 12])
        .onStart(() => {
          "worklet";
          cancelAnimation(position);
        })
        .onUpdate((event) => {
          "worklet";
          position.value =
            topIndex - clamp(event.translationX / screenWidth, 0, 1);
        })
        .onEnd((event) => {
          "worklet";
          const progress = topIndex - position.value;
          if (
            progress > BACK_SWIPE_COMMIT_FRACTION ||
            event.velocityX > BACK_SWIPE_VELOCITY
          ) {
            animatePopTo(topIndex - 1);
          } else {
            position.value = withTiming(topIndex, {
              duration: PAGE_SLIDE_MS,
              easing: PAGE_SLIDE_EASING,
            });
          }
        }),
    [animatePopTo, position, screenWidth, topIndex],
  );

  const displayName = user?.name || user?.email?.split("@")[0] || "";

  const copyEmail = async () => {
    if (!user?.email) return;
    await Clipboard.setStringAsync(user.email);
    toast("Email copied");
  };

  const resetSheetState = () => {
    setQuery("");
    cancelAnimation(position);
    position.value = 0;
    setStack([ROOT_PAGE]);
  };

  const rootList = (
    <BottomSheetScrollView contentContainerStyle={styles.content}>
      <View style={styles.profile}>
        <BlobatarAvatar
          email={user?.email}
          name={user?.name}
          src={user?.image}
          size={88}
          borderRadius={theme.borderRadius.xl}
        />
        <Text style={styles.name} numberOfLines={1}>
          {displayName}
        </Text>
        {user?.email ? (
          <Pressable
            onPress={() => void copyEmail()}
            hitSlop={8}
            style={({ pressed }) => [styles.emailRow, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Copy email address"
          >
            <Text style={styles.email} numberOfLines={1}>
              {user.email}
            </Text>
            <Feather name="copy" size={13} color={theme.colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>

      <WorkspaceAppSwitch
        activeApp={activeApp}
        onSwitch={(app) => runAfterClose(() => switchTab(app))}
      />

      <View style={styles.search}>
        <Feather name="search" size={16} color={theme.colors.mutedForeground} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search"
          placeholderTextColor={theme.colors.mutedForeground}
          style={styles.searchInput}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel="Search settings"
        />
      </View>

      {groups.length === 0 ? (
        <Text style={styles.empty}>No settings match “{query.trim()}”.</Text>
      ) : (
        groups.map((group) => (
          <View key={group.title} style={styles.group}>
            <Text style={styles.groupTitle}>{group.title}</Text>
            {group.rows.map((row) => (
              <Pressable
                key={row.id}
                onPress={() => pushPage(row.route)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                accessibilityRole="button"
                accessibilityLabel={row.label}
                accessibilityHint={row.description}
              >
                <View style={styles.rowIcon}>
                  <Feather
                    name={ROW_ICONS[row.id] ?? "settings"}
                    size={16}
                    color={theme.colors.mutedForeground}
                  />
                </View>
                <Text style={styles.rowLabel} numberOfLines={1}>
                  {row.label}
                </Text>
                <Feather
                  name="chevron-right"
                  size={18}
                  color={theme.colors.mutedForeground}
                />
              </Pressable>
            ))}
          </View>
        ))
      )}
    </BottomSheetScrollView>
  );

  const renderPage = (pageId: string) => {
    if (pageId === ROOT_PAGE) {
      return rootList;
    }
    const Content = SETTINGS_SHEET_PAGES[pageId];
    if (!Content) {
      return null;
    }
    return (
      <View style={styles.page}>
        <View style={styles.pageHeader}>
          <HeaderIconButton
            name="chevron-left"
            onPress={popPage}
            accessibilityLabel="Back to settings"
          />
          <Text style={styles.pageTitle} numberOfLines={1}>
            {settingsSheetPageTitle(pageId)}
          </Text>
          <View style={styles.pageHeaderSpacer} />
        </View>
        <View style={styles.pageBody}>
          <Content />
        </View>
      </View>
    );
  };

  const firstRenderedIndex = Math.max(0, stack.length - 2);

  return (
    <SheetPortalHostProvider>
      <BottomSheet
        visible={visible}
        onDismiss={onDismiss}
        onCloseComplete={() => {
          resetSheetState();
          onCloseComplete();
        }}
        snapPoints={[0.92]}
      >
        <SettingsSheetPageProvider push={pushPage} back={popPage}>
          <GestureDetector gesture={backGesture}>
            <View style={styles.pageStack}>
              {stack.slice(firstRenderedIndex).map((pageId, offset) => {
                const index = firstRenderedIndex + offset;
                const isTop = index === topIndex;
                return (
                  <SheetPageSlot
                    key={`${index}:${pageId}`}
                    index={index}
                    position={position}
                    width={screenWidth}
                    isTop={isTop}
                    overlay={index > 0}
                    style={styles.pageSlot}
                    overlayStyle={styles.pageSlotOverlay}
                  >
                    {renderPage(pageId)}
                  </SheetPageSlot>
                );
              })}
            </View>
          </GestureDetector>
        </SettingsSheetPageProvider>
      </BottomSheet>
    </SheetPortalHostProvider>
  );
}

function SheetPageSlot({
  index,
  position,
  width,
  isTop,
  overlay,
  style,
  overlayStyle,
  children,
}: {
  index: number;
  position: SharedValue<number>;
  width: number;
  isTop: boolean;
  overlay: boolean;
  style: ViewStyle;
  overlayStyle: ViewStyle;
  children: React.ReactNode;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: sheetPageTranslateX(index, position.value, width) },
    ],
  }));

  return (
    <Animated.View
      style={[style, overlay && overlayStyle, animatedStyle]}
      pointerEvents={isTop ? "auto" : "none"}
      accessibilityElementsHidden={!isTop}
      importantForAccessibility={isTop ? "auto" : "no-hide-descendants"}
    >
      <SheetScrollFocusProvider focused={isTop}>{children}</SheetScrollFocusProvider>
    </Animated.View>
  );
}

function createStyles(theme: ThemeTokens) {
  const view = {
    content: {
      paddingHorizontal: theme.spacing["4"],
      paddingBottom: theme.spacing["10"],
      gap: theme.spacing["4"],
    },
    profile: {
      alignItems: "center" as const,
      gap: theme.spacing["1"],
      paddingTop: theme.spacing["2"],
    },
    emailRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
      maxWidth: "90%" as const,
    },
    pressed: {
      opacity: 0.6,
    },
    search: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["2"],
      height: 44,
      paddingHorizontal: theme.spacing["3"],
      borderRadius: theme.borderRadius.lg,
      backgroundColor: theme.colors.muted,
    },
    group: {
      gap: 2,
    },
    row: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["3"],
      minHeight: 52,
      paddingHorizontal: theme.spacing["1"],
      borderRadius: theme.borderRadius.md,
    },
    rowPressed: {
      backgroundColor: theme.colors.foreground + "0f",
    },
    rowIcon: {
      width: 24,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    pageStack: {
      flex: 1,
      minHeight: 0,
      overflow: "hidden" as const,
    },
    pageSlot: {
      flex: 1,
      minHeight: 0,
    },
    pageSlotOverlay: {
      position: "absolute" as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: theme.colors.card,
    },
    page: {
      flex: 1,
      minHeight: 0,
    },
    pageHeader: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["1"],
      minHeight: LAYOUT_METRICS.headerMinHeight,
      paddingHorizontal: theme.spacing["2"],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    pageHeaderSpacer: {
      width: LAYOUT_METRICS.sideSlot,
    },
    pageBody: {
      flex: 1,
      minHeight: 0,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    name: {
      marginTop: theme.spacing["2"],
      fontSize: 18,
      lineHeight: 24,
      fontWeight: "700" as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    email: {
      flexShrink: 1,
      fontSize: 14,
      lineHeight: 19,
      color: theme.colors.mutedForeground,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      color: theme.colors.foreground,
      paddingVertical: 0,
    },
    empty: {
      textAlign: "center" as const,
      fontSize: 14,
      lineHeight: 19,
      color: theme.colors.mutedForeground,
      paddingVertical: theme.spacing["4"],
    },
    groupTitle: {
      fontSize: 14,
      lineHeight: 19,
      fontWeight: "500" as TextStyle["fontWeight"],
      color: theme.colors.mutedForeground,
      marginBottom: theme.spacing["1"],
    },
    rowLabel: {
      flex: 1,
      fontSize: 16,
      lineHeight: 21,
      fontWeight: "500" as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    pageTitle: {
      flex: 1,
      textAlign: "center" as const,
      fontSize: theme.typography.fontSize.lg.size,
      lineHeight: theme.typography.fontSize.lg.lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
