import React from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { MobileNavigation } from "./MobileNavigation";

const { width } = Dimensions.get("window");
const sidebarWidth = width * 0.7;

export const MobileSidebar = () => {
  const translateX = useSharedValue(-sidebarWidth);

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = Math.max(
        -sidebarWidth,
        Math.min(0, event.translationX),
      );
    })
    .onEnd(() => {
      translateX.value = withSpring(0);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <GestureHandlerRootView style={styles.container}>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.sidebar, animatedStyle]}>
          <MobileNavigation />
        </Animated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  sidebar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: sidebarWidth,
    backgroundColor: "white",
    padding: 20,
    borderRightWidth: 1,
    borderRightColor: "#ccc",
  },
});
