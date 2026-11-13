import React from "react";
import { Alert, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  getMailSecurityNotice,
  MAIL_READABLE_METADATA,
  MAIL_KEY_CONTINUITY_ENABLED,
  type MailSenderKeyTrustState,
  type MailReadState,
  type MailMessageContext,
} from "@workspace/calendar-core";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import type { ThemeTokens } from "@workspace/design-tokens";
import type { MailSignatureVerificationState } from "../../lib/mail/mail-crypto";
import type { MessageEncryptionState } from "../../lib/mail/types";

type MailSecurityIndicatorProps = {
  encryption: MessageEncryptionState;
  encryptedAtRest: boolean;
  signatureVerificationState?: MailSignatureVerificationState;
  readState: MailReadState;
  messageContext?: MailMessageContext;
  senderKeyTrustState?: MailSenderKeyTrustState;
  onReviewSenderKey?: () => void;
};

export function MailSecurityIndicator(props: MailSecurityIndicatorProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const meta = getMailSecurityNotice({
    messageState: props.encryption,
    accountEncryptedAtRest: props.encryptedAtRest,
    signatureVerificationState: props.signatureVerificationState,
    senderKeyTrustState: props.senderKeyTrustState,
    readState: props.readState,
    messageContext: props.messageContext,
  });
  const icon =
    meta.tone === "encrypted"
      ? "shield"
      : meta.tone === "warning"
        ? "alert-triangle"
        : "lock";
  const color =
    meta.tone === "encrypted"
      ? theme.colors.primaryBase
      : meta.tone === "warning"
        ? theme.colors.destructive
        : theme.colors.mutedForeground;

  return (
    <Pressable
      onPress={() => {
        const description = `${meta.description}\n\n${MAIL_READABLE_METADATA}`;
        if (
          MAIL_KEY_CONTINUITY_ENABLED &&
          props.senderKeyTrustState?.kind === "key_changed" &&
          props.onReviewSenderKey
        ) {
          Alert.alert(meta.label, description, [
            { text: "Cancel", style: "cancel" },
            { text: "Review sender key", onPress: props.onReviewSenderKey },
          ]);
        } else Alert.alert(meta.label, description);
      }}
      style={styles.button}
      accessibilityRole="button"
      accessibilityLabel={meta.label}
    >
      <Feather name={icon} size={16} color={color} />
    </Pressable>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    button: {
      minWidth: 44,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.borderRadius.sm,
    },
  });
}
