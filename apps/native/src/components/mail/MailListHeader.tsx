import React, { useMemo } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
} from "react-native-reanimated";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import { MailSelectionBar } from "./MailSelectionBar";
import { MailTopToolbar } from "./MailTopToolbar";
import { headerChromeMotion, useSelectionProgress } from "./mail-selection-anim";
import { mailSpacing } from "./mail-ui";

const AnimatedView = Animated.createAnimatedComponent(View);

interface MailListHeaderProps {
  selectedCount: number;
  totalCount: number;
  onMenu: () => void;
  onSearch: () => void;
  onClearSelection: () => void;
  onSelectAll: () => void;
}

export function MailListHeader({
  selectedCount,
  totalCount,
  onMenu,
  onSearch,
  onClearSelection,
  onSelectAll,
}: MailListHeaderProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const progress = useSelectionProgress();

  const toolbarStyle = useAnimatedStyle(() => {
    const motion = headerChromeMotion(progress.value, "outgoing");
    return {
      opacity: motion.opacity,
      transform: [
        { translateY: motion.translateY },
        { scale: motion.scale },
      ],
    };
  });

  const selectionStyle = useAnimatedStyle(() => {
    const motion = headerChromeMotion(progress.value, "incoming");
    return {
      opacity: motion.opacity,
      transform: [
        { translateY: motion.translateY },
        { scale: motion.scale },
      ],
    };
  });

  const toolbarPointerProps = useAnimatedProps(() => ({
    pointerEvents: progress.value < 0.35 ? ("auto" as const) : ("none" as const),
  }));

  const selectionPointerProps = useAnimatedProps(() => ({
    pointerEvents: progress.value > 0.65 ? ("auto" as const) : ("none" as const),
  }));

  return (
    <View style={styles.shell}>
      <AnimatedView style={[styles.layer, toolbarStyle]} animatedProps={toolbarPointerProps}>
        <MailTopToolbar onMenu={onMenu} onSearch={onSearch} />
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
  const pad = mailSpacing(theme);

  return StyleSheet.create({
    shell: {
      minHeight: pad.headerV * 2 + 28,
      backgroundColor: theme.colors.background,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      overflow: "hidden",
    } as ViewStyle,
    layer: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: "center",
    } as ViewStyle,
  });
}
