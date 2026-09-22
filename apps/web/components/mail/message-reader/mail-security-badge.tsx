import {
  ShieldCheck,
  ShieldAlert,
  Lock,
} from "lucide-react";
import { DropdownPanel } from "@workspace/ui/solace";
import type {
  MailSignatureVerificationState,
  MessageEncryptionState,
} from "@/lib/mail/types";

interface MailSecurityMeta {
  label: string;
  description: string;
  learnMoreHref?: string;
  Icon: typeof ShieldCheck;
  iconClassName: string;
  protectedFields: string[];
  visibleFields: string[];
}

function resolveMailSecurityMeta(
  messageState: MessageEncryptionState,
  accountEncryptedAtRest: boolean,
  signatureVerificationState: MailSignatureVerificationState,
  decryptionFailed: boolean,
): MailSecurityMeta {
  if (decryptionFailed) {
    return {
      label: "Decryption failed",
      description: "This message could not be decrypted on this device.",
      Icon: ShieldAlert,
      iconClassName: "text-amber-500",
      protectedFields: [],
      visibleFields: ["From", "To", "Subject", "Date"],
    };
  }

  if (accountEncryptedAtRest) {
    return {
      label: "Stored encrypted at rest",
      description:
        "Message bodies and attachments are encrypted before being written to disk. Routing metadata — sender, recipients, headers — remains visible to the server for delivery and display.",
      learnMoreHref: "/privacy#mail-encryption",
      Icon: Lock,
      iconClassName: "text-foreground/60",
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
        Icon: ShieldAlert,
        iconClassName: "text-amber-500",
        protectedFields: ["Message body", "Attachments"],
        visibleFields: ["From", "To", "Subject", "Date"],
      };
    }

    if (signatureVerificationState === "unverified") {
      return {
        label: "PGP encrypted, signature not verified",
        description:
          "End-to-end encrypted. This message included a signature, but this device did not have a matching sender public key to verify it.",
        Icon: ShieldAlert,
        iconClassName: "text-foreground/60",
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
      Icon: ShieldCheck,
      iconClassName: "text-foreground/70",
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
      Icon: ShieldAlert,
      iconClassName: "text-amber-500",
      protectedFields: [],
      visibleFields: ["From", "To", "Subject", "Date", "Message body"],
    };
  }

  return {
    label: "Not encrypted",
    description:
      "No encryption applied. The sender transmitted this as plaintext, it was readable in transit, and Solace stores it as plaintext.",
    Icon: Lock,
    iconClassName: "text-muted-foreground/35",
    protectedFields: [],
    visibleFields: ["From", "To", "Subject", "Date", "Message body"],
  };
}

export function MailSecurityBadge({
  messageState,
  accountEncryptedAtRest,
  signatureVerificationState,
  decryptionFailed,
}: {
  messageState: MessageEncryptionState;
  accountEncryptedAtRest: boolean;
  signatureVerificationState: MailSignatureVerificationState;
  decryptionFailed: boolean;
}) {
  const meta = resolveMailSecurityMeta(
    messageState,
    accountEncryptedAtRest,
    signatureVerificationState,
    decryptionFailed,
  );
  const { Icon } = meta;

  return (
    <DropdownPanel
      width={296}
      trigger={
        <button
          type="button"
          aria-label={meta.label}
          className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded outline-none transition-colors hover:bg-[var(--bg-overlay-tertiary)] focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <Icon
            className={`size-4 ${meta.iconClassName}`}
            aria-hidden
            strokeWidth={2}
          />
        </button>
      }
    >
      <div className="flex items-start gap-2.5 border-b border-[var(--border-tertiary)] p-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-overlay-tertiary)]">
          <Icon
            className={`size-4 ${meta.iconClassName}`}
            strokeWidth={2}
            aria-hidden
          />
        </div>
        <div className="min-w-0">
          <div className="text-[15px] leading-[130%] font-[470] text-[var(--text-primary)]">
            {meta.label}
          </div>
          <p className="mt-1 text-[13px] leading-[130%] text-[var(--text-secondary)]">
            {meta.description}
            {meta.learnMoreHref && (
              <a
                href={meta.learnMoreHref}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 text-[var(--text-link)] underline-offset-2 hover:underline"
              >
                Full details
              </a>
            )}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2 p-1.5 pb-2">
        {meta.protectedFields.length > 0 && (
          <SecurityFieldList
            title="Encrypted on server"
            fields={meta.protectedFields}
            encrypted
          />
        )}
        {meta.visibleFields.length > 0 && (
          <SecurityFieldList title="Visible to server" fields={meta.visibleFields} />
        )}
      </div>
    </DropdownPanel>
  );
}

function SecurityFieldList({
  title,
  fields,
  encrypted = false,
}: {
  title: string;
  fields: string[];
  encrypted?: boolean;
}) {
  const FieldIcon = encrypted ? ShieldCheck : Lock;
  return (
    <div>
      <div className="px-1.5 pt-1 pb-1 text-[13px] font-[470] text-[var(--text-tertiary)]">
        {title}
      </div>
      <ul>
        {fields.map((field) => (
          <li
            key={field}
            className={`flex h-6 items-center gap-2 px-1.5 text-[13px] ${
              encrypted
                ? "text-[var(--text-primary)]"
                : "text-[var(--text-secondary)]"
            }`}
          >
            <FieldIcon
              className={`size-3.5 shrink-0 ${
                encrypted
                  ? "text-[var(--accent-green-primary)]"
                  : "text-[var(--icon-disabled)]"
              }`}
              strokeWidth={2}
              aria-hidden
            />
            <span className="truncate">{field}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
