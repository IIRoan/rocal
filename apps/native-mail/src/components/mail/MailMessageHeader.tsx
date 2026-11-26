import {
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  enrichSelfMailRecipient,
  getSimpleLoginForward,
  summarizeMailRecipients,
  type SimpleLoginActionMode,
  type TimeFormat,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { formatMessageDate } from "../../lib/mail/mail-helpers";
import type { JmapEmailMessage, JmapIdentity } from "../../lib/mail/types";
import { BlobatarAvatar } from "@workspace/native-core/components/BlobatarAvatar";
import { MailAuthResultsBadge } from "./MailAuthResultsBadge";
import { MailRecipientsButton } from "./MailRecipientsSheet";
import { MailSimpleLoginRow } from "./MailSimpleLoginRow";
import { MailUnsubscribeRow } from "./MailUnsubscribeRow";
import { RecipientSheet } from "./RecipientSheet";
import {
  MAIL_LAYOUT,
  useMailSkin,
  type MailSkin,
} from "@workspace/native-core/components/mail/mail-ui";

export type MailMessageHeaderProps = {
  message: JmapEmailMessage;
  accountEmail?: string;
  accountName?: string | null;
  identities: JmapIdentity[];
  simpleLoginPending: boolean;
  onSimpleLoginAction: (message: JmapEmailMessage, mode: SimpleLoginActionMode) => void;
  unsubscribePending: boolean;
  onUnsubscribe: (message: JmapEmailMessage) => void;
  timeFormat: TimeFormat;
  timezone?: string;
};

const AVATAR_SIZE = MAIL_LAYOUT.avatarSize;

export function MailMessageHeader({
  message,
  accountEmail,
  accountName,
  identities,
  simpleLoginPending,
  onSimpleLoginAction,
  unsubscribePending,
  onUnsubscribe,
  timeFormat,
  timezone,
}: MailMessageHeaderProps) {
  const { theme } = useTheme();
  const skin = useMailSkin();
  const styles = createStyles(theme, skin);

  const sender = message.from?.[0]
    ? enrichSelfMailRecipient(message.from[0], { email: accountEmail, name: accountName })
    : null;
  const senderName = sender?.name?.trim() || sender?.email || "Unknown sender";
  const senderAddress = sender?.email && sender.name?.trim() && sender.name.trim() !== sender.email ? sender.email : null;
  const recipients = summarizeMailRecipients(message, {
    email: accountEmail,
    name: accountName,
    identityEmails: identities.map((identity) => identity.email),
  });
  const dateOptions = { timeFormat, timezone };
  const compactDate = formatMessageDate(message.receivedAt, dateOptions);
  const fullDate = formatMessageDate(message.receivedAt, { ...dateOptions, style: "full" });
  const meta = [senderAddress, compactDate].filter(Boolean).join(" · ");

  return (
    <View style={styles.senderRow}>
      {sender ? (
        <RecipientSheet recipient={sender}>
          <BlobatarAvatar email={sender.email} name={sender.name} size={AVATAR_SIZE} borderRadius={theme.borderRadius.md} />
        </RecipientSheet>
      ) : (
        <BlobatarAvatar size={AVATAR_SIZE} borderRadius={theme.borderRadius.md} />
      )}

      <View style={styles.senderColumn}>
        <View style={styles.nameRow}>
          {sender ? (
            <RecipientSheet recipient={sender} style={styles.nameSheet}>
              <Text style={styles.senderName} numberOfLines={1}>
                {senderName}
              </Text>
            </RecipientSheet>
          ) : (
            <Text style={styles.senderName}>Unknown sender</Text>
          )}
          <MailAuthResultsBadge message={message} simpleLoginForward={getSimpleLoginForward(message) !== null} />
        </View>
        {meta ? (
          <Text style={styles.meta} numberOfLines={1} selectable>
            {meta}
          </Text>
        ) : null}
        {recipients.selfTag ? (
          <View style={styles.tagLine} accessible accessibilityLabel={`Sent to your +${recipients.selfTag} address`}>
            <Feather name="tag" size={12} color={theme.colors.primaryBase} />
            <Text style={styles.meta}>to</Text>
            <Text style={styles.tag}>+{recipients.selfTag}</Text>
          </View>
        ) : null}
        <MailSimpleLoginRow
          message={message}
          identities={identities}
          pending={simpleLoginPending}
          onRun={onSimpleLoginAction}
        />
        <MailUnsubscribeRow
          message={message}
          identities={identities}
          pending={unsubscribePending}
          onUnsubscribe={onUnsubscribe}
        />
      </View>

      <MailRecipientsButton summary={recipients} fullDate={fullDate} />
    </View>
  );
}

function createStyles(theme: ThemeTokens, skin: MailSkin) {
  const view = {
    senderRow: {
      flexDirection: "row" as const,
      alignItems: "flex-start" as const,
      gap: theme.spacing["3"],
    },
    senderColumn: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    nameRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["1"],
      minWidth: 0,
    },
    nameSheet: {
      flexShrink: 1,
      minWidth: 0,
    },
    tagLine: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["1"],
      marginTop: theme.spacing["1"],
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    senderName: {
      flexShrink: 1,
      fontSize: 16,
      lineHeight: 21,
      fontWeight: "600" as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    meta: {
      ...skin.meta,
      fontVariant: ["tabular-nums"] as TextStyle["fontVariant"],
    },
    tag: {
      ...skin.meta,
      color: theme.colors.primaryBase,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
