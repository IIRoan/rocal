import React from "react";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { selectionFooterHeight, useSelectionProgress } from "./mail-selection-anim";

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

  const style = useAnimatedStyle(() => ({
    height: selectionFooterHeight(
      progress.value,
      composePadding,
      bulkPadding,
    ),
  }));

  return <Animated.View style={style} />;
}
