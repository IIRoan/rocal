import {
  ShieldCheck,
  ShieldAlert,
  Lock,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/ui/popover";
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
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={meta.label}
          className="inline-flex items-center justify-center shrink-0 size-7 rounded outline-none focus-visible:ring-2 focus-visible:ring-ring/60 transition-colors hover:bg-accent/40"
        >
          <Icon
            className={`size-4 ${meta.iconClassName}`}
            aria-hidden
            strokeWidth={2.25}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={6}
        className="w-72 p-0 overflow-hidden"
      >
        <div className="flex items-start gap-2.5 px-3 pt-3 pb-2 border-b border-border/50">
          <div className="flex items-center justify-center size-7 rounded-md shrink-0 bg-muted/50">
            <Icon
              className={`size-4 ${meta.iconClassName}`}
              strokeWidth={2.25}
              aria-hidden
            />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium leading-tight">
              {meta.label}
            </div>
            <div className="text-[11px] text-muted-foreground leading-snug mt-0.5">
              {meta.description}
              {meta.learnMoreHref && (
                <a
                  href={meta.learnMoreHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1 text-primary/70 hover:text-primary underline underline-offset-2 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  Full details
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="px-3 py-2.5 space-y-2.5">
          {meta.protectedFields.length > 0 && (
            <div>
              <div className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase mb-1">
                Encrypted on server
              </div>
              <ul className="space-y-0.5">
                {meta.protectedFields.map((field) => (
                  <li
                    key={`enc-${field}`}
                    className="text-xs flex items-center gap-1.5"
                  >
                    <ShieldCheck
                      className="size-3 text-primary shrink-0"
                      strokeWidth={2.25}
                      aria-hidden
                    />
                    <span className="truncate">{field}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {meta.visibleFields.length > 0 && (
            <div>
              <div className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase mb-1">
                Visible to server
              </div>
              <ul className="space-y-0.5">
                {meta.visibleFields.map((field) => (
                  <li
                    key={`plain-${field}`}
                    className="text-xs flex items-center gap-1.5 text-muted-foreground"
                  >
                    <Lock
                      className="size-3 opacity-40 shrink-0"
                      strokeWidth={2.25}
                      aria-hidden
                    />
                    <span className="truncate">{field}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
