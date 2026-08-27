import React, { useMemo } from "react";
import { Alert, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "../../providers/ThemeProvider";
import type { MailSignatureVerificationState } from "../../lib/mail/mail-crypto";
import type { MessageEncryptionState } from "../../lib/mail/types";

type MailSecurityIndicatorProps = {
  encryption: MessageEncryptionState;
  encryptedAtRest: boolean;
  signatureVerificationState?: MailSignatureVerificationState;
  decryptionFailed: boolean;
};

type SecurityMeta = {
  label: string;
  description: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  color: string;
};

function resolveSecurityMeta(
  props: MailSecurityIndicatorProps,
  colors: {
    foreground: string;
    muted: string;
    destructive: string;
    warning: string;
  },
): SecurityMeta {
  if (props.decryptionFailed) {
    return {
      label: "Decryption failed",
      description: "This message could not be decrypted on this device.",
      icon: "alert-triangle",
      color: colors.warning,
    };
  }

  if (props.encryptedAtRest) {
    return {
      label: "Stored encrypted at rest",
      description:
        "Message bodies and attachments are encrypted before being written to disk. Routing metadata — sender, recipients, headers — remains visible to the server for delivery and display.",
      icon: "lock",
      color: colors.foreground,
    };
  }

  if (
    props.encryption === "inline_pgp" ||
    props.encryption === "pgp_mime" ||
    props.encryption === "internal_e2ee"
  ) {
    if (props.signatureVerificationState === "failed") {
      return {
        label: "PGP encrypted, signature check failed",
        description:
          "End-to-end encrypted, but the sender signature could not be verified with the public key available on this device.",
        icon: "alert-triangle",
        color: colors.warning,
      };
    }
    if (props.signatureVerificationState === "unverified") {
      return {
        label: "PGP encrypted",
        description:
          "End-to-end encrypted. The message decrypted successfully. A sender signature was present, but this device did not have a matching public key to verify it.",
        icon: "shield",
        color: colors.foreground,
      };
    }
    const verified = props.signatureVerificationState === "verified";
    return {
      label: verified ? "PGP encrypted & verified" : "PGP encrypted",
      description: verified
        ? "End-to-end encrypted. The sender signed and encrypted the message content with your PGP public key."
        : "End-to-end encrypted. The sender encrypted the message content with your PGP public key.",
      icon: "shield",
      color: colors.foreground,
    };
  }

  if (props.encryption === "unknown_encrypted") {
    return {
      label: "Possibly encrypted",
      description:
        "This message appears to contain encrypted content, but it doesn't match a recognised PGP format.",
      icon: "alert-triangle",
      color: colors.warning,
    };
  }

  return {
    label: "Not encrypted",
    description:
      "No encryption applied. The sender transmitted this as plaintext, and Solace stores it as plaintext.",
    icon: "lock",
    color: colors.muted,
  };
}

export function MailSecurityIndicator(props: MailSecurityIndicatorProps) {
  const { theme } = useTheme();
  const warning =
    (theme.colors as unknown as Record<string, string>)["warning"] ?? "#d97706";
  const meta = useMemo(
    () =>
      resolveSecurityMeta(props, {
        foreground: theme.colors.foreground,
        muted: theme.colors.mutedForeground,
        destructive: theme.colors.destructive,
        warning,
      }),
    [props, theme.colors, warning],
  );

  return (
    <Pressable
      onPress={() => Alert.alert(meta.label, meta.description)}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={meta.label}
    >
      <Feather name={meta.icon} size={16} color={meta.color} />
    </Pressable>
  );
}
