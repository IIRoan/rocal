import React, { useMemo } from "react";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { selectionFooterHeight } from "./mail-selection-anim-utils";
import { useSelectionProgress } from "./mail-selection-anim";

interface MailListAnimatedFooterProps {
  idlePadding: number;
  bulkPadding: number;
}

/** Scroll spacer that eases between the idle inset and bulk toolbar height. */
export function MailListAnimatedFooter({
  idlePadding,
  bulkPadding,
}: MailListAnimatedFooterProps) {
  const progress = useSelectionProgress();
  const maxPadding = useMemo(
    () => Math.max(idlePadding, bulkPadding, 1),
    [idlePadding, bulkPadding],
  );

  const style = useAnimatedStyle(() => {
    const height = selectionFooterHeight(
      progress.value,
      idlePadding,
      bulkPadding,
    );
    const scaleY = height / maxPadding;
    return {
      transform: [{ translateY: (maxPadding * (1 - scaleY)) / 2 }, { scaleY }],
    };
  });

  return <Animated.View style={[{ height: maxPadding }, style]} />;
}
