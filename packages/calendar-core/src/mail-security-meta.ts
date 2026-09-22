import type { MessageEncryptionState } from "./mail-types";

export type MailSignatureVerificationState =
  | "not_signed"
  | "verified"
  | "unverified"
  | "failed";

export type MailSecurityIcon = "shield-check" | "shield-alert" | "lock";

/** `warning` = amber, `strong`/`medium` = foreground at 70%/60%, `faint` = muted at 35%. */
export type MailSecurityTone = "warning" | "strong" | "medium" | "faint";

export interface MailSecurityMeta {
  label: string;
  description: string;
  learnMoreHref?: string;
  icon: MailSecurityIcon;
  tone: MailSecurityTone;
  protectedFields: string[];
  visibleFields: string[];
}

export function resolveMailSecurityMeta(input: {
  messageState: MessageEncryptionState;
  accountEncryptedAtRest: boolean;
  signatureVerificationState?: MailSignatureVerificationState;
  decryptionFailed: boolean;
}): MailSecurityMeta {
  const { messageState, signatureVerificationState } = input;

  if (input.decryptionFailed) {
    return {
      label: "Decryption failed",
      description: "This message could not be decrypted on this device.",
      icon: "shield-alert",
      tone: "warning",
      protectedFields: [],
      visibleFields: ["From", "To", "Subject", "Date"],
    };
  }

  if (input.accountEncryptedAtRest) {
    return {
      label: "Stored encrypted at rest",
      description:
        "Message bodies and attachments are encrypted before being written to disk. Routing metadata — sender, recipients, headers — remains visible to the server for delivery and display.",
      learnMoreHref: "/privacy#mail-encryption",
      icon: "lock",
      tone: "medium",
      protectedFields: ["Message body", "Attachments"],
      visibleFields: ["From", "To", "Subject", "Date", "Headers"],
    };
  }

  if (
    messageState === "inline_pgp" ||
    messageState === "pgp_mime" ||
    messageState === "internal_e2ee"
  ) {
    if (signatureVerificationState === "failed") {
      return {
        label: "PGP encrypted, signature check failed",
        description:
          "End-to-end encrypted, but the sender signature could not be verified with the public key available on this device.",
        icon: "shield-alert",
        tone: "warning",
        protectedFields: ["Message body", "Attachments"],
        visibleFields: ["From", "To", "Subject", "Date"],
      };
    }

    if (signatureVerificationState === "unverified") {
      return {
        label: "PGP encrypted, signature not verified",
        description:
          "End-to-end encrypted. This message included a signature, but this device did not have a matching sender public key to verify it.",
        icon: "shield-alert",
        tone: "medium",
        protectedFields: ["Message body", "Attachments"],
        visibleFields: ["From", "To", "Subject", "Date"],
      };
    }

    const verified = signatureVerificationState === "verified";
    return {
      label: verified ? "PGP encrypted & verified" : "PGP encrypted",
      description: verified
        ? "End-to-end encrypted. The sender signed and encrypted the message content with your PGP public key before sending, so Solace only handled ciphertext for the protected body."
        : "End-to-end encrypted. The sender encrypted the message content with your PGP public key before sending, so Solace never saw the protected body in plaintext.",
      icon: "shield-check",
      tone: "strong",
      protectedFields: [
        "Message body",
        "Attachments",
        ...(verified ? ["Sender signature verified"] : []),
      ],
      visibleFields: ["From", "To", "Subject", "Date"],
    };
  }

  if (messageState === "unknown_encrypted") {
    return {
      label: "Possibly encrypted",
      description:
        "This message appears to contain encrypted content, but it doesn't match a recognised PGP format. Solace received it in transit and it may have been readable at the source.",
      icon: "shield-alert",
      tone: "warning",
      protectedFields: [],
      visibleFields: ["From", "To", "Subject", "Date", "Message body"],
    };
  }

  return {
    label: "Not encrypted",
    description:
      "No encryption applied. The sender transmitted this as plaintext, it was readable in transit, and Solace stores it as plaintext.",
    icon: "lock",
    tone: "faint",
    protectedFields: [],
    visibleFields: ["From", "To", "Subject", "Date", "Message body"],
  };
}
