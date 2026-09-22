import React from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
} from "react-native-reanimated";
import { MailBulkToolbar } from "./MailBulkToolbar";
import { bottomChromeMotion } from "./mail-selection-anim-utils";
import { useSelectionProgress } from "./mail-selection-anim";

const AnimatedView = Animated.createAnimatedComponent(View);

interface MailListBottomChromeProps {
  bottomInset: number;
  bulk: {
    isInTrash: boolean;
    canMarkRead: boolean;
    canMarkUnread: boolean;
    busy?: boolean;
    onMarkRead: () => void;
    onMarkUnread: () => void;
    onTrash: () => void;
    onMore: () => void;
  };
}

export function MailListBottomChrome({
  bottomInset,
  bulk,
}: MailListBottomChromeProps) {
  const progress = useSelectionProgress();

  const bulkStyle = useAnimatedStyle(() => {
    const motion = bottomChromeMotion(progress.value, "incoming");
    return {
      opacity: motion.opacity,
      transform: [{ translateY: motion.translateY }, { scale: motion.scale }],
    };
  });

  const bulkPointerProps = useAnimatedProps(() => ({
    pointerEvents:
      progress.value > 0.65 ? ("box-none" as const) : ("none" as const),
  }));

  return (
    <View style={styles.root} pointerEvents="box-none">
      <AnimatedView
        style={[styles.bulkLayer, bulkStyle]}
        animatedProps={bulkPointerProps}
      >
        <MailBulkToolbar bottomInset={bottomInset} {...bulk} />
      </AnimatedView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 20,
  },
  bulkLayer: {
    ...StyleSheet.absoluteFill,
    justifyContent: "flex-end",
  },
});
