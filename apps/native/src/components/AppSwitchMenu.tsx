import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Feather } from "@expo/vector-icons";
import type { ThemeTokens } from "@workspace/design-tokens";
import {
  APP_SWITCH_OPTIONS,
  type AppSwitchKey,
} from "../lib/app-switcher-config";
import { useTheme } from "../providers/ThemeProvider";

const MENU_WIDTH = 160;
const MENU_OFFSET = 6;
const OPEN_DURATION = 220;
const CLOSE_DURATION = 180;
const OPEN_EASING = Easing.out(Easing.cubic);
const CLOSE_EASING = Easing.in(Easing.cubic);

export type AppSwitchMenuAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

interface AppSwitchMenuProps {
  visible: boolean;
  /** Skip the close animation (e.g. when switching tabs). */
  dismissInstant?: boolean;
  activeApp: AppSwitchKey;
  anchor: AppSwitchMenuAnchor | null;
  onDismiss: () => void;
  onSelect: (key: AppSwitchKey) => void;
}

export function AppSwitchMenu({
  visible,
  dismissInstant = false,
  activeApp,
  anchor,
  onDismiss,
  onSelect,
}: AppSwitchMenuProps) {
  const { theme } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [modalVisible, setModalVisible] = useState(false);
  const progress = useSharedValue(0);

  const menuLeft = useMemo(() => {
    if (!anchor) {
      return (screenWidth - MENU_WIDTH) / 2;
    }
    const centered = anchor.x + anchor.width / 2 - MENU_WIDTH / 2;
    return Math.max(12, Math.min(screenWidth - MENU_WIDTH - 12, centered));
  }, [anchor, screenWidth]);

  const menuTop = anchor ? anchor.y + anchor.height + MENU_OFFSET : 0;

  useEffect(() => {
    if (!visible) {
      return;
    }
    setModalVisible(true);
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: OPEN_DURATION,
      easing: OPEN_EASING,
    });
  }, [visible, progress]);

  useEffect(() => {
    if (visible || !modalVisible) {
      return;
    }
    if (dismissInstant) {
      progress.value = 0;
      setModalVisible(false);
      return;
    }
    progress.value = withTiming(
      0,
      { duration: CLOSE_DURATION, easing: CLOSE_EASING },
      (finished) => {
        if (finished) {
          scheduleOnRN(setModalVisible, false);
        }
      },
    );
  }, [visible, modalVisible, progress, dismissInstant]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 0.4]),
  }));

  const menuStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1]),
    transform: [
      {
        scale: interpolate(progress.value, [0, 1], [0.94, 1]),
      },
      {
        translateY: interpolate(progress.value, [0, 1], [-8, 0]),
      },
    ],
  }));

  if (!modalVisible) {
    return null;
  }

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onDismiss}
    >
      <View style={styles.root} pointerEvents="box-none">
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Close app switcher"
        >
          <Animated.View style={[styles.overlay, overlayStyle]} />
        </Pressable>

        <Animated.View
          style={[styles.menu, { top: menuTop, left: menuLeft }, menuStyle]}
        >
          {APP_SWITCH_OPTIONS.map((option, index) => {
            const isActive = option.key === activeApp;
            return (
              <React.Fragment key={option.key}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <Pressable
                  onPress={() => onSelect(option.key)}
                  style={({ pressed }) => [
                    styles.option,
                    isActive && styles.optionActive,
                    pressed && styles.optionPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={option.label}
                >
                  <Feather
                    name={option.icon}
                    size={14}
                    color={
                      isActive
                        ? theme.colors.primaryBase
                        : theme.colors.mutedForeground
                    }
                  />
                  <Text
                    style={[
                      styles.optionLabel,
                      isActive && styles.optionLabelActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              </React.Fragment>
            );
          })}
        </Animated.View>
      </View>
    </Modal>
  );
}

function createStyles(theme: ThemeTokens) {
  const view = {
    root: {
      flex: 1,
    },
    overlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: "#000",
    },
    menu: {
      position: "absolute" as const,
      width: MENU_WIDTH,
      flexDirection: "row" as const,
      borderRadius: theme.borderRadius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.card,
      overflow: "hidden" as const,
    },
    option: {
      flex: 1,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: theme.spacing["1"],
      paddingVertical: theme.spacing["2"] + 2,
      paddingHorizontal: theme.spacing["1"],
    },
    optionActive: {
      backgroundColor: theme.colors.primaryBase + "14",
    },
    optionPressed: {
      opacity: 0.7,
    },
    divider: {
      width: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border + "99",
      alignSelf: "stretch" as const,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    optionLabel: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.mutedForeground,
    },
    optionLabelActive: {
      color: theme.colors.primaryBase,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
