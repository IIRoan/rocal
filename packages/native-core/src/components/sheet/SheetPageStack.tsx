import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  BackHandler,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type TextStyle,
  type ViewStyle,
} from "react-native";
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
import { useTheme } from "../../providers/ThemeProvider";
import { SheetScrollFocusProvider } from "../BottomSheet";
import { HeaderIconButton } from "../layout/HeaderIconButton";
import { LAYOUT_METRICS } from "../../lib/app-layout";
import {
  popSheetPage,
  pushSheetPage,
  sheetPageTranslateX,
  topSheetPage,
} from "../../lib/settings-sheet-stack";

const PAGE_SLIDE_MS = 260;
const PAGE_SLIDE_EASING = Easing.out(Easing.cubic);
const BACK_SWIPE_COMMIT_FRACTION = 0.35;
const BACK_SWIPE_VELOCITY = 500;

/** Page stack state for a drawer whose sub-pages slide in-sheet instead of opening routes. */
export function useSheetPageStack(rootPage: string, active: boolean) {
  const [stack, setStack] = useState<string[]>([rootPage]);
  // Fractional index of the visible page; animating it drives every page's slide.
  const position = useSharedValue(0);
  const page = topSheetPage(stack, rootPage);
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

  const push = useCallback(
    (nextPage: string) => {
      if (nextPage === page) {
        return;
      }
      const next = pushSheetPage(stack, nextPage);
      setStack(next);
      cancelAnimation(position);
      position.value = withTiming(next.length - 1, {
        duration: PAGE_SLIDE_MS,
        easing: PAGE_SLIDE_EASING,
      });
    },
    [page, position, stack],
  );

  const pop = useCallback(() => {
    if (stack.length <= 1) {
      return;
    }
    cancelAnimation(position);
    animatePopTo(popSheetPage(stack, rootPage).length - 1);
  }, [animatePopTo, position, rootPage, stack]);

  const reset = useCallback(() => {
    cancelAnimation(position);
    position.value = 0;
    setStack([rootPage]);
  }, [position, rootPage]);

  useEffect(() => {
    if (!active || stack.length <= 1) {
      return;
    }
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      pop();
      return true;
    });
    return () => subscription.remove();
  }, [active, stack.length, pop]);

  return { stack, page, topIndex, position, push, pop, animatePopTo, reset };
}

export type SheetPageStackState = ReturnType<typeof useSheetPageStack>;

interface SheetPageNavigator {
  push: (page: string) => void;
  back: () => void;
}

const SheetPageNavigatorContext = createContext<SheetPageNavigator | null>(null);

/** In-sheet navigation for pages rendered by a SheetPageStack. */
export function useSheetPageNavigator(): SheetPageNavigator {
  const context = useContext(SheetPageNavigatorContext);
  if (!context) {
    throw new Error("useSheetPageNavigator must be used inside a SheetPageStack");
  }
  return context;
}

/** Renders the visible page and the one beneath it, with slide animation and swipe-back. */
export function SheetPageStack({
  state,
  renderPage,
}: {
  state: SheetPageStackState;
  renderPage: (page: string) => ReactNode;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { width: screenWidth } = useWindowDimensions();
  const { stack, topIndex, position, push, pop, animatePopTo } = state;

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
          position.value = topIndex - clamp(event.translationX / screenWidth, 0, 1);
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

  const navigator = useMemo(() => ({ push, back: pop }), [push, pop]);
  const firstRenderedIndex = Math.max(0, stack.length - 2);

  return (
    <SheetPageNavigatorContext.Provider value={navigator}>
      <GestureDetector gesture={backGesture}>
        <View style={styles.pageStack}>
          {stack.slice(firstRenderedIndex).map((pageId, offset) => {
            const index = firstRenderedIndex + offset;
            return (
              <SheetPageSlot
                key={`${index}:${pageId}`}
                index={index}
                position={position}
                width={screenWidth}
                isTop={index === topIndex}
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
    </SheetPageNavigatorContext.Provider>
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
  children: ReactNode;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: sheetPageTranslateX(index, position.value, width) }],
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

/** Page chrome: back chevron (omitted on a root page), centered title, optional trailing action, then the body. */
export function SheetSubPage({
  title,
  backLabel,
  rightAction,
  children,
}: {
  title: string;
  backLabel?: string;
  rightAction?: ReactNode;
  children: ReactNode;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { back } = useSheetPageNavigator();

  return (
    <View style={styles.page}>
      <View style={styles.pageHeader}>
        {backLabel ? (
          <HeaderIconButton name="chevron-left" onPress={back} accessibilityLabel={backLabel} />
        ) : (
          <View style={styles.pageHeaderSpacer} />
        )}
        <Text style={styles.pageTitle} numberOfLines={1}>
          {title}
        </Text>
        {rightAction ?? <View style={styles.pageHeaderSpacer} />}
      </View>
      <View style={styles.pageBody}>{children}</View>
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  const view = {
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
    pageTitle: {
      flex: 1,
      textAlign: "center" as const,
      fontSize: theme.typography.fontSize.lg.size,
      lineHeight: theme.typography.fontSize.lg.lineHeight,
      fontWeight: theme.typography.fontWeight.semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
