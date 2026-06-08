"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import {
  buildEmailHtmlDocument,
  emailHasOwnDarkMode,
  getErrorMessage,
  processEmailHtml,
} from "@workspace/calendar-core";
import { useQueryClient } from "@tanstack/react-query";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import {
  ShieldCheck,
  ShieldAlert,
  Lock,
  Reply,
  Forward,
  Trash2,
  FolderInput,
  MailOpen,
  Copy,
  Check,
  Star,
  Tag,
  Plus,
  X,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Archive,
  EllipsisVertical,
  Paperclip,
  Send,
  Smile,
  Download,
  Eye,
  Loader2,
  Inbox,
  EyeOff,
  MessageSquare,
  CalendarDays,
  CalendarCheck,
  Clock,
  MapPin,
  ExternalLink,
  Code,
} from "lucide-react";
import type { CalendarEvent } from "@workspace/calendar-core";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/ui/popover";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@workspace/ui/components/ui/drawer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import { Button } from "@workspace/ui/components/ui/button";
import { Separator } from "@workspace/ui/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/ui/dropdown-menu";
import { useIsMobile, usePrefersReducedMotion } from "@workspace/ui/hooks";
import { cn } from "@workspace/ui/lib/utils";
import { toast } from "sonner";
import { SenderAvatar } from "./mail-avatar";
import type {
  JmapEmailMessage,
  JmapMailbox,
  LabelDef,
  MailAttachment,
  MailSignatureVerificationState,
  MessageEncryptionState,
} from "@/lib/mail/types";
import {
  classifyMessageEncryption,
  extractMessageBodies,
} from "@/lib/mail/message-security";
import {
  cleanInviteMailHtml,
  cleanInviteMailText,
} from "@/lib/mail/invite-boilerplate";
import { resolveAttachmentPreviewKind } from "@/lib/mail/attachment-preview";
import { splitPlaintextQuote, splitHtmlQuote } from "@/lib/mail/quoted-text";
import { formatAddressFull, formatMessageDate } from "./mail-helpers";
import { PdfAttachmentThumbnail } from "./attachment-preview-dialog";
import {
  extractLinkedCalendarEventId,
  extractReminderLeadMinutes,
  getCalendarEventLinkSource,
  isSolaceEventReminderEmail,
} from "@/lib/mail/calendar-event-link";
import { EventReminderBanner } from "./event-reminder-banner";
import { MailNotificationBanner } from "./mail-notification-banner";
import { EventReminderMessageBody, EventReminderMessageBodyLoading } from "./event-reminder-message-body";
import {
  buildEventReminderMailView,
  ENCRYPTED_EVENT_PLACEHOLDER_TITLE,
  isDecryptedEventReminderContent,
} from "@workspace/calendar-core";
import { extractMailCalendarInvite } from "@/lib/mail/calendar-invite";
import { calendarApiService } from "@/lib/calendar-api-service";

const EMPTY_ARRAY: never[] = [];

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

  // At-rest encryption is checked before PGP classification because Stalwart stores
  // at-rest-encrypted messages using OpenPGP armour, which would otherwise look like
  // inline PGP to the classifier even though the sender never encrypted anything.
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
        ? "End-to-end encrypted. The sender signed and encrypted the message content with your PGP public key before sending, so our servers only handled ciphertext for the protected body."
        : "End-to-end encrypted. The sender encrypted the message content with your PGP public key before sending, so our servers never saw the protected body in plaintext.",
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
        "This message appears to contain encrypted content, but it doesn't match a recognised PGP format. It was received by our server in transit and may have been readable at the source.",
      Icon: ShieldAlert,
      iconClassName: "text-amber-500",
      protectedFields: [],
      visibleFields: ["From", "To", "Subject", "Date", "Message body"],
    };
  }

  return {
    label: "Not encrypted",
    description:
      "No encryption applied. The sender transmitted this as plaintext, it was readable in transit, and it is stored as plaintext on our server.",
    Icon: Lock,
    iconClassName: "text-muted-foreground/35",
    protectedFields: [],
    visibleFields: ["From", "To", "Subject", "Date", "Message body"],
  };
}

function MailSecurityBadge({
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

// ─── HTML email renderer ──────────────────────────────────────────────────────

function HtmlEmailRenderer({
  html,
  blockRemoteImages,
  blockTrackingPixels,
  isDark,
}: {
  html: string;
  blockRemoteImages: boolean;
  blockTrackingPixels: boolean;
  isDark: boolean;
}) {
  const processedHtml = useMemo(() => {
    return processEmailHtml({ html, isDark, blockTrackingPixels });
  }, [html, isDark, blockTrackingPixels]);

  const hasOwnDark = useMemo(() => emailHasOwnDarkMode(html), [html]);

  const srcDoc = useMemo(() => {
    return buildEmailHtmlDocument({
      processedHtml,
      blockRemoteImages,
      isDark,
      hasOwnDark,
    });
  }, [processedHtml, blockRemoteImages, isDark, hasOwnDark]);

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
      <span className="text-sm break-all text-foreground/80 group-hover/copy:text-foreground transition-colors duration-150">
        {value}
      </span>
      <span className="shrink-0 size-3.5 flex items-center justify-center">
        {copied ? (
          <Check className="size-3 text-foreground/60" strokeWidth={2.5} />
        ) : (
          <Copy
            className="size-3 text-transparent group-hover/copy:text-muted-foreground/50 transition-colors duration-150"
            strokeWidth={2}
          />
        )}
      </span>
    </button>
  );
}

// ─── Meta row ────────────────────────────────────────────────────────────────

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <span className="text-[11px] font-semibold text-muted-foreground/50 dark:text-muted-foreground/70 uppercase tracking-wider w-10 shrink-0">
        {label}
      </span>
      <CopyableAddress value={value} />
    </div>
  );
}

// ─── Per-message action menu (inside conversation strip) ────────────────────

