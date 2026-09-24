import React, { useEffect, useMemo, useRef } from "react";
import {
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  type AnimatedStyle,
} from "react-native-reanimated";
import { CalendarScreen } from "../../app/(tabs)/calendar/index";
import { MailScreen } from "../../app/(tabs)/mail/index";
import {
  STACK_BACK_PEEK,
  STACK_COVER_OVERLAY,
  animateTabProgress,
  tabProgressTarget,
} from "../lib/workspace-tab-transition";
import { useReduceMotion } from "../lib/use-reduce-motion";
import { useWorkspaceTabHost } from "../providers/WorkspaceTabHostProvider";
import { WorkspaceThemeScope, useTheme } from "../providers/ThemeProvider";
import type { AppSwitchKey } from "../lib/app-switcher-config";

/** Parks the resting mail card past its own shadow so the shadow can stay static instead of animating per frame. */
const MAIL_SHADOW_GUTTER = 16;

/**
 * Keep-alive Calendar / Mail host. Transition matches iOS UINavigationController
 * (incoming covers from the right, outgoing peeks 30%) and the app's native stack.
 */
export function WorkspacePrimaryTabSurfaces() {
  return (
    <WorkspaceThemeScope>
      <WorkspacePrimaryTabHost />
    </WorkspaceThemeScope>
  );
}

function WorkspacePrimaryTabHost() {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const { activeTab, isHosted } = useWorkspaceTabHost();
  const snapOnShow = useRef(true);
  const progress = useSharedValue(tabProgressTarget(activeTab));
  const styles = useMemo(() => createStyles(theme), [theme]);

  useEffect(() => {
    if (!isHosted) {
      snapOnShow.current = true;
      progress.value = tabProgressTarget(activeTab);
      return;
    }

    const target = tabProgressTarget(activeTab);
    if (snapOnShow.current) {
      snapOnShow.current = false;
      progress.value = target;
      return;
    }

    animateTabProgress(progress, target, reduceMotion);
  }, [activeTab, isHosted, progress, reduceMotion]);

  const calendarStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          progress.value,
          [0, 1],
          [0, -width * STACK_BACK_PEEK],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const mailStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          progress.value,
          [0, 1],
          [width + MAIL_SHADOW_GUTTER, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  const coverStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [0, 1],
      [0, STACK_COVER_OVERLAY],
      Extrapolation.CLAMP,
    ),
  }));

  return (
    <View
      style={[styles.host, !isHosted && styles.hostHidden]}
      pointerEvents={isHosted ? "auto" : "none"}
      accessibilityElementsHidden={!isHosted}
      importantForAccessibility={isHosted ? "auto" : "no-hide-descendants"}
    >
      <WorkspaceTabPane
        tab="calendar"
        activeTab={activeTab}
        style={calendarStyle}
      >
        <CalendarScreen />
        <Animated.View
          pointerEvents="none"
          style={[styles.cover, coverStyle]}
        />
      </WorkspaceTabPane>
      <WorkspaceTabPane
        tab="mail"
        activeTab={activeTab}
        style={[styles.mailCard, mailStyle]}
      >
        <MailScreen />
      </WorkspaceTabPane>
    </View>
  );
}

function WorkspaceTabPane({
  tab,
  activeTab,
  style,
  children,
}: {
  tab: AppSwitchKey;
  activeTab: AppSwitchKey;
  style: StyleProp<AnimatedStyle<ViewStyle>>;
  children: React.ReactNode;
}) {
  const active = tab === activeTab;

  return (
    <Animated.View
      style={[paneStyle.fill, style]}
      pointerEvents={active ? "auto" : "none"}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? "auto" : "no-hide-descendants"}
    >
      {children}
    </Animated.View>
  );
}

const paneStyle = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFill,
  },
});

function createStyles(theme: { colors: { background: string } }) {
  return StyleSheet.create({
    host: {
      ...StyleSheet.absoluteFill,
      zIndex: 1,
      overflow: "hidden",
      backgroundColor: theme.colors.background,
    } as ViewStyle,
    hostHidden: {
      opacity: 0,
      zIndex: -1,
    } as ViewStyle,
    mailCard: {
      zIndex: 2,
      backgroundColor: theme.colors.background,
      ...(Platform.OS === "ios"
        ? {
            shadowColor: "#000",
            shadowOffset: { width: -2, height: 0 },
            shadowOpacity: 0.22,
            shadowRadius: 8,
          }
        : { elevation: 6 }),
    } as ViewStyle,
    cover: {
      ...StyleSheet.absoluteFill,
      backgroundColor: "#000",
    } as ViewStyle,
  });
}
