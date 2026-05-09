"use client";

import { useMemo, useState } from "react";
import { ShieldCheck, ShieldAlert, Lock, Reply, Forward, Trash2, BadgeCheck, FolderInput, MailOpen, Copy, Check } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/ui/popover";
import { SenderAvatar } from "./mail-avatar";
import type { JmapMailbox } from "@/lib/mail/types";
import {
  classifyMessageEncryption,
  extractMessageBodies,
} from "@/lib/mail/message-security";
import type { JmapEmailMessage, MessageEncryptionState } from "@/lib/mail/types";
import { formatAddressFull } from "./mail-helpers";

// ─── Security badge ───────────────────────────────────────────────────────────

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
  verified: boolean,
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

  // At-rest encryption is checked before PGP classification because Stalwart stores
  // at-rest-encrypted messages using OpenPGP armour, which would otherwise look like
  // inline PGP to the classifier even though the sender never encrypted anything.
  if (accountEncryptedAtRest) {
    return {
      label: "Stored encrypted at rest",
      description: "Message bodies and attachments are encrypted before being written to disk. Routing metadata — sender, recipients, headers — remains visible to the server for delivery and display.",
      learnMoreHref: "/privacy#mail-encryption",
      Icon: Lock,
      iconClassName: "text-foreground/60",
      protectedFields: ["Message body", "Attachments"],
      visibleFields: ["From", "To", "Subject", "Date", "Headers"],
    };
  }

  if (messageState === "inline_pgp" || messageState === "pgp_mime" || messageState === "internal_e2ee") {
    return {
      label: verified ? "PGP encrypted & verified" : "PGP encrypted",
      description: verified
        ? "End-to-end encrypted. The sender signed and encrypted this message with your PGP public key before sending — our servers only ever handled ciphertext."
        : "End-to-end encrypted. The sender encrypted this with your PGP public key before sending. Our servers never saw the plaintext.",
      Icon: ShieldCheck,
      iconClassName: "text-foreground/70",
      protectedFields: ["Subject", "Message body", "Attachments", ...(verified ? ["Sender signature verified"] : [])],
      visibleFields: ["From", "To", "Date"],
    };
  }

  if (messageState === "unknown_encrypted") {
    return {
      label: "Possibly encrypted",
      description: "This message appears to contain encrypted content, but it doesn't match a recognised PGP format. It was received by our server in transit and may have been readable at the source.",
      Icon: ShieldAlert,
      iconClassName: "text-amber-500",
      protectedFields: [],
      visibleFields: ["From", "To", "Subject", "Date", "Message body"],
    };
  }

  return {
    label: "Not encrypted",
    description: "No encryption applied. The sender transmitted this as plaintext, it was readable in transit, and it is stored as plaintext on our server.",
    Icon: Lock,
    iconClassName: "text-muted-foreground/35",
    protectedFields: [],
    visibleFields: ["From", "To", "Subject", "Date", "Message body"],
  };
}

