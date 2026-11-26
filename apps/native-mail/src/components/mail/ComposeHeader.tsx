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
import { COMPOSE_SIGNED_DESCRIPTION, COMPOSE_SIGNED_LABEL } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { MAIL_LAYOUT, useMailSkin, type MailSkin } from "@workspace/native-core/components/mail/mail-ui";
import type { DraftSaveStatus } from "../../hooks/use-compose-draft-autosave";

const CLOSE_SIZE = 30;
const SEND_SIZE = 32;

const DRAFT_STATUS: Record<DraftSaveStatus, string | null> = {
  idle: null,
  saving: "Saving…",
  saved: "Saved",
  error: "Save failed",
};

type ComposeHeaderProps = {
  /** What the drawer is for: New message, Reply, Forward or Draft. */
  title: string;
  canSend: boolean;
  sending: boolean;
  onClose: () => void;
  onSend: () => void;
  /** The armed send time; while set, Send becomes Schedule. */
  scheduledLabel?: string | null;
  onClearSchedule?: () => void;
  draftSaveStatus: DraftSaveStatus;
  /** "Sign messages with my key" is on. */
  signed: boolean;
};

export function ComposeHeader({
  title,
  canSend,
  sending,
  onClose,
  onSend,
  scheduledLabel,
  onClearSchedule,
  draftSaveStatus,
  signed,
}: ComposeHeaderProps) {
  const sendLabel = scheduledLabel ? "Schedule" : "Send";
  const { theme } = useTheme();
  const skin = useMailSkin();
  const styles = createStyles(theme, skin);
  const sendDisabled = !canSend || sending;

  return (
    <View style={styles.shell}>
      <View style={styles.bar}>
        {/* Equal side slots keep the title on the sheet's centre line, whatever each side holds. */}
        <View style={styles.side}>
          <Pressable
            onPress={onClose}
            hitSlop={(MAIL_LAYOUT.hitSize - CLOSE_SIZE) / 2}
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Feather name="x" size={16} color={skin.textSecondary} />
          </Pressable>
        </View>
        <View style={styles.titleStack}>
          <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
          <ComposeStatusLine draftSaveStatus={draftSaveStatus} signed={signed} styles={styles} iconColor={skin.textTertiary} />
        </View>
        <View style={[styles.side, styles.sideEnd]}>
          <Pressable
            onPress={onSend}
            disabled={sendDisabled}
            hitSlop={(MAIL_LAYOUT.hitSize - SEND_SIZE) / 2}
            style={({ pressed }) => [styles.send, !canSend && styles.sendDisabled, pressed && !sendDisabled && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={sendLabel}
            accessibilityState={{ disabled: sendDisabled, busy: sending }}
          >
            {sending ? (
              <ActivityIndicator size="small" color={theme.colors.primaryForeground} />
            ) : (
              <Feather name={scheduledLabel ? "clock" : "arrow-up"} size={18} color={theme.colors.primaryForeground} />
            )}
          </Pressable>
        </View>
      </View>
      {scheduledLabel ? (
        <View style={styles.scheduleRow}>
          <Feather name="clock" size={14} color={theme.colors.primaryBase} />
          <Text style={styles.scheduleText} numberOfLines={1}>
            Scheduled for {scheduledLabel}
          </Text>
          {onClearSchedule ? (
            <Pressable
              onPress={onClearSchedule}
              style={({ pressed }) => [styles.clearSchedule, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Don't schedule"
            >
              <Feather name="x" size={16} color={theme.colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Whether the message will be signed and how its draft is saving, under the title; nothing when neither applies. */
function ComposeStatusLine({
  draftSaveStatus,
  signed,
  styles,
  iconColor,
}: {
  draftSaveStatus: DraftSaveStatus;
  signed: boolean;
  styles: ReturnType<typeof createStyles>;
  iconColor: string;
}) {
  const status = DRAFT_STATUS[draftSaveStatus];
  if (!signed && !status) return null;
  const parts = [signed ? "Signed" : null, status].filter(Boolean).join(" · ");
  return (
    <View
      style={styles.statusLine}
      accessible
      accessibilityLabel={[signed ? `${COMPOSE_SIGNED_LABEL}. ${COMPOSE_SIGNED_DESCRIPTION}` : null, status].filter(Boolean).join(" ")}
      testID={signed ? "compose-signed" : undefined}
    >
      {signed ? <Feather name="pen-tool" size={11} color={iconColor} /> : null}
      <Text style={[styles.statusText, draftSaveStatus === "error" && styles.statusError]} numberOfLines={1}>
        {parts}
      </Text>
    </View>
  );
}

function createStyles(theme: ThemeTokens, skin: MailSkin) {
  const view = {
    shell: {
      backgroundColor: theme.colors.card,
    },
    bar: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      minHeight: MAIL_LAYOUT.hitSize + theme.spacing["3"],
      paddingHorizontal: theme.spacing["4"],
    },
    side: {
      flex: 1,
      flexDirection: "row" as const,
      alignItems: "center" as const,
    },
    sideEnd: {
      justifyContent: "flex-end" as const,
    },
    titleStack: {
      flexShrink: 1,
      alignItems: "center" as const,
      paddingHorizontal: theme.spacing["2"],
    },
    statusLine: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["1"],
    },
    close: {
      width: CLOSE_SIZE,
      height: CLOSE_SIZE,
      borderRadius: CLOSE_SIZE / 2,
      backgroundColor: skin.pressed,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    send: {
      width: SEND_SIZE,
      height: SEND_SIZE,
      borderRadius: SEND_SIZE / 2,
      backgroundColor: theme.colors.primaryBase,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    sendDisabled: {
      opacity: 0.35,
    },
    pressed: {
      opacity: 0.6,
    },
    scheduleRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["2"],
      paddingLeft: theme.spacing["4"],
      paddingRight: theme.spacing["1"],
    },
    clearSchedule: {
      width: MAIL_LAYOUT.hitSize,
      height: MAIL_LAYOUT.hitSize,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    title: {
      fontSize: 16,
      lineHeight: 20,
      fontWeight: "600" as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    statusText: {
      fontSize: 12,
      lineHeight: 16,
      color: skin.textTertiary,
    },
    statusError: {
      color: theme.colors.destructive,
    },
    scheduleText: {
      flex: 1,
      fontSize: 14,
      color: theme.colors.mutedForeground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
