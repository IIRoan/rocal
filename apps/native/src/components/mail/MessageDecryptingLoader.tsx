import { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";

const BODY_LINE_WIDTHS = [1, 0.94, 0.82, 0.9, 0.68, 0.76, 0.58] as const;

type MessageDecryptingSkeletonProps = {
  attachedBelowBanner?: boolean;
  isDark?: boolean;
};

function useSkeletonPulse() {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
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
  }, [opacity]);

  return opacity;
}

function useShimmerShift(width: number) {
  const translateX = useRef(new Animated.Value(-width * 0.5)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(translateX, {
          toValue: width * 1.2,
          duration: 2400,
          useNativeDriver: true,
        }),
        Animated.timing(translateX, {
          toValue: -width * 0.5,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [translateX, width]);

  return translateX;
}

export function MessageDecryptingSkeleton({
  attachedBelowBanner = false,
  isDark: isDarkProp,
}: MessageDecryptingSkeletonProps) {
  const { theme, isDark: themeIsDark } = useTheme();
  const isDark = isDarkProp ?? themeIsDark;
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const pulse = useSkeletonPulse();
  const shimmerX = useShimmerShift(280);
  const barColor = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.06)";
  const shimmerColor = isDark
    ? "rgba(255,255,255,0.06)"
    : "rgba(0,0,0,0.04)";

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
        <Animated.View
          style={[
            styles.shimmerBand,
            {
              backgroundColor: shimmerColor,
              transform: [{ translateX: shimmerX }],
            },
          ]}
        />
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
      position: "relative",
      minHeight: 160,
      paddingHorizontal: theme.spacing["5"],
      paddingVertical: theme.spacing["4"],
      overflow: "hidden",
    },
    shimmerBand: {
      position: "absolute",
      top: 0,
      bottom: 0,
      width: "45%",
      opacity: 0.8,
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
