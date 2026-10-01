import { isImportedExternalInvitationEvent } from "./invitation-encryption";
import type { MessageEncryptionState } from "./mail-types";

export interface EncryptableCalendarItem {
  encryptionState?: string | null;
  encryptedContent?: string | null;
  encryptedName?: string | null;
  externalId?: string | null;
  isSynced?: boolean | null;
  subscriptionId?: string | null;
  forceFullEncryption?: boolean | null;
}

export type CalendarEncryptionKind = "event" | "calendar" | "category";
export type EncryptionDisplayState = "encrypted" | "pending" | "plaintext";

export const EVENT_ENCRYPTED_FIELDS = ["Title", "Description", "Location"];
export const EVENT_READABLE_METADATA = [
  "Dates, times, timezone & all-day status",
  "Recurrence, reminders, participants & other metadata",
];
export const EVENT_INVITATION_ENCRYPTION_HINT =
  "Invitations share readable event details with the server and recipients.";
export const CALENDAR_ICS_SHARING_HINT =
  "Anyone with the ICS link can read its contents. Sharing is unavailable while the calendar contains encrypted events.";
export const MAIL_READABLE_METADATA =
  "Sender, recipients, subject, date and routing headers remain readable.";

export function resolveEncryptionState(
  item: EncryptableCalendarItem,
): EncryptionDisplayState {
  if (item.encryptionState === "encrypted") return "encrypted";
  if (item.encryptionState === "shadow_write") return "pending";
  if (item.encryptionState === "plaintext") return "plaintext";
  // Ciphertext alone does not prove that a legacy plaintext copy was removed.
  if (item.encryptedContent?.trim() || item.encryptedName?.trim())
    return "pending";
  return "plaintext";
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
      : state === "pending"
        ? "An encrypted copy exists, but a readable copy may remain on the server."
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
        : state === "pending"
          ? "Encryption pending"
          : "Not encrypted",
    shortLabel:
      state === "encrypted"
        ? "Encrypted"
        : state === "pending"
          ? "Pending"
          : "Plaintext",
    description,
    protectedFields: state === "encrypted" ? fields : [],
    visibleFields: state === "encrypted" ? metadata : [...fields, ...metadata],
    originWarning: externalInvitation
      ? state === "encrypted"
        ? "Encryption protects this calendar copy, not the original email or imported file."
        : "The original invitation email may also be readable to mail servers."
      : kind === "event" && state === "encrypted"
        ? EVENT_INVITATION_ENCRYPTION_HINT
        : undefined,
    policyNotice:
      kind === "calendar" && item.forceFullEncryption
        ? "Event encryption is required when saving; older plaintext events still need migration."
        : undefined,
  };
}

type MailSecurityNoticeInput = {
  messageState: MessageEncryptionState;
  accountEncryptedAtRest: boolean;
  signatureVerificationState?:
    | "not_signed"
    | "verified"
    | "unverified"
    | "failed";
  decryptionFailed: boolean;
};

export function getMailSecurityNotice(input: MailSecurityNoticeInput): {
  label: string;
  description: string;
  tone: "encrypted" | "warning" | "plain";
} {
  if (input.decryptionFailed) {
    return {
      label: "Decryption failed",
      description:
        "This device could not decrypt the detected payload. Its protection could not be confirmed.",
      tone: "warning",
    };
  }

  const pgp =
    input.messageState === "inline_pgp" ||
    input.messageState === "pgp_mime" ||
    input.messageState === "internal_e2ee";
  if (pgp) {
    const protection =
      "Only content inside the PGP payload is protected; other body parts and attachments may be readable.";
    const origin = input.accountEncryptedAtRest
      ? "Solace may have encrypted it after receipt."
      : "Encryption before delivery is not confirmed.";
    if (input.signatureVerificationState === "failed") {
      return {
        label: "PGP encrypted, signature check failed",
        description: `${protection} The sender signature failed verification. ${origin}`,
        tone: "warning",
      };
    }
    if (input.signatureVerificationState === "unverified") {
      return {
        label: "PGP encrypted, signature not verified",
        description: `${protection} This device could not verify the sender signature. ${origin}`,
        tone: "warning",
      };
    }
    const verified = input.signatureVerificationState === "verified";
    return {
      label: verified ? "PGP encrypted & verified" : "PGP encrypted",
      description: `${protection} ${verified ? "Signature verified with the sender key on this device. " : ""}${origin}`,
      tone: "encrypted",
    };
  }

  if (input.messageState === "unknown_encrypted") {
    return {
      label: "Encryption unconfirmed",
      description:
        "A possible encrypted attachment was detected. Protection of the message body and other attachments is not confirmed.",
      tone: "warning",
    };
  }

  if (input.accountEncryptedAtRest) {
    return {
      label: "Mailbox encryption enabled",
      description:
        "Incoming mail is encrypted after the server receives it. This setting does not confirm encryption of this message or of drafts and sent mail.",
      tone: "plain",
    };
  }

  return {
    label: "No message encryption detected",
    description:
      "Message content may be readable to mail servers. Transport encryption is separate and cannot be determined from this message.",
    tone: "plain",
  };
}
