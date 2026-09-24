import {
  BackHandler,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type EffectCallback,
  type ReactNode,
} from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScrollView } from "react-native-gesture-handler";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type WithSpringConfig,
  type WithTimingConfig,
} from "react-native-reanimated";
import GorhomBottomSheet, {
  BottomSheetScrollView as GorhomBottomSheetScrollView,
  useBottomSheetInternal,
  type BottomSheetBackdropProps,
  type BottomSheetBackgroundProps,
} from "@gorhom/bottom-sheet";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../providers/ThemeProvider";
import type { ThemeTokens } from "@workspace/design-tokens";
import { LAYOUT_ICON, layoutSideSlot } from "../lib/app-layout";
import { useReduceMotion } from "../lib/use-reduce-motion";
import { splitSheetChildren } from "./sheet/sheet-children";
import { SheetViewport } from "./sheet/SheetViewport";

const SHEET_RADIUS = 20;
const SHEET_TOP_GAP = 16;
const HANDLE_PILL_WIDTH = 48;
const HANDLE_PILL_HEIGHT = 6;
const FOOTER_BASE_PADDING = 16;
const OVERLAY_LIGHT = 0.5;
const OVERLAY_DARK = 0.75;
/** Horizontal slop before the sheet pan gives way to horizontal gestures (page back-swipe, carousels). */
const PAN_FAIL_OFFSET_X: [number, number] = [-12, 12];
const PAN_ACTIVE_OFFSET_Y: [number, number] = [-6, 6];

const SHEET_SPRING: WithSpringConfig = {
  stiffness: 200,
  damping: 24,
  mass: 1,
  overshootClamping: false,
};
const SHEET_REDUCED: WithTimingConfig = {
  duration: 220,
  easing: Easing.out(Easing.cubic),
};

export interface BottomSheetProps {
  visible: boolean;
  onDismiss: () => void;
  onCloseComplete?: () => void;
  /** Fires once the open animation is running on the UI thread, so heavy content can mount without delaying it. */
  onOpenAnimationStart?: () => void;
  /** Changing this while visible replaces the sheet with a fresh one (e.g. a tap during a swipe-close). */
  presentKey?: number;
  children: ReactNode;
  /** Snap points as fractions of screen height (default [0.92]), capped just below the status bar. */
  snapPoints?: number[];
  /** Which snap index to open at. Default: last (tallest). */
  initialSnapIndex?: number;
  /** `extend` keeps the sheet in place under the keyboard, for content that pads itself above it. */
  keyboardBehavior?: "interactive" | "extend";
  /** Off for bodies with their own scrolling editor, so drags there never move the sheet. */
  enableContentPanningGesture?: boolean;
}

export interface BottomSheetHandle {
  dismiss: () => void;
  /** Snap to a specific snap index. */
  snapTo: (index: number) => void;
}

type BottomSheetContextValue = {
  dismiss: () => void;
};

const BottomSheetContext = createContext<BottomSheetContextValue | null>(null);

function useBottomSheetContext() {
  const context = useContext(BottomSheetContext);
  if (!context) {
    throw new Error("BottomSheet components must be used within a BottomSheet");
  }
  return context;
}

/** False for scroll views that are mounted but not the visible page (e.g. under an in-sheet push). */
const SheetScrollFocusContext = createContext(true);

export function SheetScrollFocusProvider({
  focused,
  children,
}: {
  focused: boolean;
  children: ReactNode;
}) {
  return (
    <SheetScrollFocusContext.Provider value={focused}>
      {children}
    </SheetScrollFocusContext.Provider>
  );
}

/** Registers a scroll view as the sheet's active scrollable only while its page is focused. */
function useSheetScrollFocusEffect(effect: EffectCallback) {
  const focused = useContext(SheetScrollFocusContext);
  useEffect(() => (focused ? effect() : undefined), [focused, effect]);
}

