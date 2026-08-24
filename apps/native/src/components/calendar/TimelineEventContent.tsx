import { StyleSheet, Text, View, type TextStyle, type ViewStyle } from "react-native";
import type { TimelineEventDensity } from "./timeline-event-content";

interface TimelineEventContentProps {
  title: string;
  titleColor: string;
  cancelled?: boolean;
  density: TimelineEventDensity;
  titleLines?: number;
  spanLabel?: string | null;
}

export function TimelineEventContent({
  title,
  titleColor,
  cancelled = false,
  density,
  titleLines = 1,
  spanLabel,
}: TimelineEventContentProps) {
  const compact = density === "compact";

  return (
    <View style={[styles.root, compact ? styles.rootCompact : styles.rootPadded]}>
      <Text
        style={[
          styles.title,
          compact ? styles.titleCompact : null,
          density === "small" ? styles.titleSmall : null,
          { color: titleColor },
          cancelled ? styles.titleCancelled : null,
        ]}
        numberOfLines={titleLines}
        ellipsizeMode="clip"
        allowFontScaling={false}
      >
        {title}
      </Text>
      {spanLabel ? (
        <Text
          style={[
            styles.spanLabel,
            compact ? styles.spanLabelCompact : null,
            { color: titleColor },
          ]}
          numberOfLines={1}
          ellipsizeMode="clip"
          allowFontScaling={false}
        >
          {spanLabel}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignSelf: "stretch",
    minWidth: 0,
    overflow: "hidden",
    justifyContent: "flex-start",
  } satisfies ViewStyle,
  rootCompact: {
    paddingHorizontal: 2,
    paddingTop: 0,
  } satisfies ViewStyle,
  rootPadded: {
    paddingHorizontal: 3,
    paddingTop: 1,
  } satisfies ViewStyle,
  title: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "600",
    includeFontPadding: false,
  } satisfies TextStyle,
  titleCompact: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "500",
  } satisfies TextStyle,
  titleSmall: {
    fontSize: 9,
    lineHeight: 11,
  } satisfies TextStyle,
  titleCancelled: {
    textDecorationLine: "line-through",
    opacity: 0.7,
  } satisfies TextStyle,
  spanLabel: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "400",
    includeFontPadding: false,
    opacity: 0.8,
    fontVariant: ["tabular-nums"],
  } satisfies TextStyle,
  spanLabelCompact: {
    fontSize: 8,
    lineHeight: 10,
  } satisfies TextStyle,
});
