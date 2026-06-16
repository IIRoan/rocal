import { useMemo } from "react";
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
import type { MailCalendarInvite } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";

type InvitationResponseStatus = "accepted" | "declined" | "tentative";

type CalendarInviteBannerProps = {
  invite: MailCalendarInvite;
  loading?: boolean;
  error?: string | null;
  inviteDeclined?: boolean;
  invitationStatus?: string | null;
  inviteResponsePending?: InvitationResponseStatus | null;
  formattedStart?: string | null;
  onAccept?: () => void;
  onMaybe?: () => void;
  onDecline?: () => void;
  onOpenEvent?: () => void;
};

export function CalendarInviteBanner({
  invite,
  loading = false,
  error = null,
  inviteDeclined = false,
  invitationStatus = null,
  inviteResponsePending = null,
  formattedStart = null,
  onAccept,
  onMaybe,
  onDecline,
  onOpenEvent,
}: CalendarInviteBannerProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const isPending = !invitationStatus || invitationStatus === "pending";

  return (
    <View style={styles.container}>
      <View style={styles.headerCopy}>
        <Text style={styles.title}>{invite.title}</Text>
        {formattedStart ? (
          <View style={styles.metaRow}>
            <Feather name="clock" size={14} color={theme.colors.mutedForeground} />
            <Text style={styles.metaText}>{formattedStart}</Text>
          </View>
        ) : null}
        {invite.location ? (
          <View style={styles.metaRow}>
            <Feather name="map-pin" size={14} color={theme.colors.mutedForeground} />
            <Text style={styles.metaText} numberOfLines={2}>
              {invite.location}
            </Text>
          </View>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={theme.colors.mutedForeground} />
          <Text style={styles.statusText}>Adding to calendar…</Text>
        </View>
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : inviteDeclined ? (
        <Text style={styles.statusText}>Declined, removed</Text>
      ) : isPending ? (
        <View style={styles.actions}>
          <ActionButton
            label="Accept"
            icon="check"
            loading={inviteResponsePending === "accepted"}
            disabled={inviteResponsePending !== null}
            onPress={onAccept}
            styles={styles}
            theme={theme}
            primary
          />
          <ActionButton
            label="Maybe"
            loading={inviteResponsePending === "tentative"}
            disabled={inviteResponsePending !== null}
            onPress={onMaybe}
            styles={styles}
            theme={theme}
          />
          <ActionButton
            label="Decline"
            loading={inviteResponsePending === "declined"}
            disabled={inviteResponsePending !== null}
            onPress={onDecline}
            styles={styles}
            theme={theme}
            muted
          />
        </View>
      ) : (
        <View style={styles.actions}>
          <Text style={styles.statusText}>
            {invitationStatus === "tentative" ? "Maybe" : "Accepted"}
          </Text>
          {onOpenEvent ? (
            <Pressable
              onPress={onOpenEvent}
              style={({ pressed }) => [
                styles.openButton,
                pressed && styles.openButtonPressed,
              ]}
            >
              <Text style={styles.openButtonText}>Open in calendar</Text>
              <Feather
                name="external-link"
                size={12}
                color={theme.colors.foreground}
              />
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

function ActionButton({
  label,
  icon,
  loading = false,
  disabled = false,
  onPress,
  styles,
  theme,
  primary = false,
  muted = false,
}: {
  label: string;
  icon?: keyof typeof Feather.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  styles: ReturnType<typeof createStyles>;
  theme: ThemeTokens;
  primary?: boolean;
  muted?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled || !onPress}
      onPress={onPress}
      style={({ pressed }) =>
        StyleSheet.flatten([
          styles.actionButton,
          primary ? styles.actionButtonPrimary : null,
          muted ? styles.actionButtonMuted : null,
          (disabled || pressed) ? styles.actionButtonPressed : null,
        ])
      }
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={primary ? theme.colors.primaryForeground : theme.colors.foreground}
        />
      ) : icon ? (
        <Feather
          name={icon}
          size={12}
          color={primary ? theme.colors.primaryForeground : theme.colors.foreground}
        />
      ) : null}
      <Text
        style={[
          styles.actionButtonText,
          primary && styles.actionButtonTextPrimary,
          muted && styles.actionButtonTextMuted,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function createStyles(theme: ThemeTokens) {
  return {
    container: {
      marginBottom: 0,
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["3"],
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderTopLeftRadius: theme.borderRadius.lg,
      borderTopRightRadius: theme.borderRadius.lg,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      backgroundColor: theme.colors.card,
      gap: theme.spacing["2.5"],
    } satisfies ViewStyle,
    headerCopy: {
      minWidth: 0,
      gap: theme.spacing["1.5"],
    } satisfies ViewStyle,
    title: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      fontWeight: theme.typography.fontWeight.semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    } satisfies TextStyle,
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
    loadingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing["2"],
    } satisfies ViewStyle,
    statusText: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
    } satisfies TextStyle,
    errorText: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.destructive,
    } satisfies TextStyle,
    actions: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: theme.spacing["2"],
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
      paddingTop: theme.spacing["2.5"],
    } satisfies ViewStyle,
    actionButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing["1"],
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["2"],
      borderRadius: theme.borderRadius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.background,
      minHeight: 32,
    } satisfies ViewStyle,
    actionButtonPrimary: {
      backgroundColor: theme.colors.primaryBase,
      borderColor: theme.colors.primaryBase,
    } satisfies ViewStyle,
    actionButtonMuted: {
      borderColor: "transparent",
      backgroundColor: "transparent",
    } satisfies ViewStyle,
    actionButtonPressed: {
      opacity: 0.7,
    } satisfies ViewStyle,
    actionButtonText: {
      fontSize: theme.typography.fontSize.xs.size,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    } satisfies TextStyle,
    actionButtonTextPrimary: {
      color: theme.colors.primaryForeground,
    } satisfies TextStyle,
    actionButtonTextMuted: {
      color: theme.colors.mutedForeground,
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
      backgroundColor: theme.colors.background,
      marginLeft: "auto",
    } satisfies ViewStyle,
    openButtonPressed: {
      opacity: 0.7,
    } satisfies ViewStyle,
    openButtonText: {
      fontSize: theme.typography.fontSize.xs.size,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    } satisfies TextStyle,
  };
}
