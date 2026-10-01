import { ShieldCheck, ShieldAlert, Lock } from "lucide-react";
import {
  getMailSecurityNotice,
  MAIL_READABLE_METADATA,
} from "@workspace/calendar-core";
import { DropdownPanel } from "@workspace/ui/solace";
import { Button } from "@workspace/ui/components/ui/button";
import { cn } from "@workspace/ui/lib/utils";
import type {
  MailSignatureVerificationState,
  MessageEncryptionState,
} from "@/lib/mail/types";

export function MailSecurityBadge(props: {
  messageState: MessageEncryptionState;
  accountEncryptedAtRest: boolean;
  signatureVerificationState: MailSignatureVerificationState;
  decryptionFailed: boolean;
}) {
  const meta = getMailSecurityNotice(props);
  const Icon =
    meta.tone === "encrypted"
      ? ShieldCheck
      : meta.tone === "warning"
        ? ShieldAlert
        : Lock;
  const iconClassName =
    meta.tone === "encrypted"
      ? "text-primary"
      : meta.tone === "warning"
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <DropdownPanel
      width={296}
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={meta.label}
          className="size-11 shrink-0 cursor-pointer"
        >
          <Icon className={cn(iconClassName)} aria-hidden strokeWidth={2} />
        </Button>
      }
    >
      <div className="flex flex-col gap-2 p-3">
        <p className="text-sm font-medium leading-tight text-[var(--text-primary)]">
          {meta.label}
        </p>
        <p className="text-xs leading-snug text-[var(--text-secondary)]">
          {meta.description}
        </p>
        <p className="text-xs leading-snug text-[var(--text-secondary)]">
          {MAIL_READABLE_METADATA}
        </p>
        <a
          href="/privacy#mail-encryption"
          target="_blank"
          rel="noopener noreferrer"
          className="cursor-pointer text-xs text-[var(--text-link)] underline-offset-2 hover:underline"
        >
          Encryption details
        </a>
      </div>
    </DropdownPanel>
  );
}