export function BottomSheetClose({
  onPress,
  accessibilityLabel = "Close",
}: {
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const { theme } = useTheme();
  const { dismiss } = useBottomSheetContext();
  const styles = useMemo(() => createCloseStyles(theme), [theme]);

  return (
    <Pressable
      onPress={onPress ?? dismiss}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
    >
      <Feather
        name="x"
        size={LAYOUT_ICON.close}
        color={theme.colors.foreground}
      />
    </Pressable>
  );
}

export function BottomSheetHeader({
  children,
  showClose = true,
  style,
}: {
  children: ReactNode;
  showClose?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createHeaderStyles(theme), [theme]);

  return (
    <View style={[styles.header, style]}>
      <View style={styles.titleSlot}>{children}</View>
      {showClose ? <BottomSheetClose /> : null}
    </View>
  );
}

BottomSheetHeader.displayName = "BottomSheetHeader";

export function BottomSheetTitle({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createTitleStyles(theme), [theme]);

  return (
    <Text style={[styles.title, style]} numberOfLines={1}>
      {children}
    </Text>
  );
}

export function BottomSheetBody({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createBodyStyles(theme), [theme]);

  return <View style={[styles.body, style]}>{children}</View>;
}

/** Sheet-aware scroll view: coordinates with the sheet drag inside a sheet, plain scroll view elsewhere. */
export function BottomSheetScrollView({
  children,
  style,
  contentContainerStyle,
  ...props
}: ComponentProps<typeof ScrollView>) {
  const sheet = useBottomSheetInternal(true);
  const shared = {
    keyboardShouldPersistTaps: "handled" as const,
    keyboardDismissMode: "on-drag" as const,
    showsVerticalScrollIndicator: false,
    ...props,
    style: [scrollViewStyles.scroll, style],
    contentContainerStyle,
  };

  if (sheet) {
    return (
      <GorhomBottomSheetScrollView
        {...shared}
        focusHook={useSheetScrollFocusEffect}
      >
        {children}
      </GorhomBottomSheetScrollView>
    );
  }

  return <ScrollView {...shared}>{children}</ScrollView>;
}

BottomSheetScrollView.displayName = "BottomSheetScrollView";

export function BottomSheetFooter({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createFooterStyles(theme), [theme]);
  const paddingBottom = Math.max(insets.bottom, FOOTER_BASE_PADDING);

  return (
    <View style={[styles.footer, style]}>
      <View style={{ paddingBottom }}>{children}</View>
    </View>
  );
}

BottomSheetFooter.displayName = "BottomSheetFooter";

function SheetBackdrop({
  animatedIndex,
  style,
  maxOpacity,
  onPress,
}: BottomSheetBackdropProps & { maxOpacity: number; onPress: () => void }) {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      animatedIndex.value,
      [-1, 0],
      [0, maxOpacity],
      Extrapolation.CLAMP,
    ),
  }));

  return (
    <Animated.View style={[style, backdropStyles.overlay, animatedStyle]}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Close sheet"
      />
    </Animated.View>
  );
}

