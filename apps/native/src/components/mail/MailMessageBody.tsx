import { useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { getErrorMessage } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import { useToast } from "../../providers/ToastProvider";
import type { MailDecryptResult } from "../../lib/mail/mail-crypto";
import type { useMailMessageContent } from "../../hooks/use-mail-message-content";
import type { useMailMessageCalendar } from "../../hooks/use-mail-message-calendar";
import { HtmlEmailView } from "./HtmlEmailView";
import { EventReminderBanner } from "./EventReminderBanner";
import { CalendarInviteBanner } from "./CalendarInviteBanner";
import { EventReminderMessageBody } from "./EventReminderMessageBody";
import { EventReminderMessageBodyLoading } from "./EventReminderMessageBodyLoading";
import { MessageDecryptingSkeleton } from "./MessageDecryptingLoader";

type MailMessageBodyProps = {
  messageId: string;
  content: ReturnType<typeof useMailMessageContent>;
  calendar: ReturnType<typeof useMailMessageCalendar>;
  onOpenEvent: (eventId: string) => void;
};

export function MailMessageBody({
  messageId,
  content,
  calendar,
  onOpenEvent,
}: MailMessageBodyProps) {
  const { theme } = useTheme();
  const { toast } = useToast();
  const isDark = useColorScheme() === "dark";
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {
    calendarInvitation,
    eventReminderView,
    isEventReminderEmail,
    isLinkedEventSuccess,
    isReminderEventLoading,
    linkedCalendarEventId,
    linkedEventError,
  } = calendar;
  const { decryptError, decryptResult, htmlContent, plainContent } = content;
  const invite = calendarInvitation.mailCalendarInvite;
  const inviteEvent = calendarInvitation.currentCalendarInviteEvent?.event;
  const signatureBadge = decryptResult ? (
    <SignatureBadge
      theme={theme}
      styles={styles}
      state={decryptResult.signatureVerificationState}
    />
  ) : null;

  const respondToCalendarInvite = (
    status: "accepted" | "declined" | "tentative",
  ) => {
    void calendarInvitation.handleInvitationResponse(status).then((result) => {
      if (result.ok) {
        toast(result.message, "success");
        return;
      }
      toast(result.error, "error");
    });
  };

  return (
    <>
      {isEventReminderEmail && linkedCalendarEventId ? (
        <EventReminderBanner
          loading={isReminderEventLoading}
          error={
            linkedEventError
              ? getErrorMessage(
                  linkedEventError,
                  "Unable to load linked event details.",
                )
              : null
          }
          reminder={eventReminderView}
          onOpenEvent={() => onOpenEvent(linkedCalendarEventId)}
        />
      ) : null}

      {invite?.method === "REQUEST" ? (
        <CalendarInviteBanner
          invite={invite}
          loading={calendarInvitation.currentCalendarInviteEvent?.loading}
          error={calendarInvitation.currentCalendarInviteEvent?.error}
          inviteDeclined={calendarInvitation.inviteDeclined}
          invitationStatus={calendarInvitation.invitationStatus}
          inviteResponsePending={calendarInvitation.inviteResponsePending}
          formattedStart={calendar.formattedInviteStart}
          onAccept={() => respondToCalendarInvite("accepted")}
          onMaybe={() => respondToCalendarInvite("tentative")}
          onDecline={() => respondToCalendarInvite("declined")}
          onOpenEvent={inviteEvent ? () => onOpenEvent(inviteEvent.id) : undefined}
        />
      ) : null}

      {content.isDecrypting ? (
        <MessageDecryptingSkeleton attachedBelowBanner isDark={isDark} />
      ) : decryptError ? (
        <DecryptErrorCard
          theme={theme}
          styles={styles}
          error={getErrorMessage(decryptError, "Decryption failed")}
          onRetry={() => content.refetchDecrypt()}
        />
      ) : isEventReminderEmail && eventReminderView && isLinkedEventSuccess ? (
        <EventReminderMessageBody
          reminder={eventReminderView}
          attachedBelowBanner
          onOpenEvent={() => onOpenEvent(eventReminderView.eventId)}
        />
      ) : isReminderEventLoading ? (
        <EventReminderMessageBodyLoading attachedBelowBanner />
      ) : isEventReminderEmail && isLinkedEventSuccess && !eventReminderView ? (
        <View style={styles.reminderBodyPlaceholder}>
          <Text style={styles.mutedText}>
            Event details couldn&apos;t be decrypted on this device.
          </Text>
        </View>
      ) : htmlContent ? (
        <>
          {signatureBadge}
          <HtmlEmailView
            key={messageId}
            html={htmlContent}
            isDark={isDark}
            theme={theme}
          />
        </>
      ) : plainContent ? (
        <>
          {signatureBadge}
          <Text style={styles.bodyText}>{plainContent}</Text>
        </>
      ) : (
        <Text style={styles.mutedText}>This message has no content.</Text>
      )}
    </>
  );
}

function DecryptErrorCard({
  theme,
  styles,
  error,
  onRetry,
}: {
  theme: ThemeTokens;
  styles: ReturnType<typeof createStyles>;
  error: string;
  onRetry: () => void;
}) {
  return (
    <View style={styles.errorCard}>
      <Feather
        name="alert-triangle"
        size={24}
        color={theme.colors.destructive}
      />
      <Text style={styles.errorTitle}>Could not decrypt message</Text>
      <Text style={styles.mutedText}>{error}</Text>
      <Pressable onPress={onRetry} style={styles.retryButton}>
        <Text style={styles.retryButtonText}>Retry</Text>
      </Pressable>
    </View>
  );
}

function SignatureBadge({
  theme,
  styles,
  state,
}: {
  theme: ThemeTokens;
  styles: ReturnType<typeof createStyles>;
  state: MailDecryptResult["signatureVerificationState"];
}) {
  if (state !== "verified" && state !== "failed") return null;

  const verified = state === "verified";
  const color = verified ? theme.colors.primaryBase : theme.colors.destructive;

  return (
    <View style={styles.signatureBadge}>
      <Feather
        name={verified ? "check-circle" : "x-circle"}
        size={14}
        color={color}
      />
      <Text style={[styles.signatureBadgeText, { color }]}>
        {verified ? "Signature verified" : "Signature verification failed"}
      </Text>
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  const view = {
    signatureBadge: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["1"],
    },
    errorCard: {
      alignItems: "center" as const,
      gap: theme.spacing["3"],
      padding: theme.spacing["4"],
      borderRadius: theme.borderRadius.lg,
      borderWidth: 1,
      borderColor: theme.colors.destructive,
      backgroundColor: theme.colors.card,
    },
    retryButton: {
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["2"],
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.primaryBase,
    },
    reminderBodyPlaceholder: {
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: theme.spacing["2"],
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["8"],
      borderWidth: StyleSheet.hairlineWidth,
      borderTopWidth: 0,
      borderColor: theme.colors.primaryBase + "26",
      borderBottomLeftRadius: theme.borderRadius.lg,
      borderBottomRightRadius: theme.borderRadius.lg,
      backgroundColor: theme.colors.card,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    bodyText: {
      fontSize: theme.typography.fontSize.base.size,
      lineHeight: theme.typography.fontSize.base.lineHeight,
      color: theme.colors.foreground,
    },
    mutedText: {
      textAlign: "center" as const,
      fontSize: theme.typography.fontSize.sm.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.mutedForeground,
    },
    errorTitle: {
      fontSize: theme.typography.fontSize.base.size,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.destructive,
    },
    retryButtonText: {
      fontSize: theme.typography.fontSize.sm.size,
      fontWeight: theme.typography.fontWeight
        .semibold as TextStyle["fontWeight"],
      color: theme.colors.primaryForeground,
    },
    signatureBadgeText: {
      fontSize: theme.typography.fontSize.xs.size,
      color: theme.colors.mutedForeground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
