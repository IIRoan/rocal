import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  describeMailUnsubscribe,
  getMailUnsubscribe,
  MAIL_UNSUBSCRIBE_LABELS,
  MAIL_UNSUBSCRIBED_KEYWORD,
  resolveMessageReplyFrom,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useMailSkin, type MailSkin } from "@workspace/native-core/components/mail/mail-ui";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import type { JmapEmailMessage, JmapIdentity } from "../../lib/mail/types";

const LINE_HIT_SLOP = { top: 8, bottom: 8 };

export function MailUnsubscribeRow({
  message,
  identities,
  pending,
  onUnsubscribe,
}: {
  message: JmapEmailMessage;
  identities: JmapIdentity[];
  pending: boolean;
  onUnsubscribe: (message: JmapEmailMessage) => void;
}) {
  const { theme } = useTheme();
  const skin = useMailSkin();
  const styles = createStyles(theme, skin);
  const replyFrom = resolveMessageReplyFrom(identities, message);
  const first = getMailUnsubscribe(message, {
    allowOneClick: true,
    allowMailto: replyFrom !== null,
  })?.targets[0];
  if (!first) return null;
  const done = message.keywords?.[MAIL_UNSUBSCRIBED_KEYWORD] === true;
  const label = pending
    ? MAIL_UNSUBSCRIBE_LABELS.pending
    : done
      ? MAIL_UNSUBSCRIBE_LABELS.done
      : MAIL_UNSUBSCRIBE_LABELS.action;
  const address =
    identities.find((identity) => identity.id === replyFrom?.identityId)?.email ?? "your address";

  const confirm = () => {
    Alert.alert(MAIL_UNSUBSCRIBE_LABELS.title, describeMailUnsubscribe(first, address), [
      { text: "Cancel", style: "cancel" },
      { text: MAIL_UNSUBSCRIBE_LABELS.action, onPress: () => onUnsubscribe(message) },
    ]);
  };

  return (
    <Pressable
      onPress={confirm}
      disabled={pending || done}
      hitSlop={LINE_HIT_SLOP}
      style={styles.line}
      accessibilityRole="button"
      accessibilityState={{ disabled: pending || done }}
      accessibilityLabel={label}
    >
      <Feather name="bell-off" size={12} color={skin.textTertiary} />
      <Text style={styles.lineText} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function createStyles(theme: ThemeTokens, skin: MailSkin) {
  const view = {
    line: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["1"],
      minWidth: 0,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    lineText: {
      ...skin.meta,
      flexShrink: 1,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
