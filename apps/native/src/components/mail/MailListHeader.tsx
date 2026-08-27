import React, { useMemo } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
} from "react-native-reanimated";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import { MailSelectionBar } from "./MailSelectionBar";
import { MailTopToolbar } from "./MailTopToolbar";
import { useSelectionProgress } from "./mail-selection-anim";
import { Feather } from "@expo/vector-icons";
import { LAYOUT_METRICS, layoutHairlineBorder } from "../../lib/app-layout";

const AnimatedView = Animated.createAnimatedComponent(View);

interface MailListHeaderProps {
  selectedCount: number;
  totalCount: number;
  mailboxName?: string;
  mailboxIcon?: keyof typeof Feather.glyphMap;
  onMenu: () => void;
  onSearch: () => void;
  onClearSelection: () => void;
  onSelectAll: () => void;
}

export function MailListHeader({
  selectedCount,
  totalCount,
  mailboxName,
  mailboxIcon,
  onMenu,
  onSearch,
  onClearSelection,
  onSelectAll,
}: MailListHeaderProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const progress = useSelectionProgress();

  const toolbarStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [0, 0.55, 1],
      [1, 0.15, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const selectionStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [0, 0.45, 1],
      [0, 0.85, 1],
      Extrapolation.CLAMP,
    ),
  }));

  const toolbarPointerProps = useAnimatedProps(() => ({
    pointerEvents:
      progress.value < 0.35 ? ("auto" as const) : ("none" as const),
  }));

  const selectionPointerProps = useAnimatedProps(() => ({
    pointerEvents:
      progress.value > 0.65 ? ("auto" as const) : ("none" as const),
  }));

  return (
    <View style={styles.shell}>
      <AnimatedView
        style={[styles.layer, toolbarStyle]}
        animatedProps={toolbarPointerProps}
      >
        <MailTopToolbar
          onMenu={onMenu}
          onSearch={onSearch}
          mailboxName={mailboxName}
          mailboxIcon={mailboxIcon}
        />
      </AnimatedView>
      <AnimatedView
        style={[styles.layer, selectionStyle]}
        animatedProps={selectionPointerProps}
      >
        <MailSelectionBar
          selectedCount={selectedCount}
          totalCount={totalCount}
          onClear={onClearSelection}
          onSelectAll={onSelectAll}
        />
      </AnimatedView>
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    shell: {
      minHeight: LAYOUT_METRICS.headerMinHeight,
      backgroundColor: theme.colors.background,
      ...layoutHairlineBorder(theme),
      overflow: "hidden",
    } as ViewStyle,
    layer: {
      ...StyleSheet.absoluteFill,
      justifyContent: "center",
    } as ViewStyle,
  });
}
