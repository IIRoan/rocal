import { useMemo } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import {
  EVENT_REMINDER_MAIL_CONTENT_HEIGHT_PX,
  EVENT_REMINDER_MAIL_MAX_WIDTH_PX,
  EVENT_REMINDER_MAIL_MIN_FILL_RATIO,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";

type EventReminderMessageBodyLoadingProps = {
  attachedBelowBanner?: boolean;
};

export function EventReminderMessageBodyLoading({
  attachedBelowBanner = false,
}: EventReminderMessageBodyLoadingProps) {
  const { theme, isDark } = useTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const styles = useMemo(
    () => createStyles(theme, isDark, windowWidth, windowHeight),
    [theme, isDark, windowWidth, windowHeight],
  );
  const skeleton = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.06)";

  return (
    <View
      style={[
        styles.container,
        attachedBelowBanner && styles.containerAttached,
      ]}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading event reminder"
    >
      <View style={[styles.block, { width: 36, height: 36, borderRadius: 8, backgroundColor: skeleton }]} />
      <View style={[styles.block, { width: "62%", height: 28, borderRadius: 8, backgroundColor: skeleton }]} />
      <View style={[styles.block, { width: "38%", height: 16, marginTop: 8, borderRadius: 6, backgroundColor: skeleton }]} />

      <View style={styles.detailGroup}>
        {Array.from({ length: 3 }).map((_, index) => (
          <View key={index} style={styles.detailBlock}>
            <View style={[styles.block, { width: 48, height: 12, borderRadius: 4, backgroundColor: skeleton }]} />
            <View
              style={[
                styles.block,
                {
                  width: "100%",
                  height: 20,
                  marginTop: 8,
                  borderRadius: 6,
                  backgroundColor: skeleton,
                },
              ]}
            />
          </View>
        ))}
      </View>

      <View style={[styles.block, { width: 132, height: 44, marginTop: 12, borderRadius: 12, backgroundColor: skeleton }]} />

      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" color={theme.colors.mutedForeground} />
        <Text style={styles.loadingText}>Loading reminder details…</Text>
      </View>
    </View>
  );
}

function createStyles(
  theme: ThemeTokens,
  isDark: boolean,
  windowWidth: number,
  windowHeight: number,
) {
  const horizontalPadding = theme.spacing["5"] * 2 + theme.spacing["4"] * 2;
  const contentWidth = Math.min(
    windowWidth - horizontalPadding,
    EVENT_REMINDER_MAIL_MAX_WIDTH_PX,
  );
  const aspectHeight =
    contentWidth *
    (EVENT_REMINDER_MAIL_CONTENT_HEIGHT_PX / EVENT_REMINDER_MAIL_MAX_WIDTH_PX);
  const minFillHeight = windowHeight * EVENT_REMINDER_MAIL_MIN_FILL_RATIO;

  return StyleSheet.create({
    container: {
      flexGrow: 1,
      width: "100%",
      maxWidth: EVENT_REMINDER_MAIL_MAX_WIDTH_PX,
      alignSelf: "center",
      minHeight: Math.max(aspectHeight, minFillHeight),
      paddingHorizontal: theme.spacing["5"],
      paddingTop: theme.spacing["8"],
      paddingBottom: theme.spacing["6"],
      backgroundColor: isDark ? "#1a1a1a" : "#ffffff",
    },
    containerAttached: {
      borderWidth: StyleSheet.hairlineWidth,
      borderTopWidth: 0,
      borderColor: theme.colors.primaryBase + "26",
      borderBottomLeftRadius: theme.borderRadius.lg,
      borderBottomRightRadius: theme.borderRadius.lg,
    },
    block: {
      marginBottom: 0,
    },
    detailGroup: {
      marginTop: 28,
      gap: 20,
    },
    detailBlock: {
      gap: 0,
    },
    loadingRow: {
      marginTop: 28,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing["2"],
    },
    loadingText: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
    },
  } satisfies Record<string, ViewStyle | TextStyle>);
}