function MailSecurityBadge({
  messageState,
  accountEncryptedAtRest,
  verified,
  decryptionFailed,
}: {
  messageState: MessageEncryptionState;
  accountEncryptedAtRest: boolean;
  verified: boolean;
  decryptionFailed: boolean;
}) {
  const meta = resolveMailSecurityMeta(messageState, accountEncryptedAtRest, verified, decryptionFailed);
  const { Icon } = meta;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={meta.label}
          className="inline-flex items-center justify-center shrink-0 h-7 w-7 rounded outline-none focus-visible:ring-2 focus-visible:ring-ring/60 transition-colors hover:bg-accent/40"
        >
          <Icon className={`h-4 w-4 ${meta.iconClassName}`} aria-hidden strokeWidth={2.25} />
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" sideOffset={6} className="w-72 p-0 overflow-hidden">
        <div className="flex items-start gap-2.5 px-3 pt-3 pb-2 border-b border-border/50">
          <div className="flex items-center justify-center h-7 w-7 rounded-md shrink-0 bg-muted/50">
            <Icon className={`h-4 w-4 ${meta.iconClassName}`} strokeWidth={2.25} aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium leading-tight">{meta.label}</div>
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
              <div className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase mb-1">Encrypted on server</div>
              <ul className="space-y-0.5">
                {meta.protectedFields.map((field) => (
                  <li key={`enc-${field}`} className="text-xs flex items-center gap-1.5">
                    <ShieldCheck className="h-3 w-3 text-primary shrink-0" strokeWidth={2.25} aria-hidden />
                    <span className="truncate">{field}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {meta.visibleFields.length > 0 && (
            <div>
              <div className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase mb-1">Visible to server</div>
              <ul className="space-y-0.5">
                {meta.visibleFields.map((field) => (
                  <li key={`plain-${field}`} className="text-xs flex items-center gap-1.5 text-muted-foreground">
                    <Lock className="h-3 w-3 opacity-40 shrink-0" strokeWidth={2.25} aria-hidden />
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

// ─── HTML email renderer ──────────────────────────────────────────────────────

function HtmlEmailRenderer({
  html,
  blockRemoteImages,
  blockTrackingPixels,
}: {
  html: string;
  blockRemoteImages: boolean;
  blockTrackingPixels: boolean;
}) {
  const processedHtml = useMemo(() => {
    if (!blockTrackingPixels) return html;
    try {
      const doc = new DOMParser().parseFromString(
        `<!DOCTYPE html><html><body>${html}</body></html>`,
        "text/html",
      );
      doc.querySelectorAll("img").forEach((img) => {
        const w = parseInt(img.getAttribute("width") ?? img.style.width ?? "100", 10);
        const h = parseInt(img.getAttribute("height") ?? img.style.height ?? "100", 10);
        if ((w > 0 && w <= 2) || (h > 0 && h <= 2)) img.remove();
      });
      return doc.body.innerHTML;
    } catch {
      return html;
    }
  }, [html, blockTrackingPixels]);

  const srcDoc = useMemo(() => {
    const csp = blockRemoteImages
      ? `<meta http-equiv="Content-Security-Policy" content="img-src 'none'; connect-src 'none';">`
      : "";
    return `<!DOCTYPE html><html><head><meta charset="utf-8">${csp}<base target="_blank"><style>*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:system-ui,-apple-system,"Helvetica Neue",sans-serif;font-size:14px;line-height:1.6;padding:16px 20px;color:#111;word-break:break-word;overflow-wrap:anywhere;overflow-x:hidden}img{max-width:100%;height:auto}a{color:#2563eb}p{margin:0 0 1em}p:last-child{margin:0}</style></head><body>${processedHtml}</body></html>`;
  }, [processedHtml, blockRemoteImages]);

  // No resize logic — iframe fills flex-1 and scrolls internally
  return (
    <iframe
      srcDoc={srcDoc}
      title="Email body"
      sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
      className="flex-1 min-h-0 w-full border-0 block"
    />
  );
}

// ─── Copyable address ─────────────────────────────────────────────────────────

function CopyableAddress({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="group/copy flex flex-1 min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5 -mx-1.5 -my-0.5 hover:bg-muted/50 active:bg-muted/70 transition-colors duration-150 text-left"
    >
      <span className="text-sm break-all flex-1 text-foreground/80 group-hover/copy:text-foreground transition-colors duration-150">
        {value}
      </span>
      <span className="shrink-0 w-3.5 h-3.5 flex items-center justify-center">
        {copied
          ? <Check className="h-3 w-3 text-foreground/60" strokeWidth={2.5} />
          : <Copy className="h-3 w-3 text-transparent group-hover/copy:text-muted-foreground/50 transition-colors duration-150" strokeWidth={2} />
        }
      </span>
    </button>
  );
}

// ─── Meta row ────────────────────────────────────────────────────────────────

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <span className="text-[11px] font-semibold text-muted-foreground/50 uppercase tracking-wider w-10 shrink-0">
        {label}
      </span>
      <CopyableAddress value={value} />
    </div>
  );
}

// ─── Message reader ───────────────────────────────────────────────────────────

export interface MessageReaderProps {
  message: JmapEmailMessage | null;
  plaintext: string | null;
  decryptedHtml: string | null;
  verified: boolean;
  decryptError: string | null;
  accountEncryptedAtRest: boolean;
  isBusy: boolean;
  blockRemoteImages: boolean;
  blockTrackingPixels: boolean;
  mailboxes: JmapMailbox[];
  currentMailboxId: string | null;
  onReply: () => void;
  onForward: () => void;
  onDelete: () => void;
  onMove: (targetMailboxId: string) => void;
  onMarkAsUnread: () => void;
}

export function MessageReader({
  message,
  plaintext,
  decryptedHtml,
  verified,
  decryptError,
  accountEncryptedAtRest,
  isBusy,
  blockRemoteImages,
  blockTrackingPixels,
  mailboxes,
  currentMailboxId,
  onReply,
  onForward,
  onDelete,
  onMove,
  onMarkAsUnread,
}: MessageReaderProps) {
  if (!message) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">Select a message to read</p>
      </div>
    );
  }

  const messageState = classifyMessageEncryption(message);
  const { text, html } = extractMessageBodies(message);

  const displayHtml = decryptedHtml ?? (html || null);
  const displayText = plaintext ?? (text || null);
  const isHtmlEmail = Boolean(displayHtml);

  const senderEmail = message.from?.[0]?.email ?? "";
  const emailLower = senderEmail.toLowerCase();
  const isTrustedSender =
    emailLower.endsWith("@solace.onl") ||
    emailLower.endsWith(".roan.dev") ||
    emailLower.endsWith("@roan.dev");

  const MOVE_EXCLUDED_ROLES = new Set(["sent", "drafts"]);
  const otherMailboxes = mailboxes.filter(
    (m) => m.id !== currentMailboxId && !MOVE_EXCLUDED_ROLES.has(m.role?.toLowerCase() ?? ""),
  );

  const senderName = message.from?.[0]?.name ?? undefined;

  const header = (
    <div className="shrink-0 px-6 pt-5">
      <div className="flex items-start gap-3 mb-2.5">
        <SenderAvatar email={senderEmail} name={senderName} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-base font-semibold tracking-tight leading-tight flex-1">
              {message.subject || "(No subject)"}
            </h2>
            <MailSecurityBadge
              messageState={messageState}
              accountEncryptedAtRest={accountEncryptedAtRest}
              verified={verified}
              decryptionFailed={Boolean(decryptError)}
            />
          </div>
          <div className="space-y-1 mt-1.5 pb-2.5">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-[11px] font-semibold text-muted-foreground/50 uppercase tracking-wider w-10 shrink-0">From</span>
              <CopyableAddress value={formatAddressFull(message.from)} />
              {isTrustedSender && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      aria-label="Trusted sender"
                      className="inline-flex items-center gap-1 shrink-0 h-5 px-1.5 rounded-full bg-primary/10 text-primary text-[10px] font-medium transition-colors hover:bg-primary/20 outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                    >
                      <BadgeCheck className="h-3 w-3" strokeWidth={2.25} aria-hidden />
                      Trusted
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="bottom" align="end" sideOffset={6} className="w-60 p-3">
                    <div className="flex items-start gap-2">
                      <BadgeCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" strokeWidth={2.25} />
                      <div>
                        <div className="text-sm font-medium leading-tight">Trusted sender</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                          This message was sent from a <span className="font-medium text-foreground/80">solace.onl</span> address — a verified Solace domain.
                        </div>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
            {(message.to?.length ?? 0) > 0 && <MetaRow label="To" value={formatAddressFull(message.to)} />}
            {(message.cc?.length ?? 0) > 0 && <MetaRow label="CC" value={formatAddressFull(message.cc)} />}
            {message.receivedAt && (
              <MetaRow
                label="Date"
                value={new Date(message.receivedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
              />
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 py-1.5 border-t border-border/40">
        <button
          type="button" onClick={onReply} disabled={isBusy}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-[12px] font-medium text-muted-foreground hover:bg-accent/40 hover:text-foreground transition-colors disabled:opacity-40"
        >
          <Reply className="h-3.5 w-3.5" strokeWidth={2.25} />
          Reply
        </button>
        <button
          type="button" onClick={onForward} disabled={isBusy}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-[12px] font-medium text-muted-foreground hover:bg-accent/40 hover:text-foreground transition-colors disabled:opacity-40"
        >
          <Forward className="h-3.5 w-3.5" strokeWidth={2.25} />
          Forward
        </button>
        <button
          type="button" onClick={onMarkAsUnread} disabled={isBusy}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-[12px] font-medium text-muted-foreground hover:bg-accent/40 hover:text-foreground transition-colors disabled:opacity-40"
        >
          <MailOpen className="h-3.5 w-3.5" strokeWidth={2.25} />
          Mark unread
        </button>
        {otherMailboxes.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button" disabled={isBusy}
                className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-[12px] font-medium text-muted-foreground hover:bg-accent/40 hover:text-foreground transition-colors disabled:opacity-40"
              >
                <FolderInput className="h-3.5 w-3.5" strokeWidth={2.25} />
                Move
              </button>
            </PopoverTrigger>
            <PopoverContent side="bottom" align="start" sideOffset={6} className="w-48 p-1">
              {otherMailboxes.map((mailbox) => (
                <button
                  key={mailbox.id}
                  type="button"
                  onClick={() => onMove(mailbox.id)}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-sm text-foreground/80 hover:bg-accent/50 transition-colors text-left"
                >
                  {mailbox.name}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        )}
        <div className="flex-1" />
        <button
          type="button" onClick={onDelete} disabled={isBusy}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-[12px] font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-40"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={2.25} />
          Delete
        </button>
      </div>
      {decryptError && (
        <div className="rounded-md border border-amber-200/60 bg-amber-50/60 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 mt-3">
          {decryptError}
        </div>
      )}
    </div>
  );

  if (isHtmlEmail) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {header}
        {blockRemoteImages && (
          <div className="shrink-0 flex items-center gap-2 px-6 py-1.5 border-t border-border/30 text-[11px] text-muted-foreground bg-muted/30">
            <Lock className="h-3 w-3 shrink-0" strokeWidth={2.25} />
            Remote images are blocked
          </div>
        )}
        <HtmlEmailRenderer
          html={displayHtml!}
          blockRemoteImages={blockRemoteImages}
          blockTrackingPixels={blockTrackingPixels}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {header}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
        {displayText ? (
          <div className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">{displayText}</div>
        ) : (
          <span className="text-muted-foreground/50 italic text-sm">No message body</span>
        )}
      </div>
    </div>
  );
}
