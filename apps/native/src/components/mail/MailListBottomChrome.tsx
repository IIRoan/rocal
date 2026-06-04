import React from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
} from "react-native-reanimated";
import { MailBulkToolbar } from "./MailBulkToolbar";
import { MailComposeButton } from "./MailComposeButton";
import { bottomChromeMotion } from "./mail-selection-anim-utils";
import { useSelectionProgress } from "./mail-selection-anim";

const AnimatedView = Animated.createAnimatedComponent(View);

interface MailListBottomChromeProps {
  bottomInset: number;
  composeOnPress: () => void;
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
  composeOnPress,
  bulk,
}: MailListBottomChromeProps) {
  const progress = useSelectionProgress();

  const composeStyle = useAnimatedStyle(() => {
    const motion = bottomChromeMotion(progress.value, "outgoing");
    return {
      opacity: motion.opacity,
      transform: [{ translateY: motion.translateY }, { scale: motion.scale }],
    };
  });

  const bulkStyle = useAnimatedStyle(() => {
    const motion = bottomChromeMotion(progress.value, "incoming");
    return {
      opacity: motion.opacity,
      transform: [{ translateY: motion.translateY }, { scale: motion.scale }],
    };
  });

  const composePointerProps = useAnimatedProps(() => ({
    pointerEvents:
      progress.value < 0.35 ? ("box-none" as const) : ("none" as const),
  }));

  const bulkPointerProps = useAnimatedProps(() => ({
    pointerEvents:
      progress.value > 0.65 ? ("box-none" as const) : ("none" as const),
  }));

  return (
    <View style={styles.root} pointerEvents="box-none">
      <AnimatedView
        style={[styles.composeLayer, composeStyle]}
        animatedProps={composePointerProps}
      >
        <MailComposeButton bottomInset={bottomInset} onPress={composeOnPress} />
      </AnimatedView>
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
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },
  composeLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  bulkLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
  },
});
