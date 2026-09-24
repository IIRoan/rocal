import { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import { useReduceMotion } from "../../lib/use-reduce-motion";

const BODY_LINE_WIDTHS = [1, 0.94, 0.82, 0.9, 0.68, 0.76, 0.58] as const;
const PULSE_REST_OPACITY = 0.7;

type MessageDecryptingSkeletonProps = {
  attachedBelowBanner?: boolean;
  isDark?: boolean;
};

function useSkeletonPulse() {
  const opacity = useRef(new Animated.Value(0.45)).current;
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(PULSE_REST_OPACITY);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity, reduceMotion]);

  return opacity;
}

export function MessageDecryptingSkeleton({
  attachedBelowBanner = false,
  isDark: isDarkProp,
}: MessageDecryptingSkeletonProps) {
  const { theme, isDark: themeIsDark } = useTheme();
  const isDark = isDarkProp ?? themeIsDark;
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const pulse = useSkeletonPulse();
  const barColor = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.06)";

  return (
    <View
      style={[
        styles.container,
        attachedBelowBanner && styles.containerAttached,
      ]}
      accessibilityRole="progressbar"
      accessibilityLabel="Decrypting message"
    >
      <View style={styles.body}>
        <View style={styles.lines}>
          {BODY_LINE_WIDTHS.map((widthRatio, index) => (
            <Animated.View
              key={`${widthRatio}-${index}`}
              style={[
                styles.line,
                {
                  width: `${widthRatio * 100}%`,
                  backgroundColor: barColor,
                  opacity: pulse,
                },
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

/** @deprecated Use MessageDecryptingSkeleton */
export function MessageDecryptingLoader(props: MessageDecryptingSkeletonProps) {
  return <MessageDecryptingSkeleton {...props} />;
}

/** @deprecated Use MessageDecryptingSkeleton */
export function MessageDecryptingIndicator(props: MessageDecryptingSkeletonProps) {
  return <MessageDecryptingSkeleton {...props} />;
}

function createStyles(theme: ThemeTokens, isDark: boolean) {
  return StyleSheet.create({
    container: {
      minHeight: 160,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.lg,
      overflow: "hidden",
      backgroundColor: isDark ? "#1a1a1a" : "#ffffff",
    },
    containerAttached: {
      borderTopWidth: 0,
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
    },
    body: {
      minHeight: 160,
      paddingHorizontal: theme.spacing["5"],
      paddingVertical: theme.spacing["4"],
    },
    lines: {
      gap: theme.spacing["2.5"],
      width: "100%",
    },
    line: {
      height: 10,
      borderRadius: theme.borderRadius.sm,
    },
  } satisfies Record<string, ViewStyle>);
}
