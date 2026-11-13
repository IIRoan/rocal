import {
  getMailSenderTrustNotice,
  getMailSignatureVerificationLabel,
  MAIL_KEY_CONTINUITY_ENABLED,
  type MailSenderKeyTrustState,
} from "./mail-key-continuity";
import { isImportedExternalInvitationEvent } from "./invitation-encryption";
import type { MessageEncryptionState } from "./mail-types";
import { getMailReadLimitNotice } from "./mail-mime-limits";

export interface EncryptableCalendarItem {
  encryptionState?: string | null;
  encryptedContent?: string | null;
  encryptedName?: string | null;
  externalId?: string | null;
  isSynced?: boolean | null;
  subscriptionId?: string | null;
}

export type CalendarEncryptionKind = "event" | "calendar" | "category";
export type EncryptionDisplayState = "encrypted" | "plaintext";

export const EVENT_ENCRYPTED_FIELDS = [
  "Title",
  "Description",
  "Location",
  "Color",
  "Category",
];
export const EVENT_READABLE_METADATA = [
  "Dates, times, timezone & all-day status",
  "Recurrence, reminders, participants & other metadata",
];
export const EVENT_INVITATION_ENCRYPTION_HINT =
  "Invitations share readable event details with the server and recipients.";
export const MAIL_READABLE_METADATA =
  "Sender, recipients, subject, date and routing headers remain readable.";
export const MAIL_ENCRYPTION_HINT =
  "Solace encrypts ordinary incoming mail after receipt. Drafts and Sent copies, including their attachments, are encrypted on your device before storage. Mail sent only to Solace accounts is encrypted before delivery. Sender, recipients, subject and routing headers remain readable.";

export function resolveEncryptionState(
  item: EncryptableCalendarItem,
): EncryptionDisplayState {
  if (item.encryptionState) {
    return item.encryptionState === "encrypted" ? "encrypted" : "plaintext";
  }
  return item.encryptedContent?.trim() || item.encryptedName?.trim()
    ? "encrypted"
    : "plaintext";
}

export function getCalendarEncryptionNotice(
  item: EncryptableCalendarItem,
  kind: CalendarEncryptionKind = "event",
) {
  const state = resolveEncryptionState(item);
  const fields =
    kind === "event"
      ? EVENT_ENCRYPTED_FIELDS
      : [`${kind === "calendar" ? "Calendar" : "Category"} name`];
  const metadata =
    kind === "event"
      ? EVENT_READABLE_METADATA
      : [
          "Color, settings & other metadata",
          ...(kind === "calendar" ? ["Ownership & sharing"] : []),
        ];
  const externalInvitation =
    kind === "event" &&
    isImportedExternalInvitationEvent({
      ...item,
      isSynced: Boolean(item.isSynced),
    });
  const description =
    state === "encrypted"
      ? kind === "event"
        ? "Title, description and location are encrypted on your device."
        : `The ${kind} name is encrypted on your device.`
      : kind === "event"
        ? "Event details are readable to the server."
        : `The ${kind} name is readable to the server.`;

  return {
    state,
    label:
      state === "encrypted"
        ? kind === "event"
          ? "End-to-end encrypted"
          : "Name encrypted"
        : "Not encrypted",
    shortLabel: state === "encrypted" ? "Encrypted" : "Plaintext",
    description,
    protectedFields: state === "encrypted" ? fields : [],
    visibleFields: state === "encrypted" ? metadata : [...fields, ...metadata],
    originWarning: externalInvitation
      ? state === "encrypted"
        ? "Encryption protects this calendar copy, not the original email or imported file."
        : "Encryption of this calendar copy does not protect the original invitation email."
      : kind === "event" && state === "encrypted"
        ? EVENT_INVITATION_ENCRYPTION_HINT
        : undefined,
  };
}

export type MailReadState = "pending" | "decrypted" | "read_limit" | "failed";
export type MailMessageContext = "received" | "draft" | "sent";

export function resolveMailReadState(input: {
  error: unknown;
  decrypted: boolean;
  isDecrypting?: boolean;
}): MailReadState {
  if (input.error !== null && input.error !== undefined) {
    const error =
      typeof input.error === "string" ? new Error(input.error) : input.error;
    return getMailReadLimitNotice(error) ? "read_limit" : "failed";
  }
  return input.decrypted && !input.isDecrypting ? "decrypted" : "pending";
}

