import { useMemo } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  getSimpleLoginForward,
  resolveMessageReplyFrom,
  SIMPLELOGIN_DONE_KEYWORD,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { MAIL_LAYOUT } from "@workspace/native-core/components/mail/mail-ui";
import type { JmapEmailMessage, JmapIdentity } from "../../lib/mail/types";

export function MailSimpleLoginBanner({
  message,
  identities,
  pending,
  onRun,
}: {
  message: JmapEmailMessage;
  identities: JmapIdentity[];
  pending: boolean;
  onRun: (message: JmapEmailMessage) => void;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const action = getSimpleLoginForward(message)?.action;
  if (!action) return null;
  // A mailto command only works from the mailbox SimpleLogin forwards to.
  if (action.target.type === "mailto" && !resolveMessageReplyFrom(identities, message)) {
    return null;
  }
  const done = message.keywords?.[SIMPLELOGIN_DONE_KEYWORD] === true;

  const confirm = () =>
    Alert.alert(action.confirmTitle, action.confirmMessage, [
      { text: "Cancel", style: "cancel" },
      {
        text: action.label,
        style: action.kind === "unsubscribe" ? "default" : "destructive",
        onPress: () => onRun(message),
      },
    ]);

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>This message is from a SimpleLogin alias.</Text>
      {done || pending ? (
        <View style={styles.status}>
          <Feather
            name={done && !pending ? "check" : "clock"}
            size={14}
            color={theme.colors.mutedForeground}
          />
          <Text style={styles.text}>
            {pending ? action.pendingLabel : action.doneLabel}
          </Text>
        </View>
      ) : (
        <Pressable
          onPress={confirm}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          accessibilityRole="button"
          accessibilityLabel={action.label}
        >
          <Text style={styles.buttonText}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  const view = {
    banner: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      gap: theme.spacing["2"],
      paddingHorizontal: theme.spacing["3"],
      paddingVertical: theme.spacing["2"],
      borderRadius: theme.borderRadius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.card,
    },
    status: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["1"],
      minHeight: MAIL_LAYOUT.hitSize,
    },
    button: {
      justifyContent: "center" as const,
      minHeight: MAIL_LAYOUT.hitSize,
      paddingHorizontal: theme.spacing["3"],
      borderRadius: theme.borderRadius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
    },
    buttonPressed: {
      backgroundColor: theme.colors.muted,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    text: {
      fontSize: theme.typography.fontSize.xs.size,
      color: theme.colors.mutedForeground,
    },
    buttonText: {
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.foreground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