export const BottomSheet = forwardRef<BottomSheetHandle, BottomSheetProps>(
  function BottomSheet(
    {
      visible,
      onDismiss,
      onCloseComplete,
      onOpenAnimationStart,
      presentKey,
      children,
      snapPoints: snapPointsProp = [0.92],
      initialSnapIndex,
      keyboardBehavior = "interactive",
      enableContentPanningGesture = true,
    },
    ref,
  ) {
    const { theme, isDark } = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const insets = useSafeAreaInsets();
    const { height: screenHeight } = useWindowDimensions();
    const reduceMotion = useReduceMotion();
    const sheetRef = useRef<GorhomBottomSheet>(null);
    // Every open is a fresh Gorhom sheet keyed by session; closing unmounts it at once so nothing lingers to block the next open.
    const [session, setSession] = useState(visible ? 1 : 0);
    const [mounted, setMounted] = useState(visible);
    const [closing, setClosing] = useState(false);
    const [presented, setPresented] = useState({ visible, presentKey });
    const keyboardVisibleRef = useRef(false);
    const visibleRef = useRef(visible);
    const sessionRef = useRef(session);
    const onCloseCompleteRef = useRef(onCloseComplete);
    // Keeps requestClose stable so the back handler isn't re-registered above in-sheet page handlers.
    const onDismissRef = useRef(onDismiss);
    useLayoutEffect(() => {
      visibleRef.current = visible;
      sessionRef.current = session;
      onCloseCompleteRef.current = onCloseComplete;
      onDismissRef.current = onDismiss;
    });
    const overlayMaxOpacity = isDark ? OVERLAY_DARK : OVERLAY_LIGHT;

    if (
      presented.visible !== visible ||
      (visible && presented.presentKey !== presentKey)
    ) {
      setPresented({ visible, presentKey });
      setClosing(false);
      setMounted(visible);
      if (visible) {
        setSession((current) => current + 1);
      }
    }

    const wasMountedRef = useRef(mounted);
    useEffect(() => {
      const wasMounted = wasMountedRef.current;
      wasMountedRef.current = mounted;
      if (wasMounted && !mounted) {
        Keyboard.dismiss();
        onCloseCompleteRef.current?.();
      }
    }, [mounted]);

    const topInset = insets.top + SHEET_TOP_GAP;
    const maxSnapFraction =
      screenHeight > 0
        ? Math.min(0.96, (screenHeight - topInset) / screenHeight)
        : 0.92;
    const snapPoints = useMemo(
      () =>
        [...snapPointsProp]
          .map((p) => Math.min(p, maxSnapFraction))
          .sort((a, b) => a - b)
          .map((p) => `${Math.round(p * 1000) / 10}%`),
      [snapPointsProp, maxSnapFraction],
    );
    const lastIndex = snapPoints.length - 1;
    const openIndex =
      initialSnapIndex !== undefined
        ? Math.min(initialSnapIndex, lastIndex)
        : lastIndex;

    const requestClose = useCallback(() => {
      Keyboard.dismiss();
      onDismissRef.current();
    }, []);

    const snapTo = useCallback(
      (index: number) => {
        sheetRef.current?.snapToIndex(Math.max(0, Math.min(index, lastIndex)));
      },
      [lastIndex],
    );

    useImperativeHandle(ref, () => ({ dismiss: requestClose, snapTo }), [
      requestClose,
      snapTo,
    ]);

    const contextValue = useMemo(
      (): BottomSheetContextValue => ({ dismiss: requestClose }),
      [requestClose],
    );

    // Grow to the tallest snap when the snap list itself changes (e.g. bulk mail more → move).
    const snapKey = snapPoints.join(",");
    const lastSnapKeyRef = useRef(snapKey);
    useEffect(() => {
      if (lastSnapKeyRef.current === snapKey) return;
      lastSnapKeyRef.current = snapKey;
      if (visibleRef.current) {
        sheetRef.current?.snapToIndex(lastIndex);
      }
    }, [snapKey, lastIndex]);

    useEffect(() => {
      if (!visible) {
        keyboardVisibleRef.current = false;
        return;
      }
      const showEvent =
        Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
      const hideEvent =
        Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
      const s1 = Keyboard.addListener(showEvent, () => {
        keyboardVisibleRef.current = true;
      });
      const s2 = Keyboard.addListener(hideEvent, () => {
        keyboardVisibleRef.current = false;
      });
      return () => {
        s1.remove();
        s2.remove();
      };
    }, [visible]);

    useEffect(() => {
      if (!visible) {
        return;
      }

      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        () => {
          if (keyboardVisibleRef.current) {
            Keyboard.dismiss();
            return true;
          }
          requestClose();
          return true;
        },
      );

      return () => subscription.remove();
    }, [visible, requestClose]);

    // Callbacks from a replaced session can land after it unmounts; only the current session counts.
    const sessionCallbacks = useMemo(() => {
      const isCurrent = () => sessionRef.current === session;
      return {
        onAnimate: (fromIndex: number, toIndex: number) => {
          if (!isCurrent()) return;
          // Gorhom reports a close target on swipe release; taps pass through while the spring settles.
          setClosing(toIndex < 0);
          if (fromIndex < 0 && toIndex >= 0) {
            onOpenAnimationStart?.();
          }
        },
        onClose: () => {
          if (isCurrent() && visibleRef.current) {
            requestClose();
          }
        },
      };
    }, [session, onOpenAnimationStart, requestClose]);

    const handleOverlayPress = useCallback(() => {
      if (keyboardVisibleRef.current) {
        Keyboard.dismiss();
        return;
      }
      requestClose();
    }, [requestClose]);

    const { body, footer, header } = useMemo(
      () => splitSheetChildren(children),
      [children],
    );
    const handleDivider = header == null;

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <SheetBackdrop
          {...props}
          maxOpacity={overlayMaxOpacity}
          onPress={handleOverlayPress}
        />
      ),
      [overlayMaxOpacity, handleOverlayPress],
    );

    const renderBackground = useCallback(
      ({ style }: BottomSheetBackgroundProps) => (
        <View style={[style, styles.background]} />
      ),
      [styles.background],
    );

    const renderHandle = useCallback(
      () => (
        <View
          style={[
            styles.handleArea,
            handleDivider ? styles.handleDivider : null,
          ]}
        >
          <View style={styles.handlePill} />
        </View>
      ),
      [styles, handleDivider],
    );

    if (!mounted) return null;

    return (
      <BottomSheetContext.Provider value={contextValue}>
        <View
          style={styles.wrapper}
          pointerEvents={closing ? "none" : "box-none"}
        >
          <GorhomBottomSheet
            key={session}
            ref={sheetRef}
            index={openIndex}
            snapPoints={snapPoints}
            enableDynamicSizing={false}
            enableContentPanningGesture={enableContentPanningGesture}
            enableHandlePanningGesture
            enablePanDownToClose
            animateOnMount
            animationConfigs={reduceMotion ? SHEET_REDUCED : SHEET_SPRING}
            enableOverDrag={!reduceMotion}
            topInset={topInset}
            failOffsetX={PAN_FAIL_OFFSET_X}
            activeOffsetY={PAN_ACTIVE_OFFSET_Y}
            keyboardBehavior={keyboardBehavior}
            keyboardBlurBehavior="restore"
            android_keyboardInputMode="adjustResize"
            backdropComponent={renderBackdrop}
            backgroundComponent={renderBackground}
            handleComponent={renderHandle}
            onClose={sessionCallbacks.onClose}
            onAnimate={sessionCallbacks.onAnimate}
            style={styles.sheetShadow}
          >
            <SheetViewport>
              {header}
              <View style={styles.bodySlot}>{body}</View>
              {footer}
            </SheetViewport>
          </GorhomBottomSheet>
        </View>
      </BottomSheetContext.Provider>
    );
  },
);

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    wrapper: {
      ...StyleSheet.absoluteFill,
      zIndex: 1000,
    } as ViewStyle,

    background: {
      backgroundColor: theme.colors.card,
      borderTopLeftRadius: SHEET_RADIUS,
      borderTopRightRadius: SHEET_RADIUS,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
      overflow: "hidden",
    },

    sheetShadow: {
      borderTopLeftRadius: SHEET_RADIUS,
      borderTopRightRadius: SHEET_RADIUS,
      ...(Platform.OS === "ios"
        ? {
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.18,
            shadowRadius: 24,
          }
        : { elevation: 24 }),
    },

    handleArea: {
      alignItems: "center",
      justifyContent: "center",
      paddingTop: 10,
      paddingBottom: 4,
    } as ViewStyle,

    handleDivider: {
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    } as ViewStyle,

    handlePill: {
      width: HANDLE_PILL_WIDTH,
      height: HANDLE_PILL_HEIGHT,
      borderRadius: 3,
      backgroundColor: theme.colors.mutedForeground + "99",
    } as ViewStyle,

    bodySlot: {
      flex: 1,
      minHeight: 0,
    },
  });
}

const backdropStyles = StyleSheet.create({
  overlay: {
    backgroundColor: "#000",
  },
});

function createHeaderStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing["2"],
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["3"],
      backgroundColor: theme.colors.card,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    } as ViewStyle,
    titleSlot: {
      flex: 1,
      minWidth: 0,
    } as ViewStyle,
  });
}

function createTitleStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    title: {
      fontSize: theme.typography.fontSize.xl.size,
      lineHeight: theme.typography.fontSize.xl.lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    } as TextStyle,
  });
}

function createBodyStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    body: {
      paddingHorizontal: theme.spacing["4"],
    } as ViewStyle,
  });
}

function createFooterStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    footer: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
      backgroundColor: theme.colors.card,
      paddingHorizontal: theme.spacing["4"],
      paddingTop: theme.spacing["4"],
    } as ViewStyle,
  });
}

function createCloseStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    button: layoutSideSlot(theme),
    pressed: { opacity: 0.6 } as ViewStyle,
  });
}

const scrollViewStyles = StyleSheet.create({
  scroll: {
    flex: 1,
    minHeight: 0,
  },
});
