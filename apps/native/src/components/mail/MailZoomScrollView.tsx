import { useCallback, useState, type ReactNode } from "react";
import {
  Platform,
  ScrollView,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withSpring,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

const IOS_MAX_ZOOM = 4;
const ANDROID_MAX_ZOOM = 4;
const ANDROID_MIN_ZOOM = 1;
const ZOOM_SPRING = { damping: 22, stiffness: 240, mass: 0.75 };
const ZOOM_ACTIVE_EPS = 0.02;

type MailZoomScrollViewProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

/**
 * Message body scroller with pinch-zoom + pan when zoomed.
 * iOS uses UIScrollView zoom (native feel). Android uses a Reanimated
 * pinch/pan layer because RN ScrollView zoom is iOS-only.
 */
export function MailZoomScrollView({
  children,
  style,
  contentContainerStyle,
}: MailZoomScrollViewProps) {
  if (Platform.OS === "ios") {
    return (
      <ScrollView
        style={style}
        contentContainerStyle={contentContainerStyle}
        maximumZoomScale={IOS_MAX_ZOOM}
        minimumZoomScale={1}
        bouncesZoom
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator
        decelerationRate="normal"
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <AndroidZoomScrollView
      style={style}
      contentContainerStyle={contentContainerStyle}
    >
      {children}
    </AndroidZoomScrollView>
  );
}

function AndroidZoomScrollView({
  children,
  style,
  contentContainerStyle,
}: MailZoomScrollViewProps) {
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTX = useSharedValue(0);
  const savedTY = useSharedValue(0);
  const layoutW = useSharedValue(0);
  const layoutH = useSharedValue(0);
  const originTX = useSharedValue(0);
  const originTY = useSharedValue(0);

  const setZoomed = useCallback((active: boolean) => {
    setScrollEnabled(!active);
  }, []);

  const clampTranslation = (
    nextX: number,
    nextY: number,
    nextScale: number,
  ) => {
    "worklet";
    const maxX = Math.max(0, (layoutW.value * nextScale - layoutW.value) / 2);
    const maxY = Math.max(0, (layoutH.value * nextScale - layoutH.value) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, nextX)),
      y: Math.min(maxY, Math.max(-maxY, nextY)),
    };
  };

  const pinch = Gesture.Pinch()
    .onStart(() => {
      originTX.value = translateX.value;
      originTY.value = translateY.value;
    })
    .onUpdate((e) => {
      const next = Math.min(
        ANDROID_MAX_ZOOM,
        Math.max(ANDROID_MIN_ZOOM * 0.92, savedScale.value * e.scale),
      );
      const focusScale = next / Math.max(savedScale.value, 0.001);
      const nextX = e.focalX - (e.focalX - originTX.value) * focusScale;
      const nextY = e.focalY - (e.focalY - originTY.value) * focusScale;
      const clamped = clampTranslation(nextX, nextY, next);
      scale.value = next;
      translateX.value = clamped.x;
      translateY.value = clamped.y;
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withSpring(1, ZOOM_SPRING);
        translateX.value = withSpring(0, ZOOM_SPRING);
        translateY.value = withSpring(0, ZOOM_SPRING);
        savedScale.value = 1;
        savedTX.value = 0;
        savedTY.value = 0;
        scheduleOnRN(setZoomed, false);
        return;
      }

      const capped = Math.min(ANDROID_MAX_ZOOM, scale.value);
      if (capped !== scale.value) {
        scale.value = withSpring(capped, ZOOM_SPRING);
      }
      const clamped = clampTranslation(
        translateX.value,
        translateY.value,
        capped,
      );
      translateX.value = withSpring(clamped.x, ZOOM_SPRING);
      translateY.value = withSpring(clamped.y, ZOOM_SPRING);
      savedScale.value = capped;
      savedTX.value = clamped.x;
      savedTY.value = clamped.y;
      scheduleOnRN(setZoomed, capped > 1 + ZOOM_ACTIVE_EPS);
    });

  const pan = Gesture.Pan()
    .manualActivation(true)
    .onTouchesMove((_, state) => {
      if (scale.value > 1 + ZOOM_ACTIVE_EPS) {
        state.activate();
      } else {
        state.fail();
      }
    })
    .onUpdate((e) => {
      const nextX = savedTX.value + e.translationX;
      const nextY = savedTY.value + e.translationY;
      const clamped = clampTranslation(nextX, nextY, scale.value);
      translateX.value = clamped.x;
      translateY.value = clamped.y;
    })
    .onEnd((e) => {
      const maxX = Math.max(
        0,
        (layoutW.value * scale.value - layoutW.value) / 2,
      );
      const maxY = Math.max(
        0,
        (layoutH.value * scale.value - layoutH.value) / 2,
      );
      translateX.value = withDecay({
        velocity: e.velocityX,
        clamp: [-maxX, maxX],
        deceleration: 0.997,
      });
      translateY.value = withDecay(
        {
          velocity: e.velocityY,
          clamp: [-maxY, maxY],
          deceleration: 0.997,
        },
        (finished) => {
          if (finished) {
            savedTX.value = translateX.value;
            savedTY.value = translateY.value;
          }
        },
      );
      savedTX.value = translateX.value;
      savedTY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(250)
    .onEnd((e) => {
      if (scale.value > 1 + ZOOM_ACTIVE_EPS) {
        scale.value = withSpring(1, ZOOM_SPRING);
        translateX.value = withSpring(0, ZOOM_SPRING);
        translateY.value = withSpring(0, ZOOM_SPRING);
        savedScale.value = 1;
        savedTX.value = 0;
        savedTY.value = 0;
        scheduleOnRN(setZoomed, false);
        return;
      }

      const target = 2;
      const focusScale = target / Math.max(scale.value, 0.001);
      const nextX = e.x - (e.x - translateX.value) * focusScale;
      const nextY = e.y - (e.y - translateY.value) * focusScale;
      const clamped = clampTranslation(nextX, nextY, target);
      scale.value = withSpring(target, ZOOM_SPRING);
      translateX.value = withSpring(clamped.x, ZOOM_SPRING);
      translateY.value = withSpring(clamped.y, ZOOM_SPRING);
      savedScale.value = target;
      savedTX.value = clamped.x;
      savedTY.value = clamped.y;
      scheduleOnRN(setZoomed, true);
    });

  const composed = Gesture.Simultaneous(
    pinch,
    Gesture.Exclusive(doubleTap, pan),
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <ScrollView
      style={style}
      contentContainerStyle={contentContainerStyle}
      scrollEnabled={scrollEnabled}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator
      decelerationRate="normal"
      scrollEventThrottle={16}
      keyboardShouldPersistTaps="handled"
      bounces={scrollEnabled}
    >
      <GestureDetector gesture={composed}>
        <Animated.View
          collapsable={false}
          style={animatedStyle}
          onLayout={(e) => {
            layoutW.value = e.nativeEvent.layout.width;
            layoutH.value = e.nativeEvent.layout.height;
          }}
        >
          {children}
        </Animated.View>
      </GestureDetector>
    </ScrollView>
  );
}
