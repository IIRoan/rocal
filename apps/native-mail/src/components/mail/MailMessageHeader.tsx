import { useMemo, useState, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Feather, FontAwesome } from "@expo/vector-icons";
import {
  enrichSelfMailRecipient,
  getSimpleLoginForward,
  type TimeFormat,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { formatMessageDate } from "../../lib/mail/mail-helpers";
import { formatReaderRecipientLine } from "../../lib/mail/reader-recipients";
import type { MailSignatureVerificationState } from "../../lib/mail/mail-crypto";
import type {
  JmapEmailMessage,
  JmapIdentity,
  LabelDef,
  MessageEncryptionState,
} from "../../lib/mail/types";
import { BlobatarAvatar } from "@workspace/native-core/components/BlobatarAvatar";
import { MailAuthResultsBadge } from "./MailAuthResultsBadge";
import { MailIdentityBadge } from "./MailIdentityBadge";
import { MailLabelChip } from "./MailLabelChip";
import { MailSimpleLoginBadge } from "./MailSimpleLoginBadge";
import { MailSecurityIndicator } from "./MailSecurityIndicator";
import { RecipientLinkList, RecipientSheet } from "./RecipientSheet";
import {
  MAIL_LAYOUT,
  mailColors,
  useMailPalette,
  useMailSkin,
  type MailSkin,
} from "@workspace/native-core/components/mail/mail-ui";

export type MailMessageHeaderProps = {
  message: JmapEmailMessage;
  accountEmail?: string;
  accountName?: string | null;
  identities: JmapIdentity[];
  labels: LabelDef[];
  isFlagged: boolean;
  starDisabled?: boolean;
  onToggleStar: () => void;
  encryption: MessageEncryptionState;
  encryptedAtRest: boolean;
  signatureVerificationState?: MailSignatureVerificationState;
  decryptionFailed: boolean;
  timeFormat: TimeFormat;
  timezone?: string;
};

const AVATAR_SIZE = MAIL_LAYOUT.avatarSize;
/** No exit fade: siblings reflow at once, so a fading ghost would overlap the body below. */
const detailsEntering = FadeIn.duration(200);

export function MailMessageHeader({
  message,
  accountEmail,
  accountName,
  identities,
  labels,
  isFlagged,
  starDisabled,
  onToggleStar,
  encryption,
  encryptedAtRest,
  signatureVerificationState,
  decryptionFailed,
  timeFormat,
  timezone,
}: MailMessageHeaderProps) {
  const { theme } = useTheme();
  const skin = useMailSkin();
  const palette = useMailPalette();
  const styles = useMemo(() => createStyles(theme, skin), [skin, theme]);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const {
    sender,
    senderName,
    showSenderEmail,
    recipientLine,
    hasExpandableDetails,
  } = getMessageHeaderDetails(message, accountEmail, accountName);
  const dateOptions = { timeFormat, timezone };
  const compactDate = formatMessageDate(message.receivedAt, dateOptions);
  const fullDate = formatMessageDate(message.receivedAt, {
    ...dateOptions,
    style: "full",
  });

  return (
    <View style={styles.root}>
      <View style={styles.subjectBlock}>
        <View style={styles.subjectRow}>
          <Text style={styles.subject} selectable>
            {message.subject?.trim() || "(no subject)"}
          </Text>
          <View style={styles.subjectActions}>
            <MailSecurityIndicator
              encryption={encryption}
              encryptedAtRest={encryptedAtRest}
              signatureVerificationState={signatureVerificationState}
              decryptionFailed={decryptionFailed}
            />
            <Pressable
              onPress={onToggleStar}
              disabled={starDisabled}
              hitSlop={8}
              style={styles.starButton}
              accessibilityRole="button"
              accessibilityLabel={isFlagged ? "Unstar" : "Star"}
            >
              <FontAwesome
                name={isFlagged ? "star" : "star-o"}
                size={18}
                color={isFlagged ? palette.star : skin.textTertiary}
              />
            </Pressable>
          </View>
        </View>

        {labels.length > 0 ? (
          <View style={styles.labelRow}>
            {labels.map((label) => (
              <MailLabelChip
                key={label.id}
                name={label.name}
                color={label.color}
              />
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.senderRow}>
        {sender ? (
          <RecipientSheet recipient={sender}>
            <BlobatarAvatar
              email={sender.email}
              name={sender.name}
              size={AVATAR_SIZE}
              borderRadius={theme.borderRadius.md}
            />
          </RecipientSheet>
        ) : (
          <BlobatarAvatar
            size={AVATAR_SIZE}
            borderRadius={theme.borderRadius.md}
          />
        )}

        <View style={styles.senderColumn}>
          <View style={styles.nameRow}>
            {sender ? (
              <RecipientSheet recipient={sender} style={styles.nameSheet}>
                <SenderName
                  styles={styles}
                  name={senderName}
                  message={message}
                  identities={identities}
                />
              </RecipientSheet>
            ) : (
              <View style={styles.nameSheet}>
                <Text style={styles.senderName}>Unknown sender</Text>
              </View>
            )}
            {compactDate ? (
              <Text style={styles.date}>{compactDate}</Text>
            ) : null}
          </View>

          <MessageDetailsToggle
            styles={styles}
            recipientLine={recipientLine}
            hasExpandableDetails={hasExpandableDetails}
            detailsOpen={detailsOpen}
            onToggle={() => setDetailsOpen((open) => !open)}
          />
        </View>
      </View>

      {detailsOpen ? (
        <MessageDetails
          styles={styles}
          message={message}
          accountEmail={accountEmail}
          accountName={accountName}
          senderEmail={showSenderEmail ? sender?.email : undefined}
          fullDate={fullDate}
        />
      ) : null}
    </View>
  );
}

function MessageDetailsToggle({
  styles,
  recipientLine,
  hasExpandableDetails,
  detailsOpen,
  onToggle,
}: {
  styles: HeaderStyles;
  recipientLine: string;
  hasExpandableDetails: boolean;
  detailsOpen: boolean;
  onToggle: () => void;
}) {
  const skin = useMailSkin();
  return (
    <>
      {recipientLine || hasExpandableDetails ? (
        <Pressable
          onPress={onToggle}
          disabled={!hasExpandableDetails}
          hitSlop={{ top: 8, bottom: 8 }}
          style={styles.recipientRow}
          accessibilityRole="button"
          accessibilityState={{ expanded: detailsOpen }}
          accessibilityLabel={
            detailsOpen ? "Hide message details" : "Show message details"
          }
        >
          <Text style={styles.recipientLine} numberOfLines={1}>
            {recipientLine || "No recipients"}
          </Text>
          {hasExpandableDetails ? (
            <Feather
              name={detailsOpen ? "chevron-up" : "chevron-down"}
              size={14}
              color={skin.textTertiary}
            />
          ) : null}
        </Pressable>
      ) : null}
    </>
  );
}

function getMessageHeaderDetails(
  message: JmapEmailMessage,
  accountEmail?: string,
  accountName?: string | null,
) {
  const sender = message.from?.[0]
    ? enrichSelfMailRecipient(message.from[0], {
        email: accountEmail,
        name: accountName,
      })
    : null;
  const senderName = sender?.name?.trim() || sender?.email || "Unknown sender";
  const showSenderEmail = Boolean(
    sender?.email && sender.name?.trim() && sender.name.trim() !== sender.email,
  );
  const recipientLine = formatReaderRecipientLine(
    message.to,
    message.cc,
    accountEmail,
  );
  const hasExpandableDetails = Boolean(
    showSenderEmail ||
    message.to?.length ||
    message.cc?.length ||
    message.bcc?.length ||
    message.receivedAt,
  );
  return {
    sender,
    senderName,
    showSenderEmail,
    recipientLine,
    hasExpandableDetails,
  };
}

function MessageDetails({
  styles,
  message,
  accountEmail,
  accountName,
  senderEmail,
  fullDate,
}: {
  styles: HeaderStyles;
  message: JmapEmailMessage;
  accountEmail?: string;
  accountName?: string | null;
  senderEmail?: string;
  fullDate: string;
}) {
  return (
    <Animated.View entering={detailsEntering} style={styles.detailsBlock}>
      {senderEmail ? (
        <DetailsRow styles={styles} label="From">
          <Text style={styles.detailsValue} selectable>
            {senderEmail}
          </Text>
        </DetailsRow>
      ) : null}
      {(
        [
          ["To", message.to],
          ["Cc", message.cc],
          ["Bcc", message.bcc],
        ] as const
      ).map(([label, recipients]) =>
        recipients?.length ? (
          <DetailsRow key={label} styles={styles} label={label}>
            <RecipientLinkList
              recipients={recipients}
              currentUserEmail={accountEmail}
              currentUserName={accountName}
              textStyle={styles.detailsValue}
            />
          </DetailsRow>
        ) : null,
      )}
      {fullDate ? (
        <DetailsRow styles={styles} label="Date">
          <Text style={styles.detailsValue}>{fullDate}</Text>
        </DetailsRow>
      ) : null}
    </Animated.View>
  );
}

type HeaderStyles = ReturnType<typeof createStyles>;

function SenderName({
  styles,
  name,
  message,
  identities,
}: {
  styles: HeaderStyles;
  name: string;
  message: JmapEmailMessage;
  identities: JmapIdentity[];
}) {
  const simpleLoginForward = getSimpleLoginForward(message);
  return (
    <View style={styles.senderNameRow}>
      <Text style={styles.senderName} numberOfLines={1}>
        {name}
      </Text>
      <MailIdentityBadge message={message} identities={identities} compact />
      {simpleLoginForward ? (
        <MailSimpleLoginBadge alias={simpleLoginForward.alias} />
      ) : null}
      <MailAuthResultsBadge
        message={message}
        simpleLoginForward={simpleLoginForward !== null}
      />
    </View>
  );
}

function DetailsRow({
  styles,
  label,
  children,
}: {
  styles: HeaderStyles;
  label: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.detailsRow}>
      <Text style={styles.detailsLabel}>{label}</Text>
      <View style={styles.detailsValueWrap}>{children}</View>
    </View>
  );
}

function createStyles(theme: ThemeTokens, skin: MailSkin) {
  const detailsInset = AVATAR_SIZE + theme.spacing["3"];

  const view = {
    root: {
      gap: theme.spacing["4"],
      paddingBottom: theme.spacing["4"],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: mailColors(theme).border,
    },
    subjectBlock: {
      gap: theme.spacing["3"],
    },
    subjectRow: {
      flexDirection: "row" as const,
      alignItems: "flex-start" as const,
      gap: theme.spacing["3"],
    },
    subjectActions: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["1"],
      paddingTop: 1,
    },
    labelRow: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      gap: 6,
    },
    senderRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
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
      gap: theme.spacing["2"],
      minWidth: 0,
    },
    nameSheet: {
      flex: 1,
      minWidth: 0,
    },
    senderNameRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["1"],
      minWidth: 0,
    },
    starButton: {
      width: 28,
      height: 28,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    recipientRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["1"],
      minWidth: 0,
    },
    detailsBlock: {
      gap: theme.spacing["1"],
      paddingLeft: detailsInset,
    },
    detailsRow: {
      flexDirection: "row" as const,
      alignItems: "flex-start" as const,
      gap: theme.spacing["2"],
    },
    detailsValueWrap: {
      flex: 1,
      minWidth: 0,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    subject: {
      ...skin.title,
      fontSize: 24,
      lineHeight: 30,
      flex: 1,
    },
    senderName: {
      flexShrink: 1,
      fontSize: 16,
      lineHeight: 21,
      fontWeight: "600" as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    date: {
      ...skin.meta,
      flexShrink: 0,
      fontVariant: ["tabular-nums"] as TextStyle["fontVariant"],
    },
    recipientLine: {
      ...skin.meta,
      flexShrink: 1,
    },
    detailsLabel: {
      ...skin.meta,
      width: 40,
    },
    detailsValue: {
      fontSize: 13,
      lineHeight: 17,
      color: theme.colors.foreground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
