import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather, FontAwesome } from "@expo/vector-icons";
import {
  formatMailThreadDateRange,
  type MailSenderKeyTrustState,
  getMailThreadParticipants,
  type MailThreadParticipant,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { BlobatarAvatar } from "@workspace/native-core/components/BlobatarAvatar";
import {
  mailColors,
  useMailPalette,
  useMailSkin,
  type MailSkin,
} from "@workspace/native-core/components/mail/mail-ui";
import type { MailSignatureVerificationState } from "../../lib/mail/mail-crypto";
import type {
  JmapAttachment,
  JmapEmailMessage,
  KeyedAttachment,
  LabelDef,
  MessageEncryptionState,
} from "../../lib/mail/types";
import { MailAttachmentCards } from "./MailAttachmentCards";
import { MailLabelChip } from "./MailLabelChip";
import { MailSecurityIndicator } from "./MailSecurityIndicator";

const MAX_PARTICIPANT_CHIPS = 4;

type MailThreadHeaderProps = {
  subject: string;
  messages: JmapEmailMessage[];
  accountEmail?: string;
  timezone?: string;
  labels: LabelDef[];
  isFlagged: boolean;
  starDisabled?: boolean;
  onToggleStar: () => void;
  encryption: MessageEncryptionState;
  encryptedAtRest: boolean;
  signatureVerificationState?: MailSignatureVerificationState;
  decryptionFailed: boolean;
  senderKeyTrustState?: MailSenderKeyTrustState;
  onReviewSenderKey?: () => void;
  attachments: KeyedAttachment[];
  downloadingBlobId: string | null;
  onOpenAttachment: (attachment: JmapAttachment, cacheKey: string) => void;
};

export function MailThreadHeader({
  subject,
  messages,
  accountEmail,
  timezone,
  labels,
  isFlagged,
  starDisabled,
  onToggleStar,
  encryption,
  encryptedAtRest,
  signatureVerificationState,
  senderKeyTrustState,
  onReviewSenderKey,
  decryptionFailed,
  attachments,
  downloadingBlobId,
  onOpenAttachment,
}: MailThreadHeaderProps) {
  const { theme } = useTheme();
  const skin = useMailSkin();
  const palette = useMailPalette();
  const styles = createStyles(theme, skin);
  const count = messages.length;
  const isThread = count > 1;
  const participants = isThread
    ? getMailThreadParticipants(messages, accountEmail)
    : [];
  const shownParticipants = participants.slice(0, MAX_PARTICIPANT_CHIPS);
  const hiddenParticipants = participants.length - shownParticipants.length;
  const dateRange = isThread
    ? formatMailThreadDateRange(messages, timezone)
    : null;

  return (
    <View style={styles.root}>
      <View style={styles.subjectRow}>
        <Text style={styles.subject} selectable>
          {subject}
          {isThread ? <Text style={styles.count}>{`  [${count}]`}</Text> : null}
        </Text>
        <View style={styles.subjectActions}>
          <MailSecurityIndicator
            encryption={encryption}
            encryptedAtRest={encryptedAtRest}
            signatureVerificationState={signatureVerificationState}
            senderKeyTrustState={senderKeyTrustState}
            onReviewSenderKey={onReviewSenderKey}
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
        <View style={styles.wrapRow}>
          {labels.map((label) => (
            <MailLabelChip
              key={label.id}
              name={label.name}
              color={label.color}
            />
          ))}
        </View>
      ) : null}

      {isThread ? (
        <View style={styles.wrapRow}>
          {dateRange ? (
            <View style={styles.dateRange}>
              <Feather name="calendar" size={12} color={skin.textTertiary} />
              <Text style={styles.meta}>{dateRange}</Text>
            </View>
          ) : null}
          {shownParticipants.map((participant) => (
            <ParticipantChip
              key={participant.email}
              participant={participant}
              styles={styles}
            />
          ))}
          {hiddenParticipants > 0 ? (
            <Text style={styles.meta}>+{hiddenParticipants}</Text>
          ) : null}
        </View>
      ) : null}

      {isThread ? (
        <MailAttachmentCards
          attachments={attachments}
          downloadingBlobId={downloadingBlobId}
          onOpenAttachment={onOpenAttachment}
        />
      ) : null}
    </View>
  );
}

function ParticipantChip({
  participant,
  styles,
}: {
  participant: MailThreadParticipant;
  styles: ThreadHeaderStyles;
}) {
  return (
    <View style={styles.participant}>
      <BlobatarAvatar
        email={participant.email}
        name={participant.name}
        size={16}
        borderRadius={8}
      />
      <Text style={styles.participantName} numberOfLines={1}>
        {participant.isSelf ? "You" : participant.name || participant.email}
      </Text>
    </View>
  );
}

type ThreadHeaderStyles = ReturnType<typeof createStyles>;

function createStyles(theme: ThemeTokens, skin: MailSkin) {
  const view = {
    root: {
      gap: theme.spacing["3"],
      paddingBottom: theme.spacing["4"],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: mailColors(theme).border,
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
    starButton: {
      width: 28,
      height: 28,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    wrapRow: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      alignItems: "center" as const,
      gap: 6,
    },
    dateRange: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["1"],
      marginRight: theme.spacing["1"],
    },
    participant: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
      maxWidth: 160,
      paddingVertical: 2,
      paddingLeft: 2,
      paddingRight: theme.spacing["2"],
      borderRadius: theme.borderRadius.full,
      backgroundColor: skin.surface,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    subject: {
      ...skin.title,
      fontSize: 24,
      lineHeight: 30,
      flex: 1,
    },
    count: {
      fontWeight: "400" as TextStyle["fontWeight"],
      color: skin.textTertiary,
      fontVariant: ["tabular-nums"] as TextStyle["fontVariant"],
    },
    meta: {
      ...skin.meta,
      fontVariant: ["tabular-nums"] as TextStyle["fontVariant"],
    },
    participantName: {
      flexShrink: 1,
      fontSize: 13,
      lineHeight: 17,
      color: theme.colors.foreground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
