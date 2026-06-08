import { useMemo, type ComponentProps } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import type { EventReminderMailView } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";

type EventReminderBannerProps = {
  loading?: boolean;
  error?: string | null;
  reminder?: EventReminderMailView | null;
  onOpenEvent?: () => void;
};

export function EventReminderBanner({
  loading = false,
  error = null,
  reminder,
  onOpenEvent,
}: EventReminderBannerProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <View style={styles.labelRow}>
            <Feather
              name="bell"
              size={12}
              color={theme.colors.primaryBase}
            />
            <Text style={styles.label}>Event reminder</Text>
          </View>
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator
                size="small"
                color={theme.colors.mutedForeground}
              />
              <Text style={styles.loadingTitle}>Loading event details…</Text>
            </View>
          ) : (
            <Text style={styles.title}>
              {error ? "Couldn't load event" : (reminder?.title ?? "Event reminder")}
            </Text>
          )}
          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : loading ? (
            <Text style={styles.description}>
              Fetching the latest event content from your calendar.
            </Text>
          ) : reminder ? (
            <Text style={styles.description}>{reminder.timeUntilEvent}</Text>
          ) : null}
        </View>
        {onOpenEvent ? (
          <Pressable
            onPress={onOpenEvent}
            style={({ pressed }) => [
              styles.openButton,
              pressed && styles.openButtonPressed,
            ]}
          >
            <Text style={styles.openButtonText}>Open</Text>
            <Feather
              name="external-link"
              size={12}
              color={theme.colors.foreground}
            />
          </Pressable>
        ) : null}
      </View>
      {!loading && !error && reminder ? (
        <View style={styles.meta}>
          <MetaRow
            icon="clock"
            text={`${reminder.eventDate} · ${reminder.eventTime}`}
            styles={styles}
            theme={theme}
          />
          {reminder.location ? (
            <MetaRow
              icon="map-pin"
              text={reminder.location}
              styles={styles}
              theme={theme}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function MetaRow({
  icon,
  text,
  styles,
  theme,
}: {
  icon: ComponentProps<typeof Feather>["name"];
  text: string;
  styles: ReturnType<typeof createStyles>;
  theme: ThemeTokens;
}) {
  return (
    <View style={styles.metaRow}>
      <Feather name={icon} size={14} color={theme.colors.mutedForeground} />
      <Text style={styles.metaText} numberOfLines={2}>
        {text}
      </Text>
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  return {
    container: {
      marginBottom: 0,
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["3"],
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.primaryBase + "26",
      borderTopLeftRadius: theme.borderRadius.lg,
      borderTopRightRadius: theme.borderRadius.lg,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      backgroundColor: theme.colors.primaryBase + "0A",
    } satisfies ViewStyle,
    headerRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: theme.spacing["3"],
    } satisfies ViewStyle,
    headerCopy: {
      flex: 1,
      minWidth: 0,
      gap: theme.spacing["1"],
    } satisfies ViewStyle,
    labelRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing["1"],
    } satisfies ViewStyle,
    label: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      fontWeight: theme.typography.fontWeight.semibold as TextStyle["fontWeight"],
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: theme.colors.primaryBase,
    } satisfies TextStyle,
    loadingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing["2"],
    } satisfies ViewStyle,
    loadingTitle: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      fontWeight: theme.typography.fontWeight.semibold as TextStyle["fontWeight"],
      color: theme.colors.mutedForeground,
    } satisfies TextStyle,
    title: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      fontWeight: theme.typography.fontWeight.semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    } satisfies TextStyle,
    description: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
    } satisfies TextStyle,
    errorText: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.destructive,
    } satisfies TextStyle,
    openButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing["1"],
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["2"],
      borderRadius: theme.borderRadius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.card,
    } satisfies ViewStyle,
    openButtonPressed: {
      opacity: 0.7,
    } satisfies ViewStyle,
    openButtonText: {
      fontSize: theme.typography.fontSize.xs.size,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    } satisfies TextStyle,
    meta: {
      marginTop: theme.spacing["2"],
      gap: theme.spacing["1.5"],
    } satisfies ViewStyle,
    metaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing["2"],
    } satisfies ViewStyle,
    metaText: {
      flex: 1,
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
      opacity: 0.85,
    } satisfies TextStyle,
  };
}
