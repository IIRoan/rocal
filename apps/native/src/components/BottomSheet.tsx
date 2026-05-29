import {
  Animated,
  Keyboard,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type KeyboardEvent as RNKeyboardEvent,
  type ViewStyle,
} from "react-native";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../providers/ThemeProvider";
import type { ThemeTokens } from "@workspace/design-tokens";

const MAX_SHEET_RATIO = 0.92;
const DISMISS_VELOCITY = 0.3;
const DISMISS_DISTANCE = 60;
const SPRING_CONFIG = {
  damping: 28,
  stiffness: 280,
  mass: 0.8,
  useNativeDriver: true,
} as const;
const SPRING_CLOSE = {
  damping: 24,
  stiffness: 320,
  mass: 0.7,
  useNativeDriver: true,
} as const;
const OVERLAY_DURATION = 200;

export interface BottomSheetProps {
  visible: boolean;
  onDismiss: () => void;
  onCloseComplete?: () => void;
  children: React.ReactNode;
  title?: string;
  swipeContentToDismiss?: boolean;
}

export interface BottomSheetHandle {
  dismiss: () => void;
}

export const BottomSheet = forwardRef<BottomSheetHandle, BottomSheetProps>(
  function BottomSheet(
    {
      visible,
      onDismiss,
      onCloseComplete,
      children,
      title,
      swipeContentToDismiss = false,
    },
    ref,
  ) {
    const { theme } = useTheme();
    const styles = useMemo(() => createStyles(theme), [theme]);
    const insets = useSafeAreaInsets();
    const { height: screenHeight } = useWindowDimensions();
    const [allowsPointerEvents, setAllowsPointerEvents] = useState(visible);
    const isClosingRef = useRef(false);
    const isOpenRef = useRef(false);

    const maxHeight = screenHeight * MAX_SHEET_RATIO;
    const translateY = useRef(new Animated.Value(maxHeight)).current;
    const overlayOpacity = useRef(new Animated.Value(0)).current;
    const keyboardHeight = useRef(new Animated.Value(0)).current;

    useEffect(() => {
      if (!visible) {
        keyboardHeight.setValue(0);
        return;
      }

      const showEvent =
        Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
      const hideEvent =
        Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

      const onShow = (e: RNKeyboardEvent) => {
        const kbHeight = e.endCoordinates.height;
        const offset =
          Platform.OS === "ios" ? kbHeight - insets.bottom : kbHeight;

        Animated.spring(keyboardHeight, {
          toValue: Math.max(0, offset),
          ...SPRING_CONFIG,
        }).start();
      };

      const onHide = () => {
        Animated.spring(keyboardHeight, {
          toValue: 0,
          ...SPRING_CONFIG,
        }).start();
      };

      const sub1 = Keyboard.addListener(showEvent, onShow);
      const sub2 = Keyboard.addListener(hideEvent, onHide);

      return () => {
        sub1.remove();
        sub2.remove();
        keyboardHeight.setValue(0);
      };
    }, [visible, keyboardHeight, insets.bottom]);

    const handleCloseComplete = useCallback(() => {
      isClosingRef.current = false;
      onCloseComplete?.();
    }, [onCloseComplete]);

    const open = useCallback(() => {
      isClosingRef.current = false;
      isOpenRef.current = true;
      setAllowsPointerEvents(true);
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: OVERLAY_DURATION,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          ...SPRING_CONFIG,
        }),
      ]).start();
    }, [overlayOpacity, translateY]);

    const close = useCallback(
      (notifyParent: boolean) => {
        if (isClosingRef.current) {
          return;
        }

        isClosingRef.current = true;
        setAllowsPointerEvents(false);
        Keyboard.dismiss();
        keyboardHeight.setValue(0);

        Animated.parallel([
          Animated.timing(overlayOpacity, {
            toValue: 0,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.spring(translateY, {
            toValue: maxHeight,
            ...SPRING_CLOSE,
          }),
        ]).start(({ finished }) => {
          if (finished) {
            isOpenRef.current = false;
            handleCloseComplete();
          }
        });

        if (notifyParent) {
          onDismiss();
        }
      },
      [
        handleCloseComplete,
        keyboardHeight,
        maxHeight,
        onDismiss,
        overlayOpacity,
        translateY,
      ],
    );

    const requestClose = useCallback(() => {
      close(true);
    }, [close]);

    const snapOpen = useCallback(() => {
      Animated.spring(translateY, {
        toValue: 0,
        ...SPRING_CONFIG,
      }).start();
    }, [translateY]);

    useImperativeHandle(ref, () => ({ dismiss: requestClose }), [requestClose]);

    useEffect(() => {
      if (visible) {
        open();
      } else if (isOpenRef.current && !isClosingRef.current) {
        close(false);
      }
    }, [close, open, visible]);

    useEffect(() => {
      if (!visible) {
        translateY.setValue(maxHeight);
        overlayOpacity.setValue(0);
      }
    }, [maxHeight, overlayOpacity, translateY, visible]);

    const dragPanResponder = useMemo(
      () =>
        PanResponder.create({
          onMoveShouldSetPanResponder: (_, gestureState) =>
            Math.abs(gestureState.dy) > 5 &&
            Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
          onPanResponderGrant: () => {
            translateY.stopAnimation();
          },
          onPanResponderMove: (_, gestureState) => {
            translateY.setValue(Math.max(0, gestureState.dy));
          },
          onPanResponderRelease: (_, gestureState) => {
            if (
              gestureState.dy > DISMISS_DISTANCE ||
              gestureState.vy > DISMISS_VELOCITY
            ) {
              requestClose();
              return;
            }

            snapOpen();
          },
          onPanResponderTerminate: () => {
            snapOpen();
          },
        }),
      [requestClose, snapOpen, translateY],
    );

    const contentPanHandlers = swipeContentToDismiss
      ? dragPanResponder.panHandlers
      : undefined;

    const combinedTranslateY = useMemo(
      () => Animated.subtract(translateY, keyboardHeight),
      [keyboardHeight, translateY],
    );
    const dragFade = useMemo(
      () =>
        translateY.interpolate({
          inputRange: [0, maxHeight * 0.5],
          outputRange: [1, 0.3],
          extrapolate: "clamp",
        }),
      [maxHeight, translateY],
    );
    const effectiveOverlayOpacity = useMemo(
      () => Animated.multiply(overlayOpacity, dragFade),
      [dragFade, overlayOpacity],
    );
    const handlePillOpacity = useMemo(
      () =>
        translateY.interpolate({
          inputRange: [0, maxHeight * 0.5],
          outputRange: [1, 0.4],
          extrapolate: "clamp",
        }),
      [maxHeight, translateY],
    );

    return (
      <View
        style={[
          styles.wrapper,
          Platform.OS === "web"
            ? ({
                pointerEvents: allowsPointerEvents ? "auto" : "none",
              } as unknown as ViewStyle)
            : null,
        ]}
        pointerEvents={
          Platform.OS === "web"
            ? undefined
            : allowsPointerEvents
              ? "auto"
              : "none"
        }
      >
        <Animated.View
          style={[styles.overlay, { opacity: effectiveOverlayOpacity }]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={requestClose}
            accessibilityRole="button"
            accessibilityLabel="Close sheet"
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              height: maxHeight,
              paddingBottom: insets.bottom,
              transform: [{ translateY: combinedTranslateY }],
            },
          ]}
          accessibilityRole="none"
          accessibilityLabel={title}
        >
          <View {...dragPanResponder.panHandlers} style={styles.handleArea}>
            <Animated.View
              style={[styles.handlePill, { opacity: handlePillOpacity }]}
            />
          </View>

          <View {...contentPanHandlers} style={styles.contentWrapper}>
            {children}
          </View>
        </Animated.View>
      </View>
    );
  },
);

function createStyles(theme: ThemeTokens) {
  const view = {
    wrapper: {
      position: "absolute" as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 1000,
    },

    overlay: {
      position: "absolute" as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "transparent",
    },

    sheet: {
      position: "absolute" as const,
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: theme.colors.card,
      ...(Platform.OS === "ios"
        ? {
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -3 },
            shadowOpacity: 0.16,
            shadowRadius: 18,
          }
        : { elevation: 16 }),
      overflow: "hidden" as const,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
    },

    handleArea: {
      paddingTop: 14,
      paddingBottom: 12,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      marginHorizontal: -16,
      paddingHorizontal: 16,
    },

    handlePill: {
      width: 48,
      height: 5,
      borderRadius: 9999,
      backgroundColor: theme.colors.muted,
    },

    contentWrapper: {
      flex: 1,
      minHeight: 0,
    },
  } satisfies Record<string, ViewStyle>;

  return StyleSheet.create(view);
}
