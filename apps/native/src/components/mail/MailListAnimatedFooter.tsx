import React, { useMemo } from "react";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { selectionFooterHeight } from "./mail-selection-anim-utils";
import { useSelectionProgress } from "./mail-selection-anim";

interface MailListAnimatedFooterProps {
  composePadding: number;
  bulkPadding: number;
}

/** Scroll spacer that eases between compose FAB and bulk toolbar heights. */
export function MailListAnimatedFooter({
  composePadding,
  bulkPadding,
}: MailListAnimatedFooterProps) {
  const progress = useSelectionProgress();
  const maxPadding = useMemo(
    () => Math.max(composePadding, bulkPadding, 1),
    [composePadding, bulkPadding],
  );

  const style = useAnimatedStyle(() => {
    const height = selectionFooterHeight(
      progress.value,
      composePadding,
      bulkPadding,
    );
    const scaleY = height / maxPadding;
    return {
      transform: [{ translateY: (maxPadding * (1 - scaleY)) / 2 }, { scaleY }],
    };
  });

  return <Animated.View style={[{ height: maxPadding }, style]} />;
}
