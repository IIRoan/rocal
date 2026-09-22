import { useMemo, useState, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Feather, FontAwesome } from "@expo/vector-icons";
import { enrichSelfMailRecipient } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import { formatMessageDate } from "../../lib/mail/mail-helpers";
import { formatReaderRecipientLine } from "../../lib/mail/reader-recipients";
import type { MailSignatureVerificationState } from "../../lib/mail/mail-crypto";
import type {
  JmapEmailMessage,
  JmapIdentity,
  LabelDef,
  MessageEncryptionState,
} from "../../lib/mail/types";
import { BlobatarAvatar } from "../BlobatarAvatar";
import { MailAuthResultsBadge } from "./MailAuthResultsBadge";
import { MailIdentityBadge } from "./MailIdentityBadge";
import { MailLabelChip } from "./MailLabelChip";
import { MailSecurityIndicator } from "./MailSecurityIndicator";
import { RecipientLinkList, RecipientSheet } from "./RecipientSheet";
import {
  useMailPalette,
  useMailSkin,
  type MailSkin,
} from "./mail-ui";

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
  timeFormat?: "12h" | "24h";
  timezone?: string;
};

const AVATAR_SIZE = 36;
const DETAILS_ANIMATION_MS = 200;
const detailsEntering = FadeIn.duration(DETAILS_ANIMATION_MS);
const detailsExiting = FadeOut.duration(DETAILS_ANIMATION_MS);

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
          <MailSecurityIndicator
            encryption={encryption}
            encryptedAtRest={encryptedAtRest}
            signatureVerificationState={signatureVerificationState}
            decryptionFailed={decryptionFailed}
          />
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
                size={16}
                color={isFlagged ? palette.star : skin.textTertiary}
              />
            </Pressable>
          </View>

          {recipientLine || hasExpandableDetails ? (
            <Pressable
              onPress={() => setDetailsOpen((open) => !open)}
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
        </View>
      </View>

      {detailsOpen ? (
        <Animated.View
          entering={detailsEntering}
          exiting={detailsExiting}
          style={styles.detailsBlock}
        >
          {showSenderEmail && sender ? (
            <DetailsRow styles={styles} label="From">
              <Text style={styles.detailsValue} selectable>
                {sender.email}
              </Text>
            </DetailsRow>
          ) : null}
          {message.to?.length ? (
            <DetailsRow styles={styles} label="To">
              <RecipientLinkList
                recipients={message.to}
                currentUserEmail={accountEmail}
                currentUserName={accountName}
                textStyle={styles.detailsValue}
              />
            </DetailsRow>
          ) : null}
          {message.cc?.length ? (
            <DetailsRow styles={styles} label="Cc">
              <RecipientLinkList
                recipients={message.cc}
                currentUserEmail={accountEmail}
                currentUserName={accountName}
                textStyle={styles.detailsValue}
              />
            </DetailsRow>
          ) : null}
          {message.bcc?.length ? (
            <DetailsRow styles={styles} label="Bcc">
              <RecipientLinkList
                recipients={message.bcc}
                currentUserEmail={accountEmail}
                currentUserName={accountName}
                textStyle={styles.detailsValue}
              />
            </DetailsRow>
          ) : null}
          {fullDate ? (
            <DetailsRow styles={styles} label="Date">
              <Text style={styles.detailsValue}>{fullDate}</Text>
            </DetailsRow>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
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
  return (
    <View style={styles.senderNameRow}>
      <Text style={styles.senderName} numberOfLines={1}>
        {name}
      </Text>
      <MailIdentityBadge message={message} identities={identities} compact />
      <MailAuthResultsBadge
        authResultsHeaders={message["header:Authentication-Results"]}
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
    },
    subjectBlock: {
      gap: theme.spacing["2"],
    },
    subjectRow: {
      flexDirection: "row" as const,
      alignItems: "flex-start" as const,
      gap: theme.spacing["2"],
    },
    labelRow: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      gap: 6,
    },
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
      flex: 1,
    },
    senderName: {
      flexShrink: 1,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: "700" as TextStyle["fontWeight"],
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
