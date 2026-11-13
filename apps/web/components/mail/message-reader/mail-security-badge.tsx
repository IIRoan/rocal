import Link from "next/link";
import { useState } from "react";
import { reviewCurrentMailSenderKey } from "@/lib/mail/mail-trust-lifecycle";
import { ShieldCheck, ShieldAlert, Lock } from "lucide-react";
import {
  getMailSecurityNotice,
  MAIL_READABLE_METADATA,
  MAIL_KEY_CONTINUITY_ENABLED,
  type MailSenderKeyTrustState,
  type MailSecurityNoticeInput,
} from "@workspace/calendar-core";
import { DropdownPanel } from "@workspace/ui/solace";
import { Button } from "@workspace/ui/components/ui/button";
import { cn } from "@workspace/ui/lib/utils";
export function MailSecurityBadge(
  props: MailSecurityNoticeInput & {
    senderEmail?: string;
  },
) {
  const meta = getMailSecurityNotice(props);
  const Icon =
    meta.tone === "encrypted"
      ? ShieldCheck
      : meta.tone === "warning"
        ? ShieldAlert
        : Lock;
  const iconClassName =
    meta.tone === "encrypted"
      ? "text-accent"
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
        <SenderKeyReviewAction
          email={props.senderEmail}
          state={props.senderKeyTrustState}
        />
        <Link
          href="/privacy#mail-encryption"
          target="_blank"
          rel="noopener noreferrer"
          className="cursor-pointer text-xs text-[var(--text-link)] underline-offset-2 hover:underline"
        >
          Encryption details
        </Link>
      </div>
    </DropdownPanel>
  );
}

function SenderKeyReviewAction({
  email,
  state,
}: {
  email?: string;
  state?: MailSenderKeyTrustState;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  if (!MAIL_KEY_CONTINUITY_ENABLED || !email || state?.kind !== "key_changed")
    return null;
  const review = () => {
    setBusy(true);
    setNotice(null);
    void reviewCurrentMailSenderKey(email)
      .then(() => {
        setBusy(false);
        setNotice("Reopen this message to check its sender key again.");
      })
      .catch(() => {
        setBusy(false);
        setNotice(
          "The sender key could not be reviewed. Saved keys were kept.",
        );
      });
  };
  return (
    <>
      <Button variant="outline" disabled={busy} onClick={review}>
        Review sender key
      </Button>
      {notice ? (
        <p role="status" className="text-xs text-muted-foreground">
          {notice}
        </p>
      ) : null}
    </>
  );
}