function ConversationMessageMenu({
  messageId,
  isRead,
  onDelete,
  onMarkUnread,
}: {
  messageId: string;
  isRead: boolean;
  onDelete?: (id: string) => void;
  onMarkUnread?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label="Message actions"
          className={cn(
            "shrink-0 flex size-6 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-accent/50 hover:text-foreground",
          )}
        >
          <MoreHorizontal className="size-3.5" strokeWidth={2.25} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={4}
        className="w-48 p-1 overflow-hidden rounded-lg border border-border shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        {isRead && onMarkUnread && (
          <button
            type="button"
            onClick={() => {
              onMarkUnread(messageId);
              setOpen(false);
            }}
            className="w-full flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-foreground/80 hover:bg-accent/50 transition-colors text-left"
          >
            <MailOpen
              className="size-3.5 text-muted-foreground"
              strokeWidth={2}
            />
            Mark as unread
          </button>
        )}
        {onDelete && (
          <>
            {isRead && onMarkUnread && (
              <div className="mx-1 my-1 h-px bg-border/40" />
            )}
            <button
              type="button"
              onClick={() => {
                onDelete(messageId);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-destructive/80 hover:bg-destructive/10 transition-colors text-left"
            >
              <Trash2 className="size-3.5" strokeWidth={2} />
              Delete
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ─── Copy email button ────────────────────────────────────────────────────────

function CopyEmailButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "Copied!" : `Copy ${value}`}
      className={cn(
        "inline-flex items-center justify-center size-4 rounded transition-all shrink-0",
        copied
          ? "text-green-500"
          : "text-muted-foreground/30 hover:text-muted-foreground/70",
      )}
    >
      {copied ? (
        <Check className="size-3" strokeWidth={2.5} />
      ) : (
        <Copy className="size-3" strokeWidth={2} />
      )}
    </button>
  );
}

// ─── Message reader ───────────────────────────────────────────────────────────

export interface MessageReaderProps {
  message: JmapEmailMessage | null;
  selectedMessageId?: string | null;
  conversationMessages?: JmapEmailMessage[];
  isConversationLoading?: boolean;
  onSelectConversationMessage?: (id: string) => void;
  plaintext: string | null;
  decryptedHtml: string | null;
  attachments?: MailAttachment[];
  signatureVerificationState: MailSignatureVerificationState;
  decryptError: string | null;
  accountEncryptedAtRest: boolean;
  isBusy: boolean;
  blockRemoteImages: boolean;
  blockTrackingPixels: boolean;
  mailDarkMode: boolean;
  mailboxes: JmapMailbox[];
  currentMailboxId: string | null;
  labels?: LabelDef[];
  onReply: () => void;
  onForward: () => void;
  onDelete: () => void;
  onMove: (targetMailboxId: string) => void;
  onMarkAsUnread: () => void;
  onToggleFlagged?: () => void;
  onSetLabel?: (labelId: string, assigned: boolean) => void;
  onCreateLabel?: (name: string, color: string) => Promise<LabelDef | null>;
  onDeleteLabel?: (labelId: string) => void;
  timeFormat?: "12h" | "24h";
  timezone?: string;
  /** Close/deselect the current message */
  onClose?: () => void;
  /** Navigate to the previous message in the list */
  onNavigatePrev?: () => void;
  /** Navigate to the next message in the list */
  onNavigateNext?: () => void;
  /** Whether there is a previous message to navigate to */
  hasPrev?: boolean;
  /** Whether there is a next message to navigate to */
  hasNext?: boolean;
  /** Archive the current message (move to archive mailbox) */
  onArchive?: () => void;
  /** Directly send a reply without opening the compose dialog */
  onSendReply?: (text: string, files: File[]) => Promise<void>;
  /** Load a small hover preview for an attachment */
  onLoadAttachmentPreview?: (attachment: MailAttachment) => Promise<
    | {
        kind: "image" | "pdf";
        url: string;
        type: string;
      }
    | {
        kind: "text";
        text: string;
        type: string;
      }
    | null
  >;
  /** Preview an attachment in-browser */
  onPreviewAttachment?: (attachment: MailAttachment) => void;
  /** Download an attachment blob */
  onDownloadAttachment?: (attachment: MailAttachment) => void;
  /** Restore a message from trash/junk to inbox */
  onUntrash?: () => void;
  /** Delete a specific message within the conversation thread */
  onConversationMessageDelete?: (id: string) => void;
  /** Mark a specific message within the conversation thread as unread */
  onConversationMessageMarkUnread?: (id: string) => void;
  /** Move a specific message within the conversation thread to another mailbox */
  onConversationMessageMove?: (id: string, mailboxId: string) => void;
  /** The signed-in user's email address, used to identify own messages */
  accountEmail?: string;
}

type LinkedCalendarEventState = {
  eventId: string;
  event: CalendarEvent | null;
  loading: boolean;
  error: string | null;
};

type InvitationResponseStatus = "accepted" | "declined" | "tentative";

export function MessageReader({
  message,
  selectedMessageId,
  conversationMessages = EMPTY_ARRAY,
  isConversationLoading = false,
  onSelectConversationMessage,
  plaintext,
  decryptedHtml,
  attachments,
  signatureVerificationState,
  decryptError,
  accountEncryptedAtRest,
  isBusy,
  blockRemoteImages,
  blockTrackingPixels,
  mailDarkMode,
  mailboxes,
  currentMailboxId,
  labels = EMPTY_ARRAY,
  onReply,
  onForward,
  onDelete,
  onMove,
  onMarkAsUnread,
  onToggleFlagged,
  onSetLabel,
  onCreateLabel,
  onDeleteLabel,
  timeFormat,
  timezone,
  onClose,
  onNavigatePrev,
  onNavigateNext,
  hasPrev,
  hasNext,
  onArchive,
  onSendReply,
  onLoadAttachmentPreview,
  onPreviewAttachment,
  onDownloadAttachment,
  onUntrash,
  onConversationMessageDelete,
  onConversationMessageMarkUnread,
  onConversationMessageMove,
  accountEmail,
}: MessageReaderProps) {
  const queryClient = useQueryClient();
  const isDark = mailDarkMode;
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#6366f1");
  const [isSavingLabel, setIsSavingLabel] = useState(false);
  const [labelPopoverOpen, setLabelPopoverOpen] = useState(false);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const [morePopoverOpen, setMorePopoverOpen] = useState(false);
  const [moveToExpanded, setMoveToExpanded] = useState(false);
  const [isBodyExpanded, setIsBodyExpanded] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [isReplyExpanded, setIsReplyExpanded] = useState(false);
  const [attachmentHoverPreviews, setAttachmentHoverPreviews] = useState<
    Record<
      string,
      | {
          kind: "image" | "pdf";
          url: string;
          type: string;
        }
      | {
          kind: "text";
          text: string;
          type: string;
        }
      | null
    >
  >({});
  const [loadingAttachmentPreviewKey, setLoadingAttachmentPreviewKey] =
    useState<string | null>(null);
  const [showQuote, setShowQuote] = useState(false);
  const [showOwnMessages, setShowOwnMessages] = useState(false);
  const [isConversationCollapsed, setIsConversationCollapsed] = useState(true);
  const [showRawHtmlDialog, setShowRawHtmlDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const expandedWrapRef = useRef<HTMLDivElement>(null);
  const replyHasInit = useRef(false);
  const conversationListRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const prefersReducedMotion = usePrefersReducedMotion();
  const calendarEventLinkSource = useMemo(
    () => (message ? getCalendarEventLinkSource(message, plaintext) : null),
    [message, plaintext],
  );
  const linkedCalendarEventId = useMemo(
    () =>
      calendarEventLinkSource
        ? extractLinkedCalendarEventId(message!, plaintext)
        : null,
    [calendarEventLinkSource, message, plaintext],
  );
  const isEventReminderEmail = useMemo(
    () =>
      calendarEventLinkSource
        ? isSolaceEventReminderEmail(calendarEventLinkSource)
        : false,
    [calendarEventLinkSource],
  );
  const mailCalendarInvite = useMemo(
    () =>
      extractMailCalendarInvite({
        message,
        plaintext,
        attachments,
      }),
    [attachments, message, plaintext],
  );
  const mailCalendarInviteUid = mailCalendarInvite?.uid ?? null;
  const mailCalendarInviteMeta = useMemo(() => {
    if (!mailCalendarInvite) return undefined;

    const items = [];
    if (mailCalendarInvite.start) {
      items.push({
        icon: Clock,
        children: mailCalendarInvite.start.toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
          hour12:
            timeFormat === "12h"
              ? true
              : timeFormat === "24h"
                ? false
                : undefined,
          timeZone: timezone ?? undefined,
        }),
      });
    }
    if (mailCalendarInvite.location) {
      items.push({
        icon: MapPin,
        children: mailCalendarInvite.location,
      });
    }

    return items.length > 0 ? items : undefined;
  }, [mailCalendarInvite, timeFormat, timezone]);
  const [linkedCalendarEvent, setLinkedCalendarEvent] =
    useState<LinkedCalendarEventState | null>(null);
  const [calendarInviteEvent, setCalendarInviteEvent] =
    useState<LinkedCalendarEventState | null>(null);
  const [inviteResponsePending, setInviteResponsePending] =
    useState<InvitationResponseStatus | null>(null);
  const [inviteDeclined, setInviteDeclined] = useState(false);
  const [inviteCancelled, setInviteCancelled] = useState(false);
  const [cancelProcessPending, setCancelProcessPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setReplyText("");
      setAttachedFiles([]);
      setEmojiPickerOpen(false);
      setIsSendingReply(false);
      setIsReplyExpanded(false);
      setAttachmentHoverPreviews({});
      setLoadingAttachmentPreviewKey(null);
      setShowQuote(false);
      setIsConversationCollapsed(true);
      setInviteDeclined(false);
      setInviteCancelled(false);
      setCancelProcessPending(false);
    });
    return () => {
      cancelled = true;
    };
  }, [message?.id]);

  useEffect(() => {
    if (!linkedCalendarEventId) {
      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) {
          setLinkedCalendarEvent(null);
        }
      });
      return () => {
        cancelled = true;
      };
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setLinkedCalendarEvent({
          eventId: linkedCalendarEventId,
          event: null,
          loading: true,
          error: null,
        });
      }
    });

    if (cancelled) {
      return;
    }

    void calendarApiService
      .getEvent(linkedCalendarEventId)
      .then((event) => {
        if (cancelled) {
          return;
        }
        setLinkedCalendarEvent({
          eventId: linkedCalendarEventId,
          event,
          loading: false,
          error: null,
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setLinkedCalendarEvent({
          eventId: linkedCalendarEventId,
          event: null,
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "Unable to load linked event details.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [linkedCalendarEventId]);

  const eventReminderView = useMemo(() => {
    if (!linkedCalendarEvent?.event) {
      return null;
    }
    if (!isDecryptedEventReminderContent(linkedCalendarEvent.event)) {
      return null;
    }

    return buildEventReminderMailView({
      event: linkedCalendarEvent.event,
      minutesBefore: calendarEventLinkSource
        ? extractReminderLeadMinutes(calendarEventLinkSource)
        : null,
      timezone: timezone ?? undefined,
      timeFormat,
    });
  }, [calendarEventLinkSource, linkedCalendarEvent, timeFormat, timezone]);

  const shouldReplaceBodyWithEventReminder = Boolean(
    isEventReminderEmail &&
      eventReminderView &&
      linkedCalendarEvent &&
      !linkedCalendarEvent.loading &&
      !linkedCalendarEvent.error,
  );
  const isReminderEventLoading = Boolean(
    isEventReminderEmail &&
      linkedCalendarEvent &&
      (linkedCalendarEvent.loading ||
        (!shouldReplaceBodyWithEventReminder && !linkedCalendarEvent.error)),
  );

  useEffect(() => {
    if (!mailCalendarInviteUid) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const existing = await calendarApiService.getInvitationByExternalId(
          mailCalendarInviteUid,
        );
        if (cancelled) return;

        if (mailCalendarInvite?.method === "CANCEL") {
          const importSummary = mailCalendarInvite.icsContent
            ? await calendarApiService.importInvitationIcs(
                mailCalendarInvite.icsContent,
              )
            : null;
          if (cancelled) return;

          void queryClient.invalidateQueries({ queryKey: ["events"] });

          const event = existing
            ? await calendarApiService.getInvitationByExternalId(
                mailCalendarInviteUid,
              )
            : null;
          if (cancelled) return;

          setInviteCancelled(false);
          setCalendarInviteEvent({
            eventId: mailCalendarInviteUid,
            event,
            loading: false,
            error:
              !event && importSummary && importSummary.errors.length > 0
                ? (importSummary.errors[0] ??
                  "Unable to process cancellation details.")
                : null,
          });
          return;
        }

        if (existing) {
          setCalendarInviteEvent({
            eventId: mailCalendarInviteUid,
            event: existing,
            loading: false,
            error: null,
          });
          return;
        }

        // For CANCEL: event is not in calendar — nothing to import.
        if (mailCalendarInvite?.method === "CANCEL") {
          setCalendarInviteEvent({
            eventId: mailCalendarInviteUid,
            event: null,
            loading: false,
            error: null,
          });
          return;
        }

        // Event not found yet — import from ICS then fetch.
        const importSummary = mailCalendarInvite?.icsContent
          ? await calendarApiService.importInvitationIcs(
              mailCalendarInvite.icsContent,
            )
          : null;
        if (cancelled) return;

        const event = await calendarApiService.getInvitationByExternalId(
          mailCalendarInviteUid,
        );
        if (cancelled) return;

        setCalendarInviteEvent({
          eventId: mailCalendarInviteUid,
          event,
          loading: false,
          error:
            !event && importSummary && importSummary.errors.length > 0
              ? (importSummary.errors[0] ??
                "Unable to import invitation details.")
              : null,
        });
      } catch (error) {
        if (cancelled) return;
        setCalendarInviteEvent({
          eventId: mailCalendarInviteUid,
          event: null,
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "Unable to load invitation details.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
    // Only re-run when the invite identity changes, not on every
    // mailCalendarInvite object reference change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mailCalendarInvite?.icsContent,
    mailCalendarInvite?.method,
    mailCalendarInviteUid,
  ]);

  const currentCalendarInviteEvent = useMemo(() => {
    if (!mailCalendarInviteUid) return null;
    if (calendarInviteEvent?.eventId === mailCalendarInviteUid) {
      return calendarInviteEvent;
    }
    return {
      eventId: mailCalendarInviteUid,
      event: null,
      loading: true,
      error: null,
    };
  }, [calendarInviteEvent, mailCalendarInviteUid]);
  const calendarInviteResponseEventId =
    currentCalendarInviteEvent?.event?.id ?? null;
  const calendarCancellationEventId =
    currentCalendarInviteEvent?.event?.id ?? null;

  const handleInvitationResponse = useCallback(
    async (status: InvitationResponseStatus) => {
      if (!calendarInviteResponseEventId || !mailCalendarInviteUid) return;

      setInviteResponsePending(status);
      try {
        const result = await calendarApiService.respondToInvitation(
          calendarInviteResponseEventId,
          status,
        );
        // Sync the calendar grid in all cases
        void queryClient.invalidateQueries({ queryKey: ["events"] });
        if ("deleted" in result && result.deleted) {
          // Event was declined and deleted — update local state to reflect this
          setInviteDeclined(true);
          setCalendarInviteEvent({
            eventId: mailCalendarInviteUid,
            event: null,
            loading: false,
            error: null,
          });
          toast.success("Invitation declined and removed from your calendar.");
        } else {
          setCalendarInviteEvent({
            eventId: mailCalendarInviteUid,
            event: result as CalendarEvent,
            loading: false,
            error: null,
          });
          toast.success(
            status === "accepted"
              ? "Invitation accepted."
              : "Marked as tentative.",
          );
        }
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to update invitation response.",
        );
      } finally {
        setInviteResponsePending(null);
      }
    },
    [calendarInviteResponseEventId, mailCalendarInviteUid, queryClient],
  );

  const handleCancelRemove = useCallback(async () => {
    if (!calendarCancellationEventId || !mailCalendarInviteUid) return;

    setCancelProcessPending(true);
    try {
      await calendarApiService.deleteEvent(calendarCancellationEventId);
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      setInviteCancelled(true);
      setCalendarInviteEvent({
        eventId: mailCalendarInviteUid,
        event: null,
        loading: false,
        error: null,
      });
      toast.success("Cancelled event removed from your calendar.");
    } catch (error) {
      toast.error(
        getErrorMessage(error, "Failed to remove event."),
      );
    } finally {
      setCancelProcessPending(false);
    }
  }, [calendarCancellationEventId, mailCalendarInviteUid, queryClient]);

  const displayAttachments = useMemo<MailAttachment[]>(
    () => attachments ?? message?.attachments ?? [],
    [attachments, message?.attachments],
  );

  const handleLoadAttachmentHoverPreview = useCallback(
    (attachment: MailAttachment, previewKey: string) => {
      if (!onLoadAttachmentPreview || previewKey in attachmentHoverPreviews) {
        return;
      }

      setLoadingAttachmentPreviewKey(previewKey);
      void onLoadAttachmentPreview(attachment)
        .then((preview) => {
          setAttachmentHoverPreviews((current) => ({
            ...current,
            [previewKey]: preview,
          }));
        })
        .catch(() => {
          setAttachmentHoverPreviews((current) => ({
            ...current,
            [previewKey]: null,
          }));
        })
        .finally(() => {
          setLoadingAttachmentPreviewKey((current) =>
            current === previewKey ? null : current,
          );
        });
    },
    [attachmentHoverPreviews, onLoadAttachmentPreview],
  );

  useEffect(() => {
    if (!onLoadAttachmentPreview) {
      return;
    }

    displayAttachments.forEach((attachment, idx) => {
      const previewKind = resolveAttachmentPreviewKind(attachment);
      if (!previewKind) {
        return;
      }
      const name = attachment.name?.trim() || "Attachment";
      const mimeType = attachment.type ?? "";
      const previewKey = `${attachment.blobId ?? idx}:${name}:${mimeType}`;
      if (!(previewKey in attachmentHoverPreviews)) {
        handleLoadAttachmentHoverPreview(attachment, previewKey);
      }
    });
  }, [
    attachmentHoverPreviews,
    displayAttachments,
    handleLoadAttachmentHoverPreview,
    onLoadAttachmentPreview,
  ]);

  const handleSendReply = useCallback(async () => {
    if (onSendReply) {
      if (!replyText.trim()) {
        toast.error("Enter a reply message.");
        return;
      }
      setIsSendingReply(true);
      try {
        await onSendReply(replyText, attachedFiles);
        setReplyText("");
        setAttachedFiles([]);
      } finally {
        setIsSendingReply(false);
      }
    } else {
      onReply();
      setReplyText("");
    }
  }, [replyText, attachedFiles, onSendReply, onReply]);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length) setAttachedFiles((prev) => [...prev, ...files]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [],
  );

  // ── GSAP reply bar expand/collapse ──────────────────────────────────────────
  useGSAP(
    () => {
      const wrap = expandedWrapRef.current;
      if (!wrap) return;

      if (!replyHasInit.current) {
        replyHasInit.current = true;
        if (isReplyExpanded) {
          gsap.set(wrap, { height: "auto", autoAlpha: 1, overflow: "visible" });
        } else {
          gsap.set(wrap, { height: 0, autoAlpha: 0, overflow: "hidden" });
        }
        return;
      }

      gsap.killTweensOf(wrap);

      if (prefersReducedMotion) {
        gsap.set(
          wrap,
          isReplyExpanded
            ? { height: "auto", autoAlpha: 1, overflow: "visible" }
            : { height: 0, autoAlpha: 0, overflow: "hidden" },
        );
        return;
      }

      if (isReplyExpanded) {
        gsap.set(wrap, { overflow: "hidden" });
        gsap.to(wrap, {
          height: "auto",
          autoAlpha: 1,
          duration: 0.28,
          ease: "power2.out",
          onComplete: () => {
            gsap.set(wrap, { overflow: "visible" });
            textareaRef.current?.focus();
          },
        });
      } else {
        gsap.set(wrap, { overflow: "hidden" });
        gsap.to(wrap, {
          autoAlpha: 0,
          height: 0,
          duration: 0.22,
          ease: "power2.in",
        });
      }
    },
    { dependencies: [isReplyExpanded] },
  );

  // Auto-resize textarea to fit content — must be declared before early return
  const autoResizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  // Derive display bodies before early return so hook order is stable.
  const _earlyBodies = message ? extractMessageBodies(message) : null;
  const _displayHtml = cleanInviteMailHtml(
    decryptedHtml ?? (_earlyBodies?.html || ""),
  );
  const _displayText = cleanInviteMailText(
    plaintext ?? (_earlyBodies?.text || ""),
  );

  // Split quoted reply chain from the body (so the new-message portion is shown
  // by default, with an expand button for the historical chain).
  const { body: plaintextBody, quote: plaintextQuote } = useMemo(
    () => splitPlaintextQuote(_displayText ?? ""),
    [_displayText],
  );
  const { html: cleanHtml, hasQuote: htmlHasQuote } = useMemo(
    () => splitHtmlQuote(_displayHtml ?? ""),
    [_displayHtml],
  );

  // Auto-scroll conversation list to bottom when messages load/change.
  // Must be above the early return to keep hook order consistent.
  useEffect(() => {
    const el = conversationListRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conversationMessages.length]);

  if (!message) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">
          Select a message to read
        </p>
      </div>
    );
  }

  const PLAINTEXT_COLLAPSE_THRESHOLD = 1200;

  const isFlagged = message?.keywords?.["$flagged"] === true;
  const messageLabels = labels.filter(
    (l) => message?.keywords?.[`label:${l.id}`] === true,
  );

  const messageState = classifyMessageEncryption(message);

  const displayHtml = _displayHtml;
  const displayText = _displayText;
  const isHtmlEmail = Boolean(displayHtml);
  // If the HTML body has no detected quote markers but the plaintext body does
  // (e.g. sent messages using "---\nOn..." separator that the server wraps in HTML),
  // fall back to text rendering so the quote can be properly collapsed.
  const renderAsHtml = isHtmlEmail && (htmlHasQuote || !plaintextQuote);

  const senderEmail = message.from?.[0]?.email ?? "";

  const MOVE_EXCLUDED_ROLES = new Set(["sent", "drafts"]);
  const otherMailboxes = mailboxes.filter(
    (m) =>
      m.id !== currentMailboxId &&
      !MOVE_EXCLUDED_ROLES.has(m.role?.toLowerCase() ?? ""),
  );

  const senderName = message.from?.[0]?.name ?? undefined;
  const orderedConversationMessages = conversationMessages.length
    ? conversationMessages
    : [message];
  const showConversation = orderedConversationMessages.length > 1;

  // Count own (sent) messages in the thread for the toggle label
  const ownMessageCount = accountEmail
    ? orderedConversationMessages.filter(
        (m) => m.from?.[0]?.email?.toLowerCase() === accountEmail.toLowerCase(),
      ).length
    : 0;
  // Filter own messages out of the strip unless the user opted to show them
  const visibleConversationMessages =
    accountEmail && !showOwnMessages
      ? orderedConversationMessages.filter(
          (m) =>
            m.from?.[0]?.email?.toLowerCase() !== accountEmail.toLowerCase(),
        )
      : orderedConversationMessages;

  // Determine if we're in a special mailboxthat needs restore actions
  const currentMailboxRole = mailboxes
    .find((m) => m.id === currentMailboxId)
    ?.role?.toLowerCase();
  const isInTrash = currentMailboxRole === "trash";
  const isInJunk =
    currentMailboxRole === "junk" || currentMailboxRole === "spam";

  // ── Label popover content (shared between mobile/desktop) ──────────────────
  const labelPopoverContent = (
    <PopoverContent
      side={isMobile ? "top" : "bottom"}
      align={isMobile ? "start" : "end"}
      sideOffset={6}
      className="w-56 p-0 overflow-hidden"
    >
      {labels.length > 0 && (
        <div className="p-1 border-b border-border/40">
          {labels.map((label) => {
            const assigned = message?.keywords?.[`label:${label.id}`] === true;
            return (
              <div key={label.id} className="flex items-center rounded hover:bg-accent/50 transition-colors">
                <button
                  type="button"
                  onClick={() => onSetLabel?.(label.id, !assigned)}
                  className="flex-1 flex items-center gap-2 px-2 py-1.5 text-sm text-left cursor-pointer select-none min-w-0"
                >
                  <span
                    className="size-2.5 rounded-full shrink-0 ring-1 ring-offset-1 ring-offset-popover"
                    style={{
                      backgroundColor: label.color,
                      boxShadow: assigned
                        ? `0 0 0 1px ${label.color}`
                        : undefined,
                    }}
                  />
                  <span className="flex-1 truncate text-foreground/80">
                    {label.name}
                  </span>
                  {assigned && (
                    <Check
                      className="size-3 text-foreground/50 shrink-0"
                      strokeWidth={2.5}
                    />
                  )}
                </button>
                {onDeleteLabel && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteLabel(label.id);
                    }}
                    className="mr-1 size-4 flex items-center justify-center rounded text-muted-foreground/40 hover:text-destructive transition-colors shrink-0"
                    aria-label={`Delete label ${label.name}`}
                  >
                    <X className="size-3" strokeWidth={2.5} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {onCreateLabel && (
        <div className="p-2 space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-1">
            New label
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              value={newLabelColor}
              onChange={(e) => setNewLabelColor(e.target.value)}
              className="size-6 rounded cursor-pointer border-0 p-0 bg-transparent"
              title="Label color"
              aria-label="Label color"
            />
            <input
              type="text"
              value={newLabelName}
              onChange={(e) => setNewLabelName(e.target.value)}
              aria-label="New label name"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newLabelName.trim()) {
                  setIsSavingLabel(true);
                  void onCreateLabel(newLabelName.trim(), newLabelColor).then(
                    () => {
                      setNewLabelName("");
                      setIsSavingLabel(false);
                    },
                  );
                }
              }}
              placeholder="Label name…"
              className="flex-1 h-6 text-[12px] bg-muted/60 border-0 rounded px-2 outline-none focus:ring-1 focus:ring-ring/50 placeholder:text-muted-foreground/40"
            />
            <button
              type="button"
              disabled={!newLabelName.trim() || isSavingLabel}
              onClick={() => {
                if (!newLabelName.trim()) return;
                setIsSavingLabel(true);
                void onCreateLabel(newLabelName.trim(), newLabelColor).then(
                  () => {
                    setNewLabelName("");
                    setIsSavingLabel(false);
                  },
                );
              }}
              className="size-6 flex items-center justify-center rounded text-muted-foreground hover:bg-accent/50 hover:text-foreground disabled:opacity-40 transition-colors"
              aria-label="Create label"
            >
              <Plus className="size-3.5" strokeWidth={2.25} />
            </button>
          </div>
        </div>
      )}
    </PopoverContent>
  );

  // ── Top toolbar ─────────────────────────────────────────────────────────────
  const toolbar = isMobile ? (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border/40 px-3">
      {onClose && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close message"
          onClick={onClose}
        >
          <X />
        </Button>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium leading-none">
          {message.subject || "(No subject)"}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="More actions"
        disabled={isBusy}
        onClick={() => setMoreActionsOpen(true)}
      >
        <EllipsisVertical />
      </Button>
    </div>
  ) : (
    <div className="shrink-0 flex items-center gap-0.5 px-3 h-12 border-b border-border/40">
      {/* Left: close + separator + prev/next */}
      <div className="flex items-center gap-0.5">
        {onClose && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Close message"
                onClick={onClose}
              >
                <X />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Close message</TooltipContent>
          </Tooltip>
        )}
        <Separator orientation="vertical" className="h-4 mx-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Previous message"
              disabled={!hasPrev}
              onClick={onNavigatePrev}
            >
              <ChevronLeft />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Previous message</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Next message"
              disabled={!hasNext}
              onClick={onNavigateNext}
            >
              <ChevronRight />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Next message</TooltipContent>
        </Tooltip>
      </div>

      {/* Right: archive, reply, delete */}
      <div className="ml-auto flex items-center gap-0">
        {onArchive && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Archive message"
                disabled={isBusy}
                onClick={onArchive}
              >
                <Archive />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Archive</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Reply"
              disabled={isBusy}
              onClick={onReply}
            >
              <Reply />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Reply</TooltipContent>
        </Tooltip>

        {/* Delete — direct button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={isInTrash ? "Delete permanently" : "Move to trash"}
              disabled={isBusy}
              onClick={onDelete}
            >
              <Trash2 className="text-destructive" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isInTrash ? "Delete permanently" : "Move to trash"}
          </TooltipContent>
        </Tooltip>
        {/* More actions panel */}
        <Popover
          open={morePopoverOpen}
          onOpenChange={(o) => {
            setMorePopoverOpen(o);
            if (!o) setMoveToExpanded(false);
          }}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="More actions"
                  disabled={isBusy}
                >
                  <EllipsisVertical />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>More actions</TooltipContent>
          </Tooltip>
          <PopoverContent
            align="end"
            sideOffset={6}
            className="w-52 p-0 overflow-hidden rounded-lg border border-border shadow-md"
          >
            {/* Quick-action icon strip */}
            <div className="flex border-b border-border/60">
              <button
                type="button"
                onClick={() => {
                  onForward();
                  setMorePopoverOpen(false);
                }}
                disabled={isBusy}
                className="flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-40"
              >
                <Forward className="size-3.5" strokeWidth={2.25} />
                Forward
              </button>
              <div className="w-px bg-border/60 self-stretch" />
              {onToggleFlagged && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onToggleFlagged();
                      setMorePopoverOpen(false);
                    }}
                    disabled={isBusy}
                    className="flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-40"
                  >
                    <Star
                      className={cn(
                        "size-3.5 transition-colors",
                        isFlagged ? "fill-amber-400 text-amber-400" : "",
                      )}
                      strokeWidth={2.25}
                    />
                    {isFlagged ? "Unstar" : "Star"}
                  </button>
                  <div className="w-px bg-border/60 self-stretch" />
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  onMarkAsUnread();
                  setMorePopoverOpen(false);
                }}
                disabled={isBusy}
                className="flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-40"
              >
                <MailOpen className="size-3.5" strokeWidth={2.25} />
                Unread
              </button>
            </div>

            {/* Restore — trash/junk only */}
            {(isInTrash || isInJunk) && onUntrash && (
              <button
                type="button"
                onClick={() => {
                  onUntrash();
                  setMorePopoverOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/8 transition-colors"
              >
                <Inbox className="size-3.5 shrink-0" />
                {isInTrash ? "Restore to inbox" : "Move to inbox"}
              </button>
            )}

            {/* Move to */}
            {otherMailboxes.length > 0 && (
              <div
                className={
                  (isInTrash || isInJunk) && onUntrash
                    ? "border-t border-border/60"
                    : ""
                }
              >
                <button
                  type="button"
                  onClick={() => setMoveToExpanded((v) => !v)}
                  disabled={isBusy}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground/80 hover:bg-accent/50 transition-colors"
                >
                  <FolderInput
                    className="size-3.5 shrink-0 text-muted-foreground"
                    strokeWidth={2}
                  />
                  Move to
                  <ChevronDown
                    className={cn(
                      "size-4 ml-auto text-muted-foreground transition-transform duration-200",
                      moveToExpanded ? "rotate-180" : "",
                    )}
                    strokeWidth={2.5}
                  />
                </button>
                {moveToExpanded && (
                  <div className="border-t border-border/40 bg-muted/30">
                    {otherMailboxes.map((mailbox, idx) => (
                      <div key={mailbox.id}>
                        {idx > 0 && <div className="mx-3 h-px bg-border/40" />}
                        <button
                          type="button"
                          onClick={() => {
                            onMove(mailbox.id);
                            setMorePopoverOpen(false);
                            setMoveToExpanded(false);
                          }}
                          className="w-full flex items-center gap-2 px-4 py-2 text-[13px] text-foreground/75 hover:bg-accent/60 hover:text-foreground transition-colors text-left"
                        >
                          {mailbox.name}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Labels */}
            {((onSetLabel && labels.length > 0) || onCreateLabel) && (
              <div className={cn("border-t border-border/60")}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setMorePopoverOpen(false);
                    setTimeout(() => setLabelPopoverOpen(true), 80);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground/80 hover:bg-accent/50 transition-colors"
                >
                  <Tag
                    className="size-3.5 shrink-0 text-muted-foreground"
                    strokeWidth={2}
                  />
                  Labels
                </button>
              </div>
            )}

            {/* View HTML source */}
            {displayHtml && (
              <div className="border-t border-border/60">
                <button
                  type="button"
                  onClick={() => {
                    setMorePopoverOpen(false);
                    setShowRawHtmlDialog(true);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground/80 hover:bg-accent/50 transition-colors"
                >
                  <Code
                    className="size-3.5 shrink-0 text-muted-foreground"
                    strokeWidth={2}
                  />
                  View HTML source
                </button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );

  // ── Label popover (floats independently, triggered from toolbar dropdown) ───
  const labelPopoverTrigger = ((onSetLabel && labels.length > 0) ||
    onCreateLabel) && (
    <Popover open={labelPopoverOpen} onOpenChange={setLabelPopoverOpen}>
      <PopoverTrigger asChild>
        {/* Invisible trigger — opened programmatically from the dropdown */}
        <span
          aria-hidden
          className="absolute opacity-0 pointer-events-none"
          style={{ top: 0, right: 0 }}
        />
      </PopoverTrigger>
      {labelPopoverContent}
    </Popover>
  );

  // ── Email header ─────────────────────────────────────────────────────────────
  const header = (
    <div
      className={cn(
        "relative shrink-0 flex flex-col",
        isMobile ? "gap-1.5 px-3 py-2" : "gap-2.5 px-4 py-3",
      )}
    >
      {labelPopoverTrigger}

      {/* Subject + action buttons */}
      <div
        className={cn(
          "flex items-start justify-between",
          isMobile ? "gap-1.5" : "gap-2",
        )}
      >
        <div
          className={cn(
            "font-medium leading-snug",
            isMobile ? "pr-1 text-[13px]" : "",
          )}
        >
          {message.subject || "(No subject)"}
        </div>
        <div
          className={cn(
            "mt-0.5 flex shrink-0 items-center gap-1",
            isMobile ? "mt-0" : "",
          )}
        >
          {onToggleFlagged && (
            <button
              type="button"
              onClick={onToggleFlagged}
              disabled={isBusy}
              aria-label={isFlagged ? "Unstar" : "Star"}
              className="inline-flex items-center justify-center size-7 rounded outline-none focus-visible:ring-2 focus-visible:ring-ring/60 transition-colors hover:bg-accent/40 disabled:opacity-40"
            >
              <Star
                className={cn(
                  "size-4 transition-colors",
                  isFlagged
                    ? "fill-amber-400 text-amber-400"
                    : "text-muted-foreground/40 hover:text-amber-400",
                )}
                strokeWidth={2}
              />
            </button>
          )}
          <MailSecurityBadge
            messageState={messageState}
            accountEncryptedAtRest={accountEncryptedAtRest}
            signatureVerificationState={signatureVerificationState}
            decryptionFailed={Boolean(decryptError)}
          />
        </div>
      </div>

      {/* Sender row: avatar + name/email/to + date */}
      <div className={cn("flex items-start", isMobile ? "gap-2" : "gap-2.5")}>
        <SenderAvatar
          email={senderEmail}
          name={senderName}
          className={isMobile ? "size-7 text-[10px]" : undefined}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center justify-between gap-2">
            <div
              className={cn(
                "min-w-0 group/sender",
                isMobile
                  ? "flex items-center gap-1"
                  : "flex items-center gap-1.5",
              )}
            >
              {senderName && (
                <span
                  className={cn(
                    "truncate font-medium",
                    isMobile ? "text-xs" : "text-[13px]",
                  )}
                >
                  {senderName}
                </span>
              )}
              <span
                className={cn(
                  "truncate text-muted-foreground",
                  isMobile ? "text-[11px]" : "text-xs",
                )}
              >{`<${senderEmail}>`}</span>
              {!isMobile && (
                <span className="opacity-0 transition-opacity group-hover/sender:opacity-100">
                  <CopyEmailButton value={senderEmail} />
                </span>
              )}
            </div>
            {message.receivedAt && (
              <span
                className={cn(
                  "shrink-0 text-muted-foreground",
                  isMobile ? "text-[10px]" : "text-[11px]",
                )}
              >
                {new Date(message.receivedAt).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                  hour12:
                    timeFormat === "12h"
                      ? true
                      : timeFormat === "24h"
                        ? false
                        : undefined,
                  timeZone: timezone ?? undefined,
                } as Intl.DateTimeFormatOptions)}
              </span>
            )}
          </div>
          {(message.to?.length ?? 0) > 0 && (
            <div
              className={cn(
                "min-w-0 group/to text-muted-foreground",
                isMobile
                  ? "flex items-center gap-1 text-[11px]"
                  : "flex items-center gap-1 text-xs",
              )}
            >
              <span>To:</span>
              <span className="truncate text-foreground/80">
                {message.to!.map((a) => a.name || a.email).join(", ")}
              </span>
              {!isMobile && (
                <span className="opacity-0 transition-opacity group-hover/to:opacity-100">
                  <CopyEmailButton
                    value={message.to!.map((a) => a.email).join(", ")}
                  />
                </span>
              )}
            </div>
          )}
          {(message.cc?.length ?? 0) > 0 && (
            <div
              className={cn(
                "min-w-0 group/cc text-muted-foreground",
                isMobile
                  ? "flex items-center gap-1 text-[11px]"
                  : "flex items-center gap-1 text-xs",
              )}
            >
              <span>CC:</span>
              <span className="truncate text-foreground/80">
                {message.cc!.map((a) => a.name || a.email).join(", ")}
              </span>
              {!isMobile && (
                <span className="opacity-0 transition-opacity group-hover/cc:opacity-100">
                  <CopyEmailButton
                    value={message.cc!.map((a) => a.email).join(", ")}
                  />
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Attachments */}
      {displayAttachments.length > 0 && (
        <Collapsible defaultOpen>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className={cn(
                "group flex items-center font-medium text-muted-foreground transition-colors hover:text-foreground",
                isMobile
                  ? "gap-1 py-0 text-[11px]"
                  : "gap-1.5 py-0.5 text-[12px]",
              )}
            >
              Attachments ({displayAttachments.length})
              <ChevronDown
                className="size-3 transition-transform group-data-[state=open]:rotate-180"
                strokeWidth={2}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div
              className={cn(
                "flex flex-wrap",
                isMobile ? "gap-1.5 pt-1" : "gap-2 pt-1.5",
              )}
            >
              {displayAttachments.map((attachment, idx) => {
                const name = attachment.name?.trim() || "Attachment";
                const mimeType = attachment.type ?? "";
                const previewKind = resolveAttachmentPreviewKind(attachment);
                const attachmentKey =
                  attachment.blobId ??
                  `${name}:${mimeType}:${attachment.size ?? "inline"}`;
                const previewKey = `${attachmentKey}:${name}:${mimeType}`;
                const hoverPreview = attachmentHoverPreviews[previewKey];
                const ext = mimeType.split("/")[1]?.toUpperCase() ?? "";
                const canAccessAttachment = Boolean(
                  (attachment.blobId || attachment.content != null) &&
                  (onPreviewAttachment || onDownloadAttachment),
                );
                const canPreview = Boolean(
                  canAccessAttachment && onPreviewAttachment && previewKind,
                );
                const canDownload = Boolean(
                  (attachment.blobId || attachment.content != null) &&
                  onDownloadAttachment,
                );
                const attachmentButton = (
                  <Button
                    variant="secondary"
                    size="xs"
                    type="button"
                    onClick={
                      canPreview
                        ? () => onPreviewAttachment!(attachment)
                        : canDownload
                          ? () => onDownloadAttachment!(attachment)
                          : undefined
                    }
                    onMouseEnter={() =>
                      canPreview && onLoadAttachmentPreview
                        ? handleLoadAttachmentHoverPreview(
                            attachment,
                            previewKey,
                          )
                        : undefined
                    }
                    onFocus={() =>
                      canPreview && onLoadAttachmentPreview
                        ? handleLoadAttachmentHoverPreview(
                            attachment,
                            previewKey,
                          )
                        : undefined
                    }
                    aria-label={`${canPreview ? "Preview" : "Download"} ${name}`}
                    className={cn(
                      canPreview || canDownload
                        ? "cursor-pointer"
                        : "cursor-default",
                      isMobile ? "h-5 gap-1 px-1.5 text-[10px]" : "",
                    )}
                  >
                    {canPreview ? (
                      <Eye />
                    ) : canDownload ? (
                      <Download />
                    ) : (
                      <Paperclip />
                    )}
                    <span className="font-normal">{name}</span>
                    {ext && (
                      <span className="font-normal text-muted-foreground">
                        {ext}
                      </span>
                    )}
                  </Button>
                );
                return (
                  <div
                    key={attachmentKey}
                    className="group/attachment relative flex items-center gap-1"
                  >
                    {attachmentButton}
                    {canPreview && onLoadAttachmentPreview && (
                      <div className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 hidden w-[min(22rem,calc(100vw-2rem))] group-hover/attachment:block group-focus-within/attachment:block">
                        <div className="bg-popover text-popover-foreground overflow-hidden rounded-md border border-border/60 shadow-md">
                          {loadingAttachmentPreviewKey === previewKey ? (
                            <div className="text-muted-foreground flex items-center gap-2 px-3 py-2 text-sm">
                              <Loader2 className="size-4 animate-spin" />
                              Loading preview
                            </div>
                          ) : hoverPreview?.kind === "image" ? (
                            <div className="space-y-2 p-2">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={hoverPreview.url}
                                alt={name}
                                className="max-h-44 w-full rounded-md border border-border/60 object-contain"
                              />
                            </div>
                          ) : hoverPreview?.kind === "text" ? (
                            <div className="space-y-2 p-2">
                              <div className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
                                {previewKind === "text"
                                  ? "Text preview"
                                  : "Preview"}
                              </div>
                              <pre className="max-h-44 overflow-hidden whitespace-pre-wrap break-words rounded-md border border-border/60 bg-background px-3 py-2 font-mono text-xs leading-5">
                                {hoverPreview.text}
                              </pre>
                            </div>
                          ) : hoverPreview?.kind === "pdf" ? (
                            <div className="space-y-2 p-2">
                              <PdfAttachmentThumbnail url={hoverPreview.url} />
                              <div className="text-muted-foreground text-xs">
                                Open inline to scroll the full document.
                              </div>
                            </div>
                          ) : (
                            <div className="text-muted-foreground px-3 py-2 text-sm">
                              Preview unavailable.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {canPreview && canDownload && (
                      <Button
                        variant="secondary"
                        size="xs"
                        type="button"
                        onClick={() => onDownloadAttachment!(attachment)}
                        aria-label={`Download ${name}`}
                        className={cn(
                          "cursor-pointer px-1.5",
                          isMobile ? "h-5 text-[10px]" : "",
                        )}
                      >
                        <Download />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Labels */}
      {messageLabels.length > 0 && (
        <div
          className={cn(
            "flex flex-wrap items-center",
            isMobile ? "gap-1" : "gap-1.5",
          )}
        >
          {messageLabels.map((label) => (
            <span
              key={label.id}
              className={cn(
                "inline-flex items-center gap-1 rounded-full font-medium",
                isMobile
                  ? "px-1.5 py-0.5 text-[10px]"
                  : "px-2 py-0.5 text-[11px]",
              )}
              style={{
                backgroundColor: `${label.color}22`,
                color: label.color,
              }}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}

      {isMobile && (
        <Drawer open={moreActionsOpen} onOpenChange={setMoreActionsOpen}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Message actions</DrawerTitle>
            </DrawerHeader>
            <div className="flex flex-col gap-1 overflow-y-auto px-4 pb-6">
              {hasPrev && onNavigatePrev && (
                <button
                  type="button"
                  onClick={() => {
                    onNavigatePrev();
                    setMoreActionsOpen(false);
                  }}
                  disabled={isBusy}
                  className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-foreground/80 transition-colors hover:bg-accent/40 active:bg-accent/60 disabled:opacity-40"
                >
                  <ChevronLeft className="size-4 text-muted-foreground" />
                  Previous message
                </button>
              )}
              {hasNext && onNavigateNext && (
                <button
                  type="button"
                  onClick={() => {
                    onNavigateNext();
                    setMoreActionsOpen(false);
                  }}
                  disabled={isBusy}
                  className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-foreground/80 transition-colors hover:bg-accent/40 active:bg-accent/60 disabled:opacity-40"
                >
                  <ChevronRight className="size-4 text-muted-foreground" />
                  Next message
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  onReply();
                  setMoreActionsOpen(false);
                }}
                disabled={isBusy}
                className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-foreground/80 transition-colors hover:bg-accent/40 active:bg-accent/60 disabled:opacity-40"
              >
                <Reply
                  className="size-4 text-muted-foreground"
                  strokeWidth={2.25}
                />
                Reply
              </button>
              <button
                type="button"
                onClick={() => {
                  onForward();
                  setMoreActionsOpen(false);
                }}
                disabled={isBusy}
                className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-foreground/80 transition-colors hover:bg-accent/40 active:bg-accent/60 disabled:opacity-40"
              >
                <Forward
                  className="size-4 text-muted-foreground"
                  strokeWidth={2.25}
                />
                Forward
              </button>
              {onArchive && (
                <button
                  type="button"
                  onClick={() => {
                    onArchive();
                    setMoreActionsOpen(false);
                  }}
                  disabled={isBusy}
                  className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-foreground/80 transition-colors hover:bg-accent/40 active:bg-accent/60 disabled:opacity-40"
                >
                  <Archive
                    className="size-4 text-muted-foreground"
                    strokeWidth={2.25}
                  />
                  Archive
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  onMarkAsUnread();
                  setMoreActionsOpen(false);
                }}
                disabled={isBusy}
                className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-foreground/80 transition-colors hover:bg-accent/40 active:bg-accent/60 disabled:opacity-40"
              >
                <MailOpen
                  className="size-4 text-muted-foreground"
                  strokeWidth={2}
                />
                Mark as unread
              </button>
              {otherMailboxes.length > 0 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      disabled={isBusy}
                      className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-foreground/80 transition-colors hover:bg-accent/40 active:bg-accent/60 disabled:opacity-40"
                    >
                      <FolderInput
                        className="size-4 text-muted-foreground"
                        strokeWidth={2}
                      />
                      Move to…
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    side="top"
                    align="start"
                    sideOffset={6}
                    className="w-48 p-1"
                  >
                    {otherMailboxes.map((mailbox) => (
                      <button
                        key={mailbox.id}
                        type="button"
                        onClick={() => {
                          onMove(mailbox.id);
                          setMoreActionsOpen(false);
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-sm text-foreground/80 hover:bg-accent/50 transition-colors text-left"
                      >
                        {mailbox.name}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
              )}
              {((onSetLabel && labels.length > 0) || onCreateLabel) && (
                <Popover
                  open={labelPopoverOpen}
                  onOpenChange={setLabelPopoverOpen}
                >
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      disabled={isBusy}
                      className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-foreground/80 transition-colors hover:bg-accent/40 active:bg-accent/60 disabled:opacity-40"
                    >
                      <Tag
                        className="size-4 text-muted-foreground"
                        strokeWidth={2}
                      />
                      Labels
                    </button>
                  </PopoverTrigger>
                  {labelPopoverContent}
                </Popover>
              )}
              <button
                type="button"
                onClick={() => {
                  onDelete();
                  setMoreActionsOpen(false);
                }}
                disabled={isBusy}
                className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm text-destructive/80 transition-colors hover:bg-destructive/10 active:bg-destructive/20 disabled:opacity-40"
              >
                <Trash2 className="size-4" strokeWidth={2} />
                Delete message
              </button>
              <DrawerClose asChild>
                <button
                  type="button"
                  className="mt-2 flex h-11 w-full items-center justify-center rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-accent/40"
                >
                  Cancel
                </button>
              </DrawerClose>
            </div>
          </DrawerContent>
        </Drawer>
      )}

      {decryptError && (
        <div className="rounded-md border border-amber-200/60 bg-amber-50/60 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 mt-3">
          {decryptError}
        </div>
      )}
    </div>
  );

  const conversationStrip = showConversation && (
    <div className="shrink-0 mx-4 mb-2 rounded-lg border border-border/50 overflow-hidden">
      {/* Strip header */}
      <div
        className={cn(
          "flex items-center justify-between gap-2 px-3 py-1.5 bg-muted/40 transition-colors cursor-pointer",
          !isConversationCollapsed && "border-b border-border/40",
        )}
      >
        <button
          type="button"
          onClick={() => setIsConversationCollapsed((v) => !v)}
          className="flex items-center gap-1.5 flex-1 min-w-0 text-left cursor-pointer rounded hover:bg-accent/60 -mx-1 px-1 py-0.5 transition-colors group/thread-header"
        >
          <ChevronDown
            className={cn(
              "size-3 text-muted-foreground transition-transform shrink-0 group-hover/thread-header:text-foreground",
              isConversationCollapsed && "-rotate-90",
            )}
          />
          <MessageSquare
            className="size-3 text-muted-foreground shrink-0 group-hover/thread-header:text-foreground"
            strokeWidth={2}
          />
          <span className="text-[11px] font-medium text-foreground/70 group-hover/thread-header:text-foreground">
            {`${orderedConversationMessages.length} messages in thread`}
          </span>
        </button>
        {ownMessageCount > 0 && !isConversationCollapsed && (
          <button
            type="button"
            onClick={() => setShowOwnMessages((v) => !v)}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0 cursor-pointer"
          >
            {showOwnMessages ? (
              <EyeOff className="size-3" />
            ) : (
              <Eye className="size-3" />
            )}
            {showOwnMessages ? "Hide your replies" : `+${ownMessageCount} sent`}
          </button>
        )}
      </div>

      {/* Message rows — collapsible */}
      {!isConversationCollapsed && (
        <div
          ref={conversationListRef}
          className="max-h-36 overflow-y-auto divide-y divide-border/30"
        >
          {visibleConversationMessages.map((threadMessage) => {
            const threadSenderEmail = threadMessage.from?.[0]?.email ?? "";
            const threadSenderName = threadMessage.from?.[0]?.name ?? undefined;
            const threadBodies = extractMessageBodies(threadMessage);
            let rawPreview: string;
            if (threadBodies.html && !threadBodies.text) {
              const { html: cleanedHtml } = splitHtmlQuote(threadBodies.html);
              rawPreview = cleanedHtml.replace(/<[^>]+>/g, " ");
            } else {
              rawPreview = threadBodies.text ?? "";
            }
            const { body: previewBody } = splitPlaintextQuote(rawPreview);
            const threadPreviewText = previewBody.replace(/\s+/g, " ").trim();
            const isActive =
              threadMessage.id === (selectedMessageId ?? message.id);
            const threadIsRead =
              threadMessage.keywords?.["$seen"] === true ||
              (accountEmail
                ? threadMessage.from?.[0]?.email?.toLowerCase() ===
                  accountEmail.toLowerCase()
                : false);
            const hasThreadActions =
              onConversationMessageDelete ||
              onConversationMessageMarkUnread ||
              onConversationMessageMove;

            return (
              <div
                key={threadMessage.id}
                className={cn(
                  "group/thread-item relative flex w-full items-center gap-2 px-3 py-1.5 transition-colors",
                  isActive ? "bg-primary/5" : "hover:bg-accent/40",
                )}
              >
                {/* Active left-border accent */}
                {isActive && (
                  <div className="absolute left-0 inset-y-0 w-0.5 bg-primary rounded-r" />
                )}

                {/* Unread dot */}
                {!threadIsRead ? (
                  <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                ) : (
                  <span className="size-1.5 shrink-0" />
                )}

                {/* Clickable row */}
                <button
                  type="button"
                  onClick={() =>
                    onSelectConversationMessage?.(threadMessage.id)
                  }
                  className="flex flex-1 min-w-0 cursor-pointer items-center gap-2 text-left"
                >
                  <SenderAvatar
                    email={threadSenderEmail}
                    name={threadSenderName}
                    className="size-5 shrink-0 text-[9px]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5 min-w-0">
                      <span
                        className={cn(
                          "shrink-0 text-xs",
                          threadIsRead
                            ? "font-medium text-foreground/70"
                            : "font-semibold text-foreground",
                        )}
                      >
                        {threadSenderName || threadSenderEmail || "Unknown"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                        {threadPreviewText || "(No body)"}
                      </span>
                    </div>
                  </div>
                  <span className="text-muted-foreground shrink-0 text-[10px]">
                    {formatMessageDate(
                      threadMessage.receivedAt,
                      timeFormat,
                      timezone,
                    )}
                  </span>
                </button>

                {/* Per-message actions */}
                {hasThreadActions && (
                  <ConversationMessageMenu
                    messageId={threadMessage.id}
                    isRead={threadIsRead}
                    onDelete={onConversationMessageDelete}
                    onMarkUnread={onConversationMessageMarkUnread}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const linkedEventCard = linkedCalendarEvent &&
    !isEventReminderEmail &&
    !shouldReplaceBodyWithEventReminder && (
    <div
      className={cn(
        "mx-4 mb-0 rounded-lg rounded-b-none border border-primary/20 bg-primary/5 px-4 py-3",
        (mailCalendarInvite?.method === "REQUEST" ||
          mailCalendarInvite?.method === "CANCEL") &&
          "rounded-t-none border-t-0",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <CalendarDays className="size-4" strokeWidth={2.25} />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-primary/70">
                Linked calendar event
              </div>
              <div className="text-base font-semibold text-foreground">
                {linkedCalendarEvent.loading ? (
                  "Loading event details..."
                ) : linkedCalendarEvent.event?.encryptionState ===
                    "encrypted" &&
                  linkedCalendarEvent.event?.title ===
                    ENCRYPTED_EVENT_PLACEHOLDER_TITLE ? (
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Lock className="size-3.5 shrink-0" />
                    Encrypted – open in calendar to view
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    {linkedCalendarEvent.event?.encryptionState ===
                      "encrypted" && (
                      <Lock
                        className="size-3.5 shrink-0 text-primary/60"
                        strokeWidth={2.25}
                      />
                    )}
                    {linkedCalendarEvent.event?.title || "Untitled event"}
                  </span>
                )}
              </div>
            </div>
            <Button asChild variant="secondary" size="xs" className="gap-1.5">
              <a
                href={`/calendar?eventId=${encodeURIComponent(linkedCalendarEvent.eventId)}`}
              >
                Open in calendar
                <ExternalLink className="size-3" />
              </a>
            </Button>
          </div>
          {linkedCalendarEvent.loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Fetching the latest event content from your calendar.
            </div>
          ) : linkedCalendarEvent.error ? (
            <div className="text-sm text-destructive">
              {linkedCalendarEvent.error}
            </div>
          ) : linkedCalendarEvent.event ? (
            <div className="space-y-1.5 text-sm text-foreground/80">
              <div className="flex items-center gap-2">
                <Clock className="size-3.5 text-muted-foreground" />
                <span>
                  {(() => {
                    const event = linkedCalendarEvent.event;
                    const dateOptions: Intl.DateTimeFormatOptions = event.allDay
                      ? {
                          dateStyle: "full",
                          timeZone: timezone ?? undefined,
                        }
                      : {
                          dateStyle: "medium",
                          timeStyle: "short",
                          hour12:
                            timeFormat === "12h"
                              ? true
                              : timeFormat === "24h"
                                ? false
                                : undefined,
                          timeZone: timezone ?? undefined,
                        };
                    return `${new Date(event.start).toLocaleString(undefined, dateOptions)} - ${new Date(event.end).toLocaleString(undefined, dateOptions)}`;
                  })()}
                </span>
              </div>
              {linkedCalendarEvent.event.location && (
                <div className="flex items-center gap-2">
                  <MapPin className="size-3.5 text-muted-foreground" />
                  <span>{linkedCalendarEvent.event.location}</span>
                </div>
              )}
              {linkedCalendarEvent.event.calendar?.name && (
                <div className="text-xs text-muted-foreground">
                  Calendar: {linkedCalendarEvent.event.calendar.name}
                </div>
              )}
              {linkedCalendarEvent.event.description && (
                <div className="rounded-md border border-border/50 bg-background/60 px-3 py-2 text-sm leading-relaxed text-foreground/80">
                  {linkedCalendarEvent.event.description}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  const invitationStatus =
    currentCalendarInviteEvent?.event?.participants?.find(
      (participant) =>
        participant.userId === currentCalendarInviteEvent.event?.userId &&
        participant.role !== "organizer",
    )?.status;
  const invitationRemovedFromCalendar = inviteDeclined;
  const shouldShowCalendarInviteCard = mailCalendarInvite?.method === "REQUEST";
  const isPending = !invitationStatus || invitationStatus === "pending";
  const calendarInviteCard = shouldShowCalendarInviteCard &&
    mailCalendarInvite && (
      <MailNotificationBanner
        inactive={invitationRemovedFromCalendar}
        title={mailCalendarInvite.title}
        meta={mailCalendarInviteMeta}
        headerAction={
            <div className="flex items-center gap-2">
              {currentCalendarInviteEvent?.loading ? (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  Adding…
                </span>
              ) : currentCalendarInviteEvent?.error ? (
                <span className="text-xs text-destructive">
                  {currentCalendarInviteEvent.error}
                </span>
              ) : inviteDeclined ? (
                <span className="text-xs text-muted-foreground">
                  Declined, removed
                </span>
              ) : !currentCalendarInviteEvent?.event ? (
                <span className="text-xs text-muted-foreground">
                  Processing…
                </span>
              ) : isPending ? (
                <>
                  <Button
                    size="xs"
                    disabled={inviteResponsePending !== null}
                    onClick={() => void handleInvitationResponse("accepted")}
                    className="gap-1"
                  >
                    {inviteResponsePending === "accepted" ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Check className="size-3" />
                    )}
                    Accept
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={inviteResponsePending !== null}
                    onClick={() => void handleInvitationResponse("tentative")}
                  >
                    {inviteResponsePending === "tentative" && (
                      <Loader2 className="size-3 animate-spin" />
                    )}
                    Maybe
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={inviteResponsePending !== null}
                    onClick={() => void handleInvitationResponse("declined")}
                    className="text-muted-foreground"
                  >
                    {inviteResponsePending === "declined" && (
                      <Loader2 className="size-3 animate-spin" />
                    )}
                    Decline
                  </Button>
                </>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="xs"
                      variant="secondary"
                      disabled={inviteResponsePending !== null}
                      className="gap-1.5"
                    >
                      {inviteResponsePending !== null && (
                        <Loader2 className="size-3 animate-spin" />
                      )}
                      {invitationStatus === "tentative" ? "Maybe" : "Accepted"}
                      <ChevronDown className="size-3 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-28">
                    <DropdownMenuItem
                      onClick={() => void handleInvitationResponse("accepted")}
                      className={cn(
                        invitationStatus === "accepted" && "font-medium",
                      )}
                    >
                      <Check
                        className={cn(
                          "size-4",
                          invitationStatus !== "accepted" && "opacity-0",
                        )}
                      />
                      Accept
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => void handleInvitationResponse("tentative")}
                      className={cn(
                        invitationStatus === "tentative" && "font-medium",
                      )}
                    >
                      <Check
                        className={cn(
                          "size-4",
                          invitationStatus !== "tentative" && "opacity-0",
                        )}
                      />
                      Maybe
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => void handleInvitationResponse("declined")}
                    >
                      <Check className="size-4 opacity-0" />
                      Decline
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {currentCalendarInviteEvent?.event &&
                !invitationRemovedFromCalendar && (
                  <Button
                    asChild
                    variant="secondary"
                    size="xs"
                    className="gap-1.5"
                  >
                    <a
                      href={`/calendar?eventId=${encodeURIComponent(currentCalendarInviteEvent.event.id)}`}
                    >
                      Open
                      <ExternalLink className="size-3" />
                    </a>
                  </Button>
                )}
            </div>
        }
      />
    );

  const shouldShowCalendarCancellationCard =
    mailCalendarInvite?.method === "CANCEL";
  const calendarCancellationCard = shouldShowCalendarCancellationCard &&
    mailCalendarInvite && (
      <MailNotificationBanner
        variant="invitationCancelled"
        title={mailCalendarInvite.title}
        description="The organiser cancelled this event. Solace keeps it visible until you remove it yourself."
        meta={mailCalendarInviteMeta}
        actions={
          currentCalendarInviteEvent?.loading ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Checking calendar…
            </span>
          ) : inviteCancelled ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-success">
              <Check className="size-3" />
              Removed from your calendar
            </span>
          ) : currentCalendarInviteEvent?.event ? (
            <>
              <span className="text-xs text-muted-foreground">
                This cancelled copy is still on your calendar.
              </span>
              <Button
                size="xs"
                variant="outline"
                disabled={cancelProcessPending}
                onClick={() => void handleCancelRemove()}
                className="ml-auto gap-1 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                {cancelProcessPending ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Trash2 className="size-3" />
                )}
                Remove from calendar
              </Button>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">
              This cancellation was already applied in your calendar.
            </span>
          )
        }
      />
    );

  const hasCardAboveBody =
    mailCalendarInvite?.method === "REQUEST" ||
    mailCalendarInvite?.method === "CANCEL" ||
    (Boolean(linkedCalendarEvent) &&
      !isEventReminderEmail &&
      !shouldReplaceBodyWithEventReminder);
  const hasReminderBannerAbove =
    isEventReminderEmail && Boolean(linkedCalendarEvent);
  const bodyAttachedAbove = hasCardAboveBody || hasReminderBannerAbove;

  const standardBodyContent = shouldReplaceBodyWithEventReminder &&
  eventReminderView ? (
    <EventReminderMessageBody
      reminder={eventReminderView}
      isDark={isDark}
      attachedAbove={bodyAttachedAbove}
    />
  ) : isReminderEventLoading ? (
    <EventReminderMessageBodyLoading
      isDark={isDark}
      attachedAbove={bodyAttachedAbove}
    />
  ) : renderAsHtml ? (
    <div
      className={cn(
        "flex-1 min-h-0 mx-4 mb-2 rounded-lg border border-border/50 overflow-hidden flex flex-col",
        bodyAttachedAbove && "rounded-t-none border-t-0",
      )}
    >
      {blockRemoteImages && (
        <div className="shrink-0 flex items-center gap-2 px-4 py-1.5 border-b border-border/30 text-[11px] text-muted-foreground bg-muted/30">
          <Lock className="size-3 shrink-0" strokeWidth={2.25} />
          Remote images are blocked
        </div>
      )}
      <HtmlEmailRenderer
        html={showQuote ? displayHtml! : cleanHtml}
        blockRemoteImages={blockRemoteImages}
        blockTrackingPixels={blockTrackingPixels}
        isDark={isDark}
      />
      {htmlHasQuote && (
        <div className="shrink-0 border-t border-border/40 px-3 py-1.5 bg-muted/20">
          <button
            type="button"
            onClick={() => setShowQuote((v) => !v)}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors font-medium flex items-center gap-1"
          >
            <span className="tracking-widest leading-none">···</span>
            {showQuote ? "Hide quoted text" : "Show quoted text"}
          </button>
        </div>
      )}
    </div>
  ) : (
    <div
      className={cn(
        "flex-1 min-h-0 mx-4 mb-2 rounded-lg border border-border/50 overflow-hidden flex flex-col",
        bodyAttachedAbove && "rounded-t-none border-t-0",
      )}
    >
      <div className={cn(
        "flex-1 min-h-0 overflow-y-auto px-5 py-4",
        isDark ? "bg-[#1a1a1a] [color-scheme:dark]" : "bg-white [color-scheme:light]",
      )}>
        {displayText ? (
          <>
            <div className={cn(
              "text-sm leading-relaxed whitespace-pre-wrap",
              isDark ? "text-[#e0e0e0]" : "text-[#111]",
            )}>
              {(() => {
                const activeText = showQuote ? displayText : plaintextBody;
                if (
                  !isBodyExpanded &&
                  activeText.length > PLAINTEXT_COLLAPSE_THRESHOLD
                ) {
                  return (
                    activeText.slice(0, PLAINTEXT_COLLAPSE_THRESHOLD) + "…"
                  );
                }
                return activeText;
              })()}
            </div>
            {/* Show more/less for long bodies */}
            {(showQuote ? displayText : plaintextBody).length >
              PLAINTEXT_COLLAPSE_THRESHOLD && (
              <button
                type="button"
                onClick={() => setIsBodyExpanded((v) => !v)}
                className="mt-3 text-xs font-medium text-primary/70 hover:text-primary transition-colors"
              >
                {isBodyExpanded
                  ? "Show less"
                  : `Show more (${Math.round((showQuote ? displayText : plaintextBody).length / 1000)}k chars)`}
              </button>
            )}
          </>
        ) : (
          <span className={cn("text-sm italic", isDark ? "text-[#888]" : "text-[#666]")}>No message body</span>
        )}
      </div>
      {/* Quoted chain toggle — pinned outside the scroll, same style as HTML version */}
      {plaintextQuote && (
        <div className="shrink-0 border-t border-border/40 px-3 py-1.5 bg-muted/20">
          <button
            type="button"
            onClick={() => setShowQuote((v) => !v)}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors font-medium flex items-center gap-1"
          >
            <span className="tracking-widest leading-none">···</span>
            {showQuote ? "Hide quoted text" : "Show quoted text"}
          </button>
        </div>
      )}
    </div>
  );

  const bodyContent =
    isEventReminderEmail && linkedCalendarEvent ? (
      <div className="@container flex min-h-0 flex-1 flex-col">
        <EventReminderBanner
          eventId={linkedCalendarEvent.eventId}
          loading={linkedCalendarEvent.loading}
          error={linkedCalendarEvent.error}
          reminder={eventReminderView}
          className="mb-0 shrink-0 rounded-b-none"
        />
        <div className="flex min-h-0 flex-1 flex-col">{standardBodyContent}</div>
      </div>
    ) : (
      standardBodyContent
    );

  // ── Reply bar ────────────────────────────────────────────────────────────────
  const COMMON_EMOJI = [
    "😀",
    "😂",
    "😍",
    "😭",
    "😊",
    "😅",
    "😎",
    "🤔",
    "😤",
    "🥺",
    "😏",
    "😴",
    "🤗",
    "😬",
    "🥳",
    "🤩",
    "😇",
    "😆",
    "🙄",
    "😡",
    "👍",
    "👎",
    "👏",
    "🙌",
    "🤝",
    "✌️",
    "👋",
    "🤞",
    "💪",
    "🖐️",
    "❤️",
    "💔",
    "💯",
    "🔥",
    "✨",
    "🎉",
    "🎊",
    "💡",
    "⭐",
    "🌟",
    "😻",
    "🐶",
    "🐱",
    "🌸",
    "🌈",
    "☀️",
    "🌙",
    "⚡",
    "🌊",
    "🍕",
    "🎵",
    "📷",
    "💬",
    "📩",
    "🔔",
    "📅",
    "📎",
    "🔗",
    "💻",
    "📱",
  ];

  const replyBar = (
    <div className="shrink-0 px-3 pb-2">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
        tabIndex={-1}
        aria-hidden="true"
      />

      {/* Collapsed pill — only rendered when not expanded */}
      {!isReplyExpanded && (
        <button
          type="button"
          onClick={() => setIsReplyExpanded(true)}
          className="w-full flex items-center gap-2 rounded-lg border border-input bg-muted/30 px-3 py-2 text-sm text-muted-foreground hover:bg-muted/60 hover:border-ring/50 transition-colors text-left"
          aria-label={`Reply to ${senderName || senderEmail}`}
        >
          <Reply className="size-3.5 shrink-0" />
          <span>
            Reply to{" "}
            <span className="font-medium text-foreground/70">
              {senderName || senderEmail}
            </span>
            …
          </span>
        </button>
      )}

      {/* Expanded card wrapper — always in DOM; GSAP controls height/opacity */}
      <div
        ref={expandedWrapRef}
        style={{ height: 0, overflow: "hidden" }}
        onBlur={(e) => {
          // Guard: don't collapse if emoji picker is open (it's a portal outside this container)
          if (emojiPickerOpen) return;
          // Collapse only if focus truly left this container
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            if (!replyText && attachedFiles.length === 0) {
              setIsReplyExpanded(false);
            }
          }
        }}
      >
        <div className="rounded-lg border border-input bg-background shadow-sm transition-colors focus-within:border-ring focus-within:shadow-[0_0_0_3px_hsl(var(--ring)/0.15)]">
          {/* Card header */}
          <div className="flex items-center gap-1.5 px-3 pt-1.5 pb-1">
            <Reply className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Reply to{" "}
              <span className="font-medium text-foreground">
                {senderName || senderEmail}
              </span>
            </span>
          </div>
          {/* Textarea — no browser outline; parent card provides focus ring */}
          <textarea
            ref={textareaRef}
            value={replyText}
            onChange={(e) => {
              setReplyText(e.target.value);
              autoResizeTextarea();
            }}
            onFocus={() => setIsReplyExpanded(true)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void handleSendReply();
              }
            }}
            placeholder="Write your reply…"
            rows={3}
            style={{ minHeight: "4.5rem" }}
            className="w-full resize-none appearance-none bg-transparent px-3 py-1 text-sm border-0 border-none ring-0 outline-none focus:outline-none focus:ring-0 focus:border-0 [&:focus-visible]:outline-none placeholder:text-muted-foreground"
            aria-label={`Reply to ${senderName || senderEmail}`}
            disabled={isBusy || isSendingReply}
          />
          {/* Attached file chips */}
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-3 pb-1.5">
              {attachedFiles.map((file) => (
                <span
                  key={`${file.name}-${file.size}-${file.lastModified}`}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  <Paperclip className="size-3 shrink-0" />
                  <span className="max-w-[120px] truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setAttachedFiles((prev) =>
                        prev.filter((attachment) => attachment !== file),
                      )
                    }
                    className="ml-0.5 rounded-sm hover:text-foreground transition-colors"
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          {/* Footer toolbar */}
          <div className="flex items-center gap-0.5 px-2 pb-1.5 pt-0.5 border-t border-border/40">
            <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  type="button"
                  aria-label="Add emoji"
                  disabled={isBusy || isSendingReply}
                >
                  <Smile />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="start"
                className="w-64 p-2"
                onInteractOutside={() => setEmojiPickerOpen(false)}
              >
                <div className="grid grid-cols-10 gap-0.5">
                  {COMMON_EMOJI.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className="flex items-center justify-center rounded p-0.5 text-base hover:bg-accent transition-colors"
                      onClick={() => {
                        setReplyText((prev) => prev + emoji);
                        setEmojiPickerOpen(false);
                        textareaRef.current?.focus();
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <Button
              variant="ghost"
              size="icon-xs"
              type="button"
              aria-label="Attach file"
              disabled={isBusy || isSendingReply}
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip />
            </Button>
            <div className="ml-auto flex items-center gap-1.5">
              <Button
                size="sm"
                type="button"
                aria-label="Send reply"
                disabled={
                  isBusy ||
                  isSendingReply ||
                  (Boolean(onSendReply) && !replyText.trim())
                }
                onClick={() => void handleSendReply()}
                className="h-7 gap-1.5 px-3 text-xs"
              >
                <Send className="size-3.5" />
                Send
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {toolbar}
      <div className="shrink min-h-0 overflow-y-auto">
        {header}
        {conversationStrip}
        {calendarInviteCard}
        {calendarCancellationCard}
        {linkedEventCard}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{bodyContent}</div>
      {replyBar}
      {/* Raw HTML source dialog */}
      <Dialog open={showRawHtmlDialog} onOpenChange={setShowRawHtmlDialog}>
        <DialogContent
          className="flex flex-col w-[90vw] max-w-4xl max-h-[80vh]"
          variant="center"
        >
          <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b border-border/60">
            <DialogTitle className="text-base">HTML source</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-auto px-6 py-4">
            <pre className="text-xs font-mono text-foreground/80 whitespace-pre-wrap break-all select-all">
              {displayHtml}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
