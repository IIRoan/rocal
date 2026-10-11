import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type TextStyle,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { afterPaint } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";

const PICKER_SPRING = { damping: 28, stiffness: 280, mass: 0.8 };
const PICKER_CLOSE_DURATION = 180;
const PICKER_DISMISS_DISTANCE = 64;
const PICKER_DISMISS_VELOCITY = 650;

export function PickerSheet({
  visible,
  onClose,
  title,
  theme,
  bottomInset,
  maxHeightRatio,
  avoidKeyboard = false,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  theme: ThemeTokens;
  bottomInset: number;
  maxHeightRatio: number;
  avoidKeyboard?: boolean;
  children: React.ReactNode;
}) {
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(false);
  const styles = useMemo(() => createModalStyles(theme), [theme]);
  const closeSequenceRef = useRef(0);
  const closeFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const translateY = useSharedValue(height);
  const overlayOpacity = useSharedValue(0);

  const clearCloseFallbackTimer = useCallback(() => {
    if (closeFallbackTimerRef.current !== null) {
      clearTimeout(closeFallbackTimerRef.current);
      closeFallbackTimerRef.current = null;
    }
  }, []);

  const finishUnmount = useCallback(() => {
    clearCloseFallbackTimer();
    setMounted(false);
  }, [clearCloseFallbackTimer]);
  const finishUnmountIfCurrent = useCallback(
    (sequence: number) => {
      if (sequence !== closeSequenceRef.current || visible) {
        return;
      }
      finishUnmount();
    },
    [finishUnmount, visible],
  );
  const requestClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // Mounted during render so the sheet's content commits before the open effect below runs.
  if (visible && !mounted) {
    setMounted(true);
  }

  useEffect(() => {
    if (visible) {
      clearCloseFallbackTimer();
      closeSequenceRef.current += 1;
      cancelAnimation(translateY);
      cancelAnimation(overlayOpacity);
      translateY.value = height;
      overlayOpacity.value = 0;
      return afterPaint(() => {
        translateY.value = withSpring(0, PICKER_SPRING);
        overlayOpacity.value = withTiming(1, {
          duration: PICKER_CLOSE_DURATION,
        });
      });
    } else {
      const closeSequence = closeSequenceRef.current + 1;
      closeSequenceRef.current = closeSequence;
      clearCloseFallbackTimer();
      cancelAnimation(translateY);
      cancelAnimation(overlayOpacity);
      translateY.value = withTiming(
        height,
        { duration: PICKER_CLOSE_DURATION },
        (finished) => {
          if (finished) {
            scheduleOnRN(finishUnmountIfCurrent, closeSequence);
          }
        },
      );
      overlayOpacity.value = withTiming(0, {
        duration: PICKER_CLOSE_DURATION,
      });
      const fallbackTimer = setTimeout(() => {
        finishUnmountIfCurrent(closeSequence);
      }, PICKER_CLOSE_DURATION + 120);
      closeFallbackTimerRef.current = fallbackTimer;
      return () => clearTimeout(fallbackTimer);
    }
  }, [
    visible,
    height,
    translateY,
    overlayOpacity,
    clearCloseFallbackTimer,
    finishUnmountIfCurrent,
  ]);

  useEffect(
    () => () => {
      clearCloseFallbackTimer();
    },
    [clearCloseFallbackTimer],
  );

  const panGesture = Gesture.Pan()
    .activeOffsetY(8)
    .failOffsetX([-20, 20])
    .onStart(() => {
      "worklet";
      cancelAnimation(translateY);
    })
    .onUpdate((e) => {
      "worklet";
      if (e.translationY > 0) {
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      "worklet";
      if (
        e.translationY > PICKER_DISMISS_DISTANCE ||
        e.velocityY > PICKER_DISMISS_VELOCITY
      ) {
        scheduleOnRN(requestClose);
      } else {
        translateY.value = withSpring(0, PICKER_SPRING);
      }
    });

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!mounted) return null;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={requestClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior="padding"
        enabled={avoidKeyboard}
      >
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: theme.colors.overlay + "6B",
            },
            overlayStyle,
          ]}
        />
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={requestClose}
          accessibilityRole="button"
          accessibilityLabel="Close picker"
        />
        <Animated.View
          style={[
            styles.sheet,
            {
              maxHeight: height * maxHeightRatio,
              paddingBottom: Math.max(16, bottomInset + 8),
            },
            sheetStyle,
          ]}
        >
          <GestureDetector gesture={panGesture}>
            <View style={styles.handleArea}>
              <View style={styles.handle} />
            </View>
          </GestureDetector>
          <Text style={styles.title}>{title}</Text>
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createModalStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: theme.colors.card + "F2",
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      overflow: "hidden",
    },
    handleArea: {
      alignItems: "center",
      paddingTop: 12,
      paddingBottom: 8,
    },
    handle: {
      width: 42,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.colors.muted,
    },
    title: {
      fontSize: theme.typography.fontSize.base.size,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
      textAlign: "center",
      marginBottom: 10,
      paddingHorizontal: 16,
    },
  });
}