export function resolveMailMessageContext(
  message: {
    keywords?: Record<string, boolean> | null;
    mailboxIds?: Record<string, boolean> | null;
  },
  mailboxes: readonly { id: string; role?: string | null }[],
): MailMessageContext {
  if (message.keywords?.$draft) return "draft";
  return mailboxes.some(
    (mailbox) => mailbox.role === "sent" && message.mailboxIds?.[mailbox.id],
  )
    ? "sent"
    : "received";
}

export type MailSecurityNoticeInput = {
  messageState: MessageEncryptionState;
  accountEncryptedAtRest: boolean;
  signatureVerificationState?:
    "not_signed" | "verified" | "unverified" | "failed";
  readState: MailReadState;
  messageContext?: MailMessageContext;
  senderKeyTrustState?: MailSenderKeyTrustState;
};

export function getMailSecurityNotice(input: MailSecurityNoticeInput): {
  label: string;
  description: string;
  tone: "encrypted" | "warning" | "plain";
} {
  if (input.readState === "read_limit") {
    return {
      label: "Reading limit reached",
      description:
        "This message exceeds the size or complexity limits for this reader.",
      tone: "plain",
    };
  }
  if (input.readState === "failed") {
    return {
      label: "Decryption failed",
      description: "This device could not decrypt the detected PGP payload.",
      tone: "warning",
    };
  }

  const pgp =
    input.messageState === "inline_pgp" ||
    input.messageState === "pgp_mime" ||
    input.messageState === "internal_e2ee";
  if (pgp) {
    if (input.readState !== "decrypted") {
      return {
        label: "PGP content detected",
        description: "This device has not finished opening the PGP payload.",
        tone: "plain",
      };
    }
    const protection =
      input.messageState === "pgp_mime"
        ? "The body and attachments inside the encrypted MIME payload are protected."
        : "The PGP message content was decrypted on this device. Content and attachments outside that payload are not protected by it.";
    const storage =
      input.messageContext === "draft"
        ? "Solace encrypts drafts on your device before saving them."
        : input.messageContext === "sent"
          ? "Solace encrypts Sent copies on your device before saving them."
          : input.accountEncryptedAtRest
            ? "Solace encrypts ordinary incoming mail after receipt."
            : "";
    const trust =
      input.senderKeyTrustState ??
      (MAIL_KEY_CONTINUITY_ENABLED &&
      input.signatureVerificationState === "verified"
        ? { kind: "unavailable" as const, reason: "history" as const }
        : undefined);
    const trustNotice = getMailSenderTrustNotice(trust);
    const signatureLabel = getMailSignatureVerificationLabel(
      input.signatureVerificationState ?? "not_signed",
      trust,
    );
    if (trustNotice)
      return {
        label: `PGP encrypted: ${trustNotice.label.toLowerCase()}`,
        description:
          `${protection} ${signatureLabel ? `${signatureLabel}. ` : ""}${trustNotice.description} ${storage}`.trim(),
        tone: "warning",
      };
    if (input.signatureVerificationState === "failed") {
      return {
        label: "PGP encrypted, signature check failed",
        description:
          `${protection} The sender signature failed verification. ${storage}`.trim(),
        tone: "warning",
      };
    }
    if (input.signatureVerificationState === "unverified") {
      return {
        label: "PGP encrypted, signature not verified",
        description:
          `${protection} This device could not verify the sender signature. ${storage}`.trim(),
        tone: "warning",
      };
    }
    const verified = input.signatureVerificationState === "verified";
    return {
      label:
        verified && trust
          ? `PGP encrypted: ${signatureLabel?.toLowerCase()}`
          : verified
            ? "PGP encrypted & verified"
            : "PGP encrypted",
      description:
        `${protection} ${verified ? "Signature verified with the sender key on this device. " : ""}${storage}`.trim(),
      tone: "encrypted",
    };
  }

  if (input.messageState === "unknown_encrypted") {
    return {
      label: "Encryption unconfirmed",
      description:
        "An attachment matches a PGP file type or filename. This does not establish encryption of the message body.",
      tone: "warning",
    };
  }

  if (input.accountEncryptedAtRest) {
    return {
      label: "Mailbox encryption enabled",
      description:
        "Solace encrypts ordinary incoming mail after receipt. No encrypted message body was detected in this message.",
      tone: "plain",
    };
  }

  return {
    label: "No message encryption detected",
    description:
      "No encrypted message body was detected. This indicator does not describe transport encryption.",
    tone: "plain",
  };
}
