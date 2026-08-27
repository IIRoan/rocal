import { useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { FontAwesome } from "@expo/vector-icons";
import { enrichSelfMailRecipient } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import { formatAttachmentSize } from "../../lib/mail/compose-attachments";
import {
  formatMessageDate,
  formatRecipientSummary,
} from "../../lib/mail/mail-helpers";
import { resolveAttachmentPreviewKind } from "../../lib/mail/attachment-preview";
import type { MailSignatureVerificationState } from "../../lib/mail/mail-crypto";
import type {
  JmapAttachment,
  JmapEmailMessage,
  JmapIdentity,
  LabelDef,
  MessageEncryptionState,
} from "../../lib/mail/types";
import { BlobatarAvatar } from "../BlobatarAvatar";
import { MailAuthResultsBadge } from "./MailAuthResultsBadge";
import { MailIdentityBadge } from "./MailIdentityBadge";
import { MailSecurityIndicator } from "./MailSecurityIndicator";
import { RecipientLinkList, RecipientSheet } from "./RecipientSheet";
import { MAIL_LAYOUT, mailColors, mailSpacing } from "./mail-ui";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export type MailMessageHeaderProps = {
  message: JmapEmailMessage;
  accountEmail?: string;
  accountName?: string | null;
  identities: JmapIdentity[];
  labels: LabelDef[];
  attachments: JmapAttachment[];
  isFlagged: boolean;
  starDisabled?: boolean;
  onToggleStar: () => void;
  downloadingBlobId: string | null;
  onOpenAttachment: (attachment: JmapAttachment, cacheKey: string) => void;
  encryption: MessageEncryptionState;
  encryptedAtRest: boolean;
  signatureVerificationState?: MailSignatureVerificationState;
  decryptionFailed: boolean;
  timeFormat?: "12h" | "24h";
  timezone?: string;
};

function animateLayout() {
  LayoutAnimation.configureNext({
    duration: 200,
    update: { type: LayoutAnimation.Types.easeInEaseOut },
    create: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
    delete: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
  });
}

export function MailMessageHeader({
  message,
  accountEmail,
  accountName,
  identities,
  labels,
  attachments,
  isFlagged,
  starDisabled,
  onToggleStar,
  downloadingBlobId,
  onOpenAttachment,
  encryption,
  encryptedAtRest,
  signatureVerificationState,
  decryptionFailed,
  timeFormat,
  timezone,
}: MailMessageHeaderProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
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
  const toSummary = formatRecipientSummary(message.to, accountEmail);
  const hasExpandableDetails = Boolean(
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
            <View
              key={label.id}
              style={[
                styles.labelChip,
                {
                  borderColor: `${label.color}50`,
                  backgroundColor: `${label.color}18`,
                },
              ]}
            >
              <View
                style={[styles.labelDot, { backgroundColor: label.color }]}
              />
              <Text
                style={[styles.labelText, { color: label.color }]}
                numberOfLines={1}
              >
                {label.name}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.senderSection}>
        <View style={styles.senderTop}>
          {sender ? (
            <RecipientSheet
              recipient={sender}
              style={styles.senderSheet}
            >
              <View style={styles.senderPressable}>
                <BlobatarAvatar
                  email={sender.email}
                  name={sender.name}
                  size={MAIL_LAYOUT.avatarSize}
                />
                <View style={styles.senderIdentity}>
                  <View style={styles.nameRow}>
                    <Text style={styles.senderName} numberOfLines={1}>
                      {senderName}
                    </Text>
                    <MailIdentityBadge
                      message={message}
                      identities={identities}
                      compact
                    />
                    <MailAuthResultsBadge
                      authResultsHeaders={
                        message["header:Authentication-Results"]
                      }
                    />
                  </View>
                  {showSenderEmail ? (
                    <Text style={styles.senderEmail} numberOfLines={1}>
                      {sender.email}
                    </Text>
                  ) : null}
                </View>
              </View>
            </RecipientSheet>
          ) : (
            <View style={styles.senderPressable}>
              <BlobatarAvatar size={MAIL_LAYOUT.avatarSize} />
              <Text style={styles.senderName}>Unknown sender</Text>
            </View>
          )}

          <View style={styles.senderTrailing}>
            {compactDate ? (
              <Text style={styles.compactDate}>{compactDate}</Text>
            ) : null}
            <Pressable
              onPress={onToggleStar}
              disabled={starDisabled}
              hitSlop={6}
              style={styles.starButton}
              accessibilityRole="button"
              accessibilityLabel={isFlagged ? "Unstar" : "Star"}
            >
              <FontAwesome
                name={isFlagged ? "star" : "star-o"}
                size={18}
                color={isFlagged ? "#fbbf24" : theme.colors.mutedForeground}
                style={!isFlagged ? { opacity: 0.45 } : undefined}
              />
            </Pressable>
          </View>
        </View>

        {toSummary || hasExpandableDetails ? (
          <View style={styles.toRow}>
            <Text style={styles.toSummary} numberOfLines={1}>
              {toSummary || "No recipients"}
            </Text>
            {hasExpandableDetails ? (
              <Pressable
                onPress={() => {
                  animateLayout();
                  setDetailsOpen((open) => !open);
                }}
                hitSlop={8}
                style={styles.detailsButton}
                accessibilityRole="button"
                accessibilityState={{ expanded: detailsOpen }}
                accessibilityLabel={
                  detailsOpen ? "Hide message details" : "Show message details"
                }
              >
                <Text style={styles.detailsLabel}>
                  {detailsOpen ? "Hide" : "Details"}
                </Text>
                <Feather
                  name={detailsOpen ? "chevron-up" : "chevron-down"}
                  size={14}
                  color={theme.colors.mutedForeground}
                />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {detailsOpen ? (
          <View style={styles.detailsBlock}>
            {message.to?.length ? (
              <DetailsRow theme={theme} label="To">
                <RecipientLinkList
                  recipients={message.to}
                  currentUserEmail={accountEmail}
                  currentUserName={accountName}
                  textStyle={styles.detailsValue}
                />
              </DetailsRow>
            ) : null}
            {message.cc?.length ? (
              <DetailsRow theme={theme} label="Cc">
                <RecipientLinkList
                  recipients={message.cc}
                  currentUserEmail={accountEmail}
                  currentUserName={accountName}
                  textStyle={styles.detailsValue}
                />
              </DetailsRow>
            ) : null}
            {message.bcc?.length ? (
              <DetailsRow theme={theme} label="Bcc">
                <RecipientLinkList
                  recipients={message.bcc}
                  currentUserEmail={accountEmail}
                  currentUserName={accountName}
                  textStyle={styles.detailsValue}
                />
              </DetailsRow>
            ) : null}
            {fullDate ? (
              <DetailsRow theme={theme} label="Date">
                <Text style={styles.detailsValue}>{fullDate}</Text>
              </DetailsRow>
            ) : null}
          </View>
        ) : null}
      </View>

      {attachments.length > 0 ? (
        <View style={styles.attachmentList}>
          {attachments.map((attachment, index) => {
            const key = attachment.blobId ?? `inline-${index}`;
            const isDownloading = downloadingBlobId === key;
            const previewKind = resolveAttachmentPreviewKind({
              name: attachment.name,
              type: attachment.type,
            });
            const sizeLabel =
              typeof attachment.size === "number" && attachment.size > 0
                ? formatAttachmentSize(attachment.size)
                : null;
            const typeLabel = attachment.type?.split("/")[1]?.toUpperCase();

            return (
              <Pressable
                key={key}
                onPress={() => onOpenAttachment(attachment, key)}
                disabled={isDownloading}
                style={({ pressed }) => [
                  styles.attachmentRow,
                  index === 0 && styles.attachmentRowFirst,
                  pressed && styles.attachmentRowPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${previewKind ? "Preview" : "Download"} ${attachment.name ?? "attachment"}`}
              >
                {isDownloading ? (
                  <ActivityIndicator
                    size={16}
                    color={theme.colors.mutedForeground}
                  />
                ) : (
                  <Feather
                    name="paperclip"
                    size={16}
                    color={theme.colors.mutedForeground}
                  />
                )}
                <View style={styles.attachmentCopy}>
                  <Text style={styles.attachmentName} numberOfLines={1}>
                    {attachment.name ?? "attachment"}
                  </Text>
                  {sizeLabel || typeLabel ? (
                    <Text style={styles.attachmentMeta} numberOfLines={1}>
                      {[typeLabel, sizeLabel].filter(Boolean).join(" · ")}
                    </Text>
                  ) : null}
                </View>
                {!isDownloading ? (
                  <Feather
                    name={previewKind ? "eye" : "download"}
                    size={14}
                    color={theme.colors.mutedForeground}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={styles.divider} />
    </View>
  );
}

function DetailsRow({
  theme,
  label,
  children,
}: {
  theme: ThemeTokens;
  label: string;
  children: ReactNode;
}) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.detailsRow}>
      <Text style={styles.detailsLabelCol}>{label}</Text>
      <View style={styles.detailsValueWrap}>{children}</View>
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  const pad = mailSpacing(theme);
  const colors = mailColors(theme);

  const view = {
    root: {
      gap: pad.section,
    },
    subjectRow: {
      flexDirection: "row" as const,
      alignItems: "flex-start" as const,
      gap: pad.chipGap,
    },
    labelRow: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      gap: 6,
    },
    labelChip: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: theme.borderRadius.full,
      borderWidth: StyleSheet.hairlineWidth,
    },
    labelDot: {
      width: 6,
      height: 6,
      borderRadius: theme.borderRadius.full,
    },
    senderSection: {
      gap: pad.tight,
    },
    senderTop: {
      flexDirection: "row" as const,
      alignItems: "flex-start" as const,
      gap: pad.rowGap,
    },
    senderSheet: {
      flex: 1,
      minWidth: 0,
    },
    senderPressable: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: pad.rowGap,
    },
    senderIdentity: {
      flex: 1,
      minWidth: 0,
      gap: 1,
    },
    nameRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: pad.tight,
      minWidth: 0,
    },
    senderTrailing: {
      flexShrink: 0,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 2,
    },
    starButton: {
      width: 32,
      height: 32,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    toRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: pad.tight,
      paddingLeft: MAIL_LAYOUT.avatarSize + theme.spacing["3"],
    },
    detailsButton: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 2,
      paddingVertical: 4,
    },
    detailsBlock: {
      gap: pad.tight,
      paddingLeft: MAIL_LAYOUT.avatarSize + theme.spacing["3"],
      paddingTop: pad.tight,
    },
    detailsRow: {
      flexDirection: "row" as const,
      alignItems: "flex-start" as const,
      gap: pad.chipGap,
    },
    detailsValueWrap: {
      flex: 1,
      minWidth: 0,
    },
    attachmentList: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    attachmentRow: {
      minHeight: 44,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: pad.chipGap,
      paddingVertical: pad.section,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    attachmentRowFirst: {
      borderTopWidth: 0,
    },
    attachmentRowPressed: {
      opacity: 0.65,
    },
    attachmentCopy: {
      flex: 1,
      minWidth: 0,
      gap: 1,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border,
      marginTop: pad.tight,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    subject: {
      flex: 1,
      fontSize: theme.typography.fontSize.lg.size,
      lineHeight: theme.typography.fontSize.lg.lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    senderName: {
      flexShrink: 1,
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    senderEmail: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.mutedForeground,
    },
    compactDate: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.mutedForeground,
      fontVariant: ["tabular-nums"] as TextStyle["fontVariant"],
    },
    toSummary: {
      flex: 1,
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.mutedForeground,
    },
    detailsLabel: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
      color: theme.colors.mutedForeground,
    },
    detailsLabelCol: {
      width: 36,
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
    },
    detailsValue: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
    },
    labelText: {
      fontSize: theme.typography.fontSize.xs.size - 1,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      fontWeight: theme.typography.fontWeight.medium as TextStyle["fontWeight"],
    },
    attachmentName: {
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
    },
    attachmentMeta: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
      color: theme.colors.mutedForeground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
