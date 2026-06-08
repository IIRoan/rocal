import { useMemo } from "react";
import {
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import type { EventReminderMailView } from "@workspace/calendar-core";
import {
  EVENT_REMINDER_MAIL_CONTENT_HEIGHT_PX,
  EVENT_REMINDER_MAIL_MAX_WIDTH_PX,
  EVENT_REMINDER_MAIL_MIN_FILL_RATIO,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";

const LOGO_URL = "https://solace.onl/favicon-192x192.png";

type EventReminderMessageBodyProps = {
  reminder: EventReminderMailView;
  onOpenEvent?: () => void;
  attachedBelowBanner?: boolean;
};

export function EventReminderMessageBody({
  reminder,
  onOpenEvent,
  attachedBelowBanner = false,
}: EventReminderMessageBodyProps) {
  const { theme, isDark } = useTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const styles = useMemo(
    () => createStyles(theme, isDark, windowWidth, windowHeight),
    [theme, isDark, windowWidth, windowHeight],
  );

  const openSettings = () => {
    void Linking.openURL("https://solace.onl/settings");
  };

  const openPrivacy = () => {
    void Linking.openURL("https://solace.onl/privacy");
  };

  return (
    <View
      style={[
        styles.container,
        attachedBelowBanner && styles.containerAttached,
      ]}
    >
      <Image
        source={{ uri: LOGO_URL }}
        style={styles.logo}
        accessibilityLabel="Solace"
      />

      <Text style={styles.title}>{reminder.title}</Text>
      <Text style={styles.subtitle}>{reminder.timeUntilEvent}</Text>

      <View style={styles.details}>
        <ReminderDetail
          label="When"
          value={`${reminder.eventDate} · ${reminder.eventTime}`}
          styles={styles}
        />
        {reminder.location ? (
          <ReminderDetail
            label="Where"
            value={reminder.location}
            styles={styles}
          />
        ) : null}
        {reminder.calendarName ? (
          <ReminderDetail
            label="Calendar"
            value={reminder.calendarName}
            styles={styles}
          />
        ) : null}
        {reminder.duration ? (
          <ReminderDetail
            label="Duration"
            value={reminder.duration}
            styles={styles}
          />
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
          <Text style={styles.openButtonText}>Open Event</Text>
        </Pressable>
      ) : null}

      <View style={styles.divider} />

      <Text style={styles.footerBrand}>Solace</Text>
      <Text style={styles.footerCopy}>
        This reminder was sent because email notifications are enabled for your
        account.
      </Text>
      <View style={styles.footerLinks}>
        <Pressable onPress={openSettings} hitSlop={8}>
          <Text style={styles.footerLink}>Settings</Text>
        </Pressable>
        <Text style={styles.footerSeparator}>·</Text>
        <Pressable onPress={openPrivacy} hitSlop={8}>
          <Text style={styles.footerLink}>Privacy</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ReminderDetail({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.detailBlock}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
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
    logo: {
      width: 36,
      height: 36,
      marginBottom: theme.spacing["5"],
    },
    title: {
      fontSize: 22,
      lineHeight: 29,
      fontWeight: theme.typography.fontWeight.bold as TextStyle["fontWeight"],
      letterSpacing: -0.22,
      color: isDark ? "#ffffff" : "#000000",
    },
    subtitle: {
      marginTop: 6,
      fontSize: 15,
      lineHeight: 20,
      color: isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.50)",
    },
    details: {
      marginTop: 28,
    },
    detailBlock: {
      marginBottom: 18,
    },
    detailLabel: {
      marginBottom: 4,
      fontSize: 11,
      lineHeight: 14,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      letterSpacing: 0.66,
      textTransform: "uppercase",
      color: isDark ? "rgba(255,255,255,0.40)" : "#999999",
    },
    detailValue: {
      fontSize: 16,
      lineHeight: 22,
      fontWeight: theme.typography.fontWeight.normal as TextStyle["fontWeight"],
      color: isDark ? "#e5e5e5" : "#1a1a1a",
    },
    openButton: {
      alignSelf: "flex-start",
      marginTop: 6,
      borderRadius: 12,
      borderWidth: 1,
      borderBottomWidth: 2,
      borderColor: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)",
      backgroundColor: isDark ? "#2a2a2a" : "#ffffff",
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    openButtonPressed: {
      opacity: 0.9,
    },
    openButtonText: {
      fontSize: 15,
      lineHeight: 15,
      fontWeight: theme.typography.fontWeight
        .medium as TextStyle["fontWeight"],
      color: isDark ? "#ffffff" : "#000000",
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: isDark ? "#333333" : "#e5e5e5",
      marginTop: 36,
      marginBottom: 20,
    },
    footerBrand: {
      marginBottom: 6,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: "#a8a8a8",
    },
    footerCopy: {
      marginBottom: 4,
      fontSize: 12,
      lineHeight: 18,
      color: "#a8a8a8",
    },
    footerLinks: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing["1"],
    },
    footerLink: {
      fontSize: 12,
      lineHeight: 18,
      color: "#a8a8a8",
      textDecorationLine: "underline",
    },
    footerSeparator: {
      fontSize: 12,
      color: "#a8a8a8",
    },
  });
}
