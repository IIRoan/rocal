import React from "react";
import { Alert, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  getMailSecurityNotice,
  MAIL_READABLE_METADATA,
} from "@workspace/calendar-core";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import type { ThemeTokens } from "@workspace/design-tokens";
import type { MailSignatureVerificationState } from "../../lib/mail/mail-crypto";
import type { MessageEncryptionState } from "../../lib/mail/types";

type MailSecurityIndicatorProps = {
  encryption: MessageEncryptionState;
  encryptedAtRest: boolean;
  signatureVerificationState?: MailSignatureVerificationState;
  decryptionFailed: boolean;
};

export function MailSecurityIndicator(props: MailSecurityIndicatorProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const meta = getMailSecurityNotice({
    messageState: props.encryption,
    accountEncryptedAtRest: props.encryptedAtRest,
    signatureVerificationState: props.signatureVerificationState,
    decryptionFailed: props.decryptionFailed,
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
      onPress={() =>
        Alert.alert(
          meta.label,
          `${meta.description}\n\n${MAIL_READABLE_METADATA}`,
        )
      }
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
