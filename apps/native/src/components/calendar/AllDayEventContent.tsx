import { useMemo } from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";

interface AllDayEventContentProps {
  title: string;
  titleColor: string;
  cancelled: boolean;
  spanLabel: string | null;
}

export function AllDayEventContent({
  title,
  titleColor,
  cancelled,
  spanLabel,
}: AllDayEventContentProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.root}>
      <Text
        style={[
          styles.title,
          { color: titleColor },
          cancelled && styles.cancelled,
        ]}
        numberOfLines={1}
        ellipsizeMode="tail"
        allowFontScaling={false}
      >
        {title}
      </Text>
      {spanLabel ? (
        <Text
          style={[styles.spanLabel, { color: titleColor }]}
          numberOfLines={1}
          ellipsizeMode="tail"
          allowFontScaling={false}
        >
          {spanLabel}
        </Text>
      ) : null}
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  const font = theme.typography.fontSize.xs;

  return StyleSheet.create({
    root: {
      flex: 1,
      flexDirection: "row",
      minWidth: 0,
      alignSelf: "stretch",
      alignItems: "center",
      columnGap: theme.spacing["1"],
      paddingHorizontal: theme.spacing["1"],
      overflow: "hidden",
    },
    title: {
      flex: 1,
      minWidth: 0,
      fontSize: font.size,
      lineHeight: font.lineHeight,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      includeFontPadding: false,
    },
    cancelled: {
      textDecorationLine: "line-through",
      opacity: 0.7,
    },
    spanLabel: {
      flexShrink: 1,
      maxWidth: "45%",
      fontSize: font.size,
      lineHeight: font.lineHeight,
      includeFontPadding: false,
      fontVariant: ["tabular-nums"],
      opacity: 0.75,
    },
  });
}
