"use client";

import {
  Send,
  Paperclip,
  X,
  Minus,
  Maximize2,
  Loader2,
  Check,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  AlignLeft,
  Clock,
  FileSignature,
  Lock,
  LockOpen,
  Trash2,
  Type,
} from "lucide-react";
import { useEffectEvent, useId, useRef, useState, useEffect } from "react";
import type { Editor } from "@tiptap/react";
import {
  useMailCompose,
  useMailComposeChrome,
} from "./mail-compose-context";
import { getMailComposeBridge } from "./mail-compose-bridge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerHeader,
} from "@workspace/ui/components/ui/drawer";
import { VisuallyHidden } from "@workspace/ui/components/ui/visually-hidden";
import { Button } from "@workspace/ui/components/ui/button";
import { useIsMobile, useShortcutLabel } from "@workspace/ui/hooks";
import type { JmapIdentity } from "@/lib/mail/types";
import {
  canSendCompose,
  COMPOSE_SIGNED_DESCRIPTION,
  COMPOSE_SIGNED_LABEL,
  composeSignatureCandidates,
  composeSignatureKind,
  getSimpleLoginComposeNotice,
  insertMailTemplateText,
  insertPlainTextSignature,
  isValidEmailAddress,
  listComposeSignatureOptions,
  parsedAddressesToEmails,
  replaceComposePlainTextSignature,
  resolveComposeSignature,
  resolveMailTemplateSubject,
  shouldEncryptOutgoingMail,
  validateComposeRecipients,
  pickOutgoingAttachmentFiles,
  type MailTemplate,
  type SignatureSource,
  type SimpleLoginComposeNotice,
} from "@workspace/calendar-core";
import {
  ComposeSimpleLoginRequiredFromRow,
  ComposeSimpleLoginViaRow,
} from "./compose-simplelogin-rows";
import { RichTextEditor, type InlineImageUpload } from "./rich-text-editor";
import { RichTextEditorToolbar } from "./rich-text-editor-toolbar";
import { RecipientSuggestInput } from "./recipient-suggest-input";
import {
  getPlainTextSignature,
  htmlToPlainText,
  insertEmbeddedSignatureHtml,
  swapEmbeddedSignatureInHtml,
} from "@/lib/mail/signature-utils";
import {
  useMailComposeSettings,
  shouldWarnAboutMissingAttachment,
} from "@/lib/mail/compose-settings";
import { useComposeQuotedInlineImages } from "@/hooks/use-compose-quoted-inline-images";
import type { StalwartJmapClient } from "@/lib/mail/jmap-client";
import type { JmapSession } from "@/lib/mail/types";
import { serializeEditorContent } from "./quoted-html";
import { plainTextToComposerBody } from "@/lib/mail/compose-editor-utils";
import { prepareOutgoingImageFiles } from "@/lib/mail/strip-image-metadata";
import { toast } from "@workspace/ui/lib/toast";
import { cn } from "@workspace/ui/lib/utils";
import { SimpleTooltip } from "@workspace/ui/components/ui/tooltip";
import { ComposeSchedulePopover, type ComposeScheduling } from "./compose-schedule-popover";
import { ComposeTemplatesPopover } from "./compose-templates-popover";
import { ComposeSignaturePopover } from "./compose-signature-popover";
import { ComposeFromPicker } from "./compose-from-picker";
import { COMPOSE_TOOL_CLASS } from "./compose-menu";
import { useComposeWindowSize, type ComposeResizeEdge } from "./use-compose-window-size";

export interface ComposeDialogProps {
  identities: JmapIdentity[];
  /** Desktop compose folds to its title bar; the form stays mounted so nothing is lost. */
  minimized?: boolean;
  onMinimizedChange?: (minimized: boolean) => void;
  fallbackFromEmail: string;
  onClose: () => void;
  onSend: (options?: { skipAttachmentCheck?: boolean; sendAt?: string }) => Promise<void>;
  onExpand?: () => void;
  scheduling?: ComposeScheduling | null;
  isBusy: boolean;
  onImageUpload?: (file: File) => Promise<InlineImageUpload | null>;
  activeMailbox?: {
    client: StalwartJmapClient;
    session: JmapSession;
  } | null;
}

const NO_SIMPLELOGIN_NOTICE: SimpleLoginComposeNotice = { via: null, requiredFrom: null };

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DraftSaveIndicator({
  status,
}: {
  status: "idle" | "saving" | "saved" | "error";
}) {
  return (
    <output
      className={cn(
        "inline-flex min-w-0 items-center gap-1 text-[11px]",
        status === "error" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {status === "saving" ? (
        <>
          <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden />
          Saving draft…
        </>
      ) : status === "saved" ? (
        <>
          <Check className="size-3 shrink-0 text-success" aria-hidden />
          Draft saved
        </>
      ) : status === "error" ? (
        <>
          <AlertCircle className="size-3 shrink-0" aria-hidden />
          Draft not saved. Edit to retry.
        </>
      ) : null}
    </output>
  );
}

function ClearComposeButton({
  isMobile,
  hasAttachments,
  onClear,
}: {
  isMobile: boolean;
  hasAttachments: boolean;
  onClear: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const requestClear = () => {
    if (hasAttachments || getMailComposeBridge()?.hasUserContent()) {
      setConfirmOpen(true);
      return;
    }
    onClear();
  };
  return (
    <>
      {isMobile ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground"
          onClick={requestClear}
        >
          Clear
        </Button>
      ) : (
        <SimpleTooltip content="Clear message">
          <button type="button" aria-label="Clear message" onClick={requestClear} className={COMPOSE_TOOL_CLASS}>
            <Trash2 className="size-4" />
          </button>
        </SimpleTooltip>
      )}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent
          showClose={false}
          className="max-w-md p-0 overflow-hidden bg-popover border-border/50 shadow-2xl"
        >
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle>Clear this message?</DialogTitle>
            <DialogDescription>
              This removes the recipients, subject, text and attachments.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="px-5 py-4 border-t border-border/50 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setConfirmOpen(false);
                onClear();
              }}
            >
              Clear message
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ComposeSignedIndicator() {
  return (
    <SimpleTooltip content={COMPOSE_SIGNED_DESCRIPTION}>
      <p className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
        <FileSignature className="size-3.5 shrink-0" aria-hidden />
        <span className="sr-only sm:not-sr-only">{COMPOSE_SIGNED_LABEL}</span>
        <span className="sr-only">. {COMPOSE_SIGNED_DESCRIPTION}</span>
      </p>
    </SimpleTooltip>
  );
}

type ComposeEncryption = "encrypted" | "external" | null;

/** Mail is end-to-end encrypted only when every recipient is on Solace, the same rule the send path uses. */
function ComposeEncryptionStatus({ state }: { state: ComposeEncryption }) {
  if (!state) return null;
  const encrypted = state === "encrypted";
  const label = encrypted ? "End-to-end encrypted" : "Not end-to-end encrypted";
  const description = encrypted
    ? "Everyone you're writing to uses Solace, so only they can read it."
    : "People outside Solace get this message unencrypted.";
  return (
    <SimpleTooltip content={description}>
      <p className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        {encrypted ? <Lock className="size-3.5 shrink-0" aria-hidden /> : <LockOpen className="size-3.5 shrink-0" aria-hidden />}
        <span className="sr-only sm:not-sr-only">{label}</span>
        <span className="sr-only">. {description}</span>
      </p>
    </SimpleTooltip>
  );
}

function ComposeHeaderButton({
  label,
  expanded,
  onClick,
  children,
}: {
  label: string;
  expanded?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <SimpleTooltip content={label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-expanded={expanded}
        className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[var(--bg-overlay-tertiary)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {children}
      </button>
    </SimpleTooltip>
  );
}

function attachmentKind(name: string): string {
  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
  return extension && extension.length <= 4 ? extension : "file";
}

function ComposeFieldError({ id, message }: { id: string; message: string }) {
  return (
    <p
      id={id}
      className="min-w-0 max-w-[50%] py-1 text-right text-xs leading-snug text-destructive"
    >
      {message}
    </p>
  );
}

function useFormatBar() {
  const [formatBar, setFormatBar] = useState<{
    editor: Editor | null;
    open: boolean;
  }>({ editor: null, open: false });

  return {
    editor: formatBar.editor,
    open: formatBar.open,
    setEditor: (editor: Editor | null) =>
      setFormatBar((current) => ({ ...current, editor })),
    setOpen: (open: boolean | ((current: boolean) => boolean)) =>
      setFormatBar((current) => ({
        ...current,
        open: typeof open === "function" ? open(current.open) : open,
      })),
  };
}

export function ComposeForm({
  identities,
  fallbackFromEmail,
  onClose,
  onSend,
  onExpand,
  isBusy,
  onImageUpload,
  activeMailbox = null,
  scheduling = null,
  autoFocus = false,
  minimized = false,
  onMinimizedChange,
}: ComposeDialogProps & { autoFocus?: boolean }) {
  const {
    composeTo,
    setComposeTo,
    composeCc,
    setComposeCc,
    composeBcc,
    setComposeBcc,
    composeSubject,
    setComposeSubject,
    composeBody,
    setComposeBody,
    composeHtmlBody,
    setComposeHtmlBody,
    composeAttachments,
    setComposeAttachments,
    mailServerLimits,
    selectedIdentityId,
    setSelectedIdentityId,
    signatureChoice,
    setSignatureChoice,
    draftSaveStatus,
    composeDraftId,
    clearCompose,
    composeMode,
    composeReplySource,
    quotedAttachments,
    requestComposeClose,
    plainTextMode,
    setPlainTextMode,
  } = useMailCompose();
  const { settings: composeSettings } = useMailComposeSettings();
  const [attachmentWarning, setAttachmentWarning] = useState<{
    open: boolean;
    keyword: string;
    sendAt?: string;
  }>({
    open: false,
    keyword: "",
  });
  // A picked send time only arms the Schedule button; nothing is scheduled until the user presses it.
  const [scheduledSendAt, setScheduledSendAt] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const {
    editor: formatEditor,
    setEditor: setFormatEditor,
    open: formatOpen,
    setOpen: setFormatOpen,
  } = useFormatBar();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [ccBccVisible, setCcBccVisible] = useState({
    cc: !!composeCc,
    bcc: !!composeBcc,
  });
  const { isComposeOpen } = useMailComposeChrome();
  const [fieldFeedback, setFieldFeedback] = useState({
    composeOpen: isComposeOpen,
    toTouched: false,
    sendAttempted: false,
  });
  // The dialog keeps this form mounted between composes, so feedback resets when compose opens or closes.
  if (fieldFeedback.composeOpen !== isComposeOpen) {
    setFieldFeedback({
      composeOpen: isComposeOpen,
      toTouched: false,
      sendAttempted: false,
    });
  }
  const fieldId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();
  const sendShortcut = useShortcutLabel("↵");
  const hasRecipients = composeTo.trim().length > 0;

  const selectedIdentity =
    identities.find((identity) => identity.id === selectedIdentityId) ??
    identities[0] ??
    null;

  const signatureKind = composeSignatureKind(composeMode);
  const signatureOptions = { separator: composeSettings.signatureSeparatorEnabled };
  const activeSignature = resolveComposeSignature(
    composeSettings,
    identities,
    selectedIdentity?.id ?? null,
    signatureKind,
    signatureChoice,
  );
  const hasActiveSignature = Boolean(getPlainTextSignature(activeSignature));
  const signaturePlacement = {
    ...signatureOptions,
    aboveQuote:
      signatureKind === "replyForward" &&
      composeSettings.replySignaturePosition === "above_quote",
  };

  useComposeQuotedInlineImages({
    enabled:
      !plainTextMode &&
      (composeMode === "reply" || composeMode === "forward"),
    setHtmlBody: setComposeHtmlBody,
    quotedAttachments,
    activeMailbox,
  });

  // Only the editor the dialog opens with takes the initial focus; one created by a later mode switch leaves the caret alone.
  const editorAutoFocusRef = useRef(autoFocus && !plainTextMode);
  const focusComposeStart = useEffectEvent(() => {
    if (!hasRecipients) {
      document.getElementById(`${fieldId}-to`)?.focus();
      return;
    }
    if (plainTextMode) {
      bodyRef.current?.focus();
      bodyRef.current?.setSelectionRange(0, 0);
    }
  });

  useEffect(() => {
    if (autoFocus) focusComposeStart();
  }, [autoFocus]);

  const fromEmail = selectedIdentity?.email ?? fallbackFromEmail;

  const recipientValidation = validateComposeRecipients({
    to: composeTo,
    cc: composeCc,
    bcc: composeBcc,
    subject: composeSubject,
  });
  const recipientEmails = parsedAddressesToEmails([
    ...recipientValidation.to,
    ...recipientValidation.cc,
    ...recipientValidation.bcc,
  ]);
  const simpleLoginNotice = composeReplySource
    ? getSimpleLoginComposeNotice({
        message: composeReplySource,
        identities,
        fromEmail,
        recipients: recipientEmails,
      })
    : NO_SIMPLELOGIN_NOTICE;
  // Only finished addresses count, so the status does not flicker while an address is typed.
  const finishedRecipients = recipientEmails.filter(isValidEmailAddress);
  const internalDomain = scheduling?.internalDomain ?? null;
  let encryption: ComposeEncryption = null;
  if (internalDomain && finishedRecipients.length > 0) {
    encryption = shouldEncryptOutgoingMail(finishedRecipients, internalDomain) ? "encrypted" : "external";
  }
  const savedSignatureName = (signatureId: string | null | undefined) =>
    composeSettings.signatures.find((signature) => signature.id === signatureId)?.name ?? null;
  const hasSavedSignatures = composeSettings.signatures.length > 0;
  const signatureNameFor = (identityId: string) =>
    hasSavedSignatures
      ? (savedSignatureName(resolveComposeSignature(composeSettings, identities, identityId, signatureKind)?.id) ?? "No signature")
      : null;
  const defaultSignatureKey = hasSavedSignatures
    ? (resolveComposeSignature(composeSettings, identities, selectedIdentity?.id ?? null, signatureKind)?.id ?? null)
    : null;
  const sendLabel = scheduledSendAt
    ? isBusy
      ? "Scheduling…"
      : "Schedule"
    : isBusy
      ? "Sending…"
      : "Send";
  const composeBodyText = plainTextMode
    ? composeBody
    : htmlToPlainText(composeHtmlBody);
  const inlineImageCount = plainTextMode
    ? 0
    : (composeHtmlBody.match(/<img\b/gi)?.length ?? 0);
  const canSend = canSendCompose({
    to: composeTo,
    cc: composeCc,
    bcc: composeBcc,
    subject: composeSubject,
    bodyText: composeBodyText,
    attachmentCount: composeAttachments.length + inlineImageCount,
  });
  const toFieldErrors = validateComposeRecipients({ to: composeTo }).errors;
  const fieldErrors = {
    to: toFieldErrors.to ?? toFieldErrors.recipients,
    cc: validateComposeRecipients({ to: composeCc }).errors.recipients,
    bcc: validateComposeRecipients({ to: composeBcc }).errors.recipients,
    subject: recipientValidation.errors.subject,
    body:
      composeBodyText.trim() || composeAttachments.length + inlineImageCount > 0
        ? undefined
        : "Write a message or attach a file.",
  };
  const { sendAttempted } = fieldFeedback;
  const showToFeedback =
    sendAttempted || (fieldFeedback.toTouched && composeTo.trim().length > 0);
  const visibleErrors = {
    to: showToFeedback ? fieldErrors.to : undefined,
    cc: sendAttempted ? fieldErrors.cc : undefined,
    bcc: sendAttempted ? fieldErrors.bcc : undefined,
    subject: sendAttempted ? fieldErrors.subject : undefined,
    body: sendAttempted ? fieldErrors.body : undefined,
  };
  const errorId = (field: keyof typeof fieldErrors) =>
    `${fieldId}-${field}-error`;
  const showCc = ccBccVisible.cc || composeCc.length > 0;
  const showBcc = ccBccVisible.bcc || composeBcc.length > 0;
  const labelClass = cn(
    "shrink-0 text-xs font-medium text-muted-foreground",
    isMobile ? "w-10" : "w-14",
  );

  // Size limits apply to the re-encoded files.
  const addAttachments = (files: File[]) => {
    prepareOutgoingImageFiles(files)
      .then((prepared) => {
        const accepted = pickOutgoingAttachmentFiles(prepared, {
          maxBytes: mailServerLimits.maxOutgoingAttachmentBytes,
          onReject: (error) => toast.error(error),
        });
        if (accepted.length > 0) {
          setComposeAttachments((prev) => [...prev, ...accepted]);
        }
      })
      .catch(() => toast.error("Could not attach the file."));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    addAttachments(Array.from(e.target.files ?? []));
    e.target.value = "";
  };

  const removeAttachment = (file: File) => {
    setComposeAttachments((prev) =>
      prev.filter((attachment) => attachment !== file),
    );
  };

  function clearDragState() {
    if (dragTimeoutRef.current) clearTimeout(dragTimeoutRef.current);
    dragTimeoutRef.current = null;
    setIsDraggingOver(false);
  }

  function resetDragTimeout() {
    if (dragTimeoutRef.current) clearTimeout(dragTimeoutRef.current);
    dragTimeoutRef.current = setTimeout(clearDragState, 150);
  }

  function handleDragEnter(event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer.types.includes("Files")) {
      setIsDraggingOver(true);
      resetDragTimeout();
    }
  }

  function handleDragLeave(event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    resetDragTimeout();
  }

  function handleDragOver(event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    resetDragTimeout();
  }

  function handleDrop(event: React.DragEvent) {
    const target = event.target as HTMLElement | null;
    if (target?.closest(".ProseMirror, .tiptap")) {
      clearDragState();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    clearDragState();
    if (event.dataTransfer.files?.length) {
      addAttachments(Array.from(event.dataTransfer.files));
    }
  }

  function focusFirstInvalidField() {
    const field = (["to", "cc", "bcc", "subject"] as const).find(
      (name) => fieldErrors[name],
    );
    if (field) {
      document.getElementById(`${fieldId}-${field}`)?.focus();
      return;
    }
    if (plainTextMode) {
      bodyRef.current?.focus();
      return;
    }
    editorRef.current?.commands.focus();
  }

  async function requestSend(
    skipAttachmentCheck = false,
    sendAt: string | undefined = scheduledSendAt ?? undefined,
  ) {
    if (isBusy) return;
    if (!canSend) {
      setFieldFeedback((current) => ({ ...current, sendAttempted: true }));
      focusFirstInvalidField();
      return;
    }
    if (!skipAttachmentCheck) {
      const matched = shouldWarnAboutMissingAttachment({
        enabled: composeSettings.attachmentReminderEnabled,
        attachmentCount: composeAttachments.length,
        subject: composeSubject,
        bodyText: composeBodyText,
        keywords: composeSettings.attachmentReminderKeywords,
      });
      if (matched) {
        setAttachmentWarning({ open: true, keyword: matched, sendAt });
        return;
      }
    }
    try {
      await onSend({ skipAttachmentCheck, sendAt });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not send the message.",
      );
    }
  }

  const insertAtTextareaCaret = (text: string) => {
    const textarea = bodyRef.current;
    const next = insertMailTemplateText(
      composeBody,
      textarea
        ? { start: textarea.selectionStart, end: textarea.selectionEnd }
        : null,
      text,
    );
    setComposeBody(next.text);
    requestAnimationFrame(() => {
      bodyRef.current?.focus();
      bodyRef.current?.setSelectionRange(next.selection.start, next.selection.end);
    });
  };

  /** Swaps the body's unchanged signature for `next`; when it holds none, `insert` adds `next` where a new compose puts it. */
  const applySignature = (next: SignatureSource | null, insert: boolean) => {
    const candidates = composeSignatureCandidates(composeSettings, identities);
    if (plainTextMode) {
      const updated =
        replaceComposePlainTextSignature(composeBody, candidates, next, signatureOptions) ??
        (insert ? insertPlainTextSignature(composeBody, next, signaturePlacement) : composeBody);
      if (updated !== composeBody) setComposeBody(updated);
      return;
    }
    const editor = editorRef.current;
    const html = editor ? serializeEditorContent(editor) : composeHtmlBody;
    const updated =
      swapEmbeddedSignatureInHtml(html, candidates, next, signatureOptions) ??
      (insert ? insertEmbeddedSignatureHtml(html, next, signaturePlacement) : html);
    if (updated !== html) setComposeHtmlBody(updated);
  };

  const chooseSignature = (choice: string | null | undefined) => {
    setSignatureChoice(choice);
    applySignature(
      resolveComposeSignature(
        composeSettings,
        identities,
        selectedIdentity?.id ?? null,
        signatureKind,
        choice,
      ),
      true,
    );
  };

  // A new sender's default replaces the inserted signature only while it is unchanged.
  const changeIdentity = (identityId: string | null) => {
    applySignature(
      resolveComposeSignature(composeSettings, identities, identityId, signatureKind),
      false,
    );
    setSelectedIdentityId(identityId);
  };

  const insertTemplate = (template: MailTemplate) => {
    setComposeSubject(resolveMailTemplateSubject(composeSubject, template));
    if (!plainTextMode) {
      editorRef.current?.chain().focus().insertContent(plainTextToComposerBody(template.body)).run();
      return;
    }
    insertAtTextareaCaret(template.body);
  };

  function handleRequestClose() {
    if (requestComposeClose()) {
      onClose();
    }
  }

  function clearMessage() {
    clearCompose();
    setScheduledSendAt(null);
    setFieldFeedback((current) => ({
      ...current,
      toTouched: false,
      sendAttempted: false,
    }));
  }

  return (
    <div
      // Clips to its container's corners, since the docked window leaves its edge unclipped for the resize grips.
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[inherit]"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {isDraggingOver && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center rounded-lg border-2 border-dashed border-accent bg-background/80">
          <div className="flex flex-col items-center gap-2 text-accent">
            <Paperclip className="size-8" />
            <span className="text-sm font-medium">Drop files to attach</span>
          </div>
        </div>
      )}
      <div
        className={cn(
          "flex shrink-0 items-center border-b border-border/50",
          isMobile ? "h-11 gap-1.5 px-2.5" : "h-[52px] gap-2.5 pl-[18px] pr-2",
        )}
      >
        {minimized ? (
          <button
            type="button"
            onClick={() => onMinimizedChange?.(false)}
            className="min-w-0 flex-1 cursor-pointer truncate rounded text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {composeSubject.trim() || (composeDraftId ? "Draft" : "New mail")}
          </button>
        ) : (
          <span className="shrink-0 text-sm font-semibold">
            {composeDraftId ? "Draft" : "New mail"}
          </span>
        )}
        <DraftSaveIndicator status={draftSaveStatus} />
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {isMobile && !minimized ? (
            <ClearComposeButton
              isMobile
              hasAttachments={composeAttachments.length > 0}
              onClear={clearMessage}
            />
          ) : null}
          {onMinimizedChange ? (
            <ComposeHeaderButton
              label={minimized ? "Restore" : "Minimize"}
              expanded={!minimized}
              onClick={() => onMinimizedChange(!minimized)}
            >
              {minimized ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </ComposeHeaderButton>
          ) : null}
          {onExpand && !minimized ? (
            <ComposeHeaderButton label="Open full editor" onClick={onExpand}>
              <Maximize2 className="size-3.5" />
            </ComposeHeaderButton>
          ) : null}
          {isMobile ? (
            <Button
              size="sm"
              className="mx-1 h-7 px-2.5 text-xs aria-disabled:opacity-50"
              onClick={() => void requestSend()}
              aria-disabled={isBusy || undefined}
            >
              {scheduledSendAt ? <Clock size={12} /> : <Send size={12} />}
              {sendLabel}
            </Button>
          ) : null}
          <ComposeHeaderButton label="Close" onClick={handleRequestClose}>
            <X className="size-4" />
          </ComposeHeaderButton>
        </div>
      </div>

      <div className={cn("flex min-h-0 flex-1 flex-col", minimized && "hidden")}>
      <div
        className={cn(
          "flex shrink-0 items-center border-b border-border/50",
          isMobile ? "h-10 gap-2 px-3" : "h-12 gap-3 px-4",
        )}
      >
        <label
          htmlFor={identities.length > 1 ? `${fieldId}-from` : undefined}
          className={labelClass}
        >
          From
        </label>
        <ComposeFromPicker
          id={`${fieldId}-from`}
          identities={identities}
          selected={selectedIdentity}
          fallbackEmail={fallbackFromEmail}
          disabled={isBusy}
          signatureNameFor={signatureNameFor}
          onChange={changeIdentity}
        />
      </div>

      {simpleLoginNotice.requiredFrom && (
        <ComposeSimpleLoginRequiredFromRow
          requiredFrom={simpleLoginNotice.requiredFrom}
          isMobile={isMobile}
          disabled={isBusy}
          onSwitch={changeIdentity}
        />
      )}

      <div
        className={`flex items-center border-b shrink-0 transition-colors ${
          isMobile ? "min-h-10 gap-2 px-3" : "min-h-12 gap-3 px-4"
        } ${visibleErrors.to ? "border-destructive/60" : "border-border/50"}`}
      >
        <label
          htmlFor={`${fieldId}-to`}
          className={cn(labelClass, visibleErrors.to && "text-destructive")}
        >
          To
        </label>
        <RecipientSuggestInput
          id={`${fieldId}-to`}
          aria-invalid={visibleErrors.to ? true : undefined}
          aria-describedby={visibleErrors.to ? errorId("to") : undefined}
          value={composeTo}
          onChange={setComposeTo}
          onBlur={() =>
            setFieldFeedback((current) => ({ ...current, toTouched: true }))
          }
          placeholder="recipient@example.com"
          disabled={isBusy}
          internalDomain={internalDomain}
          encrypted={encryption === "encrypted"}
        />
        {visibleErrors.to ? (
          <ComposeFieldError id={errorId("to")} message={visibleErrors.to} />
        ) : (
          <div className="flex items-center gap-1 shrink-0">
            {!showCc && (
              <button
                type="button"
                onClick={() =>
                  setCcBccVisible((current) => ({ ...current, cc: true }))
                }
                className="cursor-pointer rounded px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                CC
              </button>
            )}
            {!showBcc && (
              <button
                type="button"
                onClick={() =>
                  setCcBccVisible((current) => ({ ...current, bcc: true }))
                }
                className="cursor-pointer rounded px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                BCC
              </button>
            )}
          </div>
        )}
      </div>

      {showCc && (
        <div
          className={`flex items-center border-b border-border/50 shrink-0 ${
            isMobile ? "min-h-10 gap-2 px-3" : "min-h-12 gap-3 px-4"
          }`}
        >
          <label htmlFor={`${fieldId}-cc`} className={labelClass}>
            CC
          </label>
          <RecipientSuggestInput
            id={`${fieldId}-cc`}
            aria-invalid={visibleErrors.cc ? true : undefined}
            aria-describedby={visibleErrors.cc ? errorId("cc") : undefined}
            value={composeCc}
            onChange={setComposeCc}
            placeholder="cc@example.com"
            disabled={isBusy}
            internalDomain={internalDomain}
            encrypted={encryption === "encrypted"}
          />
          {visibleErrors.cc ? (
            <ComposeFieldError id={errorId("cc")} message={visibleErrors.cc} />
          ) : null}
          <button
            type="button"
            onClick={() => {
              setCcBccVisible((current) => ({ ...current, cc: false }));
              setComposeCc("");
            }}
            aria-label="Hide CC"
            className="shrink-0 p-0.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Minus className="size-3" />
          </button>
        </div>
      )}

      {showBcc && (
        <div
          className={`flex items-center border-b border-border/50 shrink-0 ${
            isMobile ? "min-h-10 gap-2 px-3" : "min-h-12 gap-3 px-4"
          }`}
        >
          <label htmlFor={`${fieldId}-bcc`} className={labelClass}>
            BCC
          </label>
          <RecipientSuggestInput
            id={`${fieldId}-bcc`}
            aria-invalid={visibleErrors.bcc ? true : undefined}
            aria-describedby={visibleErrors.bcc ? errorId("bcc") : undefined}
            value={composeBcc}
            onChange={setComposeBcc}
            placeholder="bcc@example.com"
            disabled={isBusy}
            internalDomain={internalDomain}
            encrypted={encryption === "encrypted"}
          />
          {visibleErrors.bcc ? (
            <ComposeFieldError id={errorId("bcc")} message={visibleErrors.bcc} />
          ) : null}
          <button
            type="button"
            onClick={() => {
              setCcBccVisible((current) => ({ ...current, bcc: false }));
              setComposeBcc("");
            }}
            aria-label="Hide BCC"
            className="shrink-0 p-0.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Minus className="size-3" />
          </button>
        </div>
      )}

      {simpleLoginNotice.via && (
        <ComposeSimpleLoginViaRow via={simpleLoginNotice.via} isMobile={isMobile} />
      )}

      <div
        className={cn(
          "flex shrink-0 items-center border-b border-border/50",
          isMobile ? "min-h-11 gap-2 px-3" : "min-h-14 gap-3 px-4",
        )}
      >
        <label htmlFor={`${fieldId}-subject`} className="sr-only">
          Subject
        </label>
        <input
          id={`${fieldId}-subject`}
          type="text"
          value={composeSubject}
          onChange={(e) => setComposeSubject(e.target.value)}
          placeholder="Subject"
          disabled={isBusy}
          aria-invalid={visibleErrors.subject ? true : undefined}
          aria-describedby={visibleErrors.subject ? errorId("subject") : undefined}
          className="-ml-2 h-9 min-w-0 flex-1 rounded-lg border-0 bg-transparent px-2 text-[17px] font-semibold tracking-[-0.01em] placeholder:font-normal placeholder:text-muted-foreground"
        />
        {visibleErrors.subject ? (
          <ComposeFieldError id={errorId("subject")} message={visibleErrors.subject} />
        ) : null}
      </div>

      {formatOpen && formatEditor && !plainTextMode ? (
        <RichTextEditorToolbar
          editor={formatEditor}
          disabled={isBusy}
          onImageUpload={onImageUpload}
          onClose={() => setFormatOpen(false)}
        />
      ) : null}

      <div
        className={`flex min-h-0 flex-1 flex-col overflow-hidden ${
          isMobile ? "px-1 pb-1.5 pt-1" : "px-3 pb-2 pt-3"
        }`}
        role="presentation"
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            void requestSend();
          }
        }}
      >
        {plainTextMode ? (
          <textarea
            ref={bodyRef}
            value={composeBody}
            onChange={(event) => setComposeBody(event.target.value)}
            placeholder="Write your message…"
            disabled={isBusy}
            aria-label="Message body"
            aria-invalid={visibleErrors.body ? true : undefined}
            aria-describedby={visibleErrors.body ? errorId("body") : undefined}
            className="min-h-0 flex-1 resize-none rounded-lg bg-transparent p-2 font-mono text-sm leading-relaxed text-foreground placeholder:text-muted-foreground"
          />
        ) : (
          <RichTextEditor
            content={composeHtmlBody}
            onChange={setComposeHtmlBody}
            onImageUpload={onImageUpload}
            disabled={isBusy}
            className="min-h-0 flex-1"
            errorId={visibleErrors.body ? errorId("body") : undefined}
            onEditorReady={(nextEditor) => {
              editorRef.current = nextEditor;
              setFormatEditor(nextEditor);
              if (editorAutoFocusRef.current && hasRecipients) {
                // The editor loads the quoted reply a frame later; focusing first would push the caret below it.
                requestAnimationFrame(() => nextEditor.commands.focus("start"));
              }
              editorAutoFocusRef.current = false;
            }}
          />
        )}
      </div>

      {composeAttachments.length > 0 && (
        <div
          className={`flex flex-wrap gap-2 shrink-0 ${
            isMobile ? "px-3 pb-2 pt-1" : "px-4 pb-3 pt-1"
          }`}
        >
          {composeAttachments.map((file) => (
            <div
              key={`${file.name}-${file.size}-${file.lastModified}`}
              className="flex h-10 min-w-0 max-w-full items-center gap-2.5 rounded-[10px] border border-[var(--border-secondary)] pl-2 pr-1.5"
            >
              <span
                aria-hidden
                className="flex size-[26px] shrink-0 items-center justify-center rounded-md bg-[var(--bg-overlay-tertiary)] text-[9px] font-bold uppercase text-muted-foreground"
              >
                {attachmentKind(file.name)}
              </span>
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-[12.5px] text-foreground/90">{file.name}</span>
                <span className="text-[11px] text-muted-foreground">
                  {formatFileSize(file.size)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => removeAttachment(file)}
                aria-label={`Remove ${file.name}`}
                className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[var(--bg-overlay-tertiary)] hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="@container flex shrink-0 items-center gap-1 border-t border-[var(--border-tertiary)] px-3 py-2.5">
        {isMobile ? null : (
          <>
            <div className="flex shrink-0 items-center">
              <Button
                size="sm"
                className={cn("h-9 gap-1.5 px-3.5 text-[13.5px] aria-disabled:opacity-50", scheduling && "rounded-r-none")}
                onClick={() => void requestSend()}
                aria-disabled={isBusy || undefined}
              >
                {scheduledSendAt ? <Clock size={14} /> : <Send size={14} />}
                {sendLabel}
              </Button>
              {scheduling ? (
                <ComposeSchedulePopover
                  split
                  scheduling={scheduling}
                  recipients={recipientEmails}
                  disabled={isBusy}
                  scheduledSendAt={scheduledSendAt}
                  onSchedule={setScheduledSendAt}
                  onClear={() => setScheduledSendAt(null)}
                />
              ) : null}
            </div>
            <span aria-hidden className="mx-1.5 h-5 w-px shrink-0 bg-[var(--border-secondary)]" />
          </>
        )}
        {!plainTextMode ? (
          <SimpleTooltip content="Formatting">
            <button
              type="button"
              aria-label="Formatting options"
              aria-pressed={formatOpen}
              disabled={isBusy}
              onClick={() => setFormatOpen((open) => !open)}
              className={cn(
                COMPOSE_TOOL_CLASS,
                formatOpen && "bg-[var(--bg-overlay-tertiary)] text-[var(--icon-primary)]",
              )}
            >
              <Type className="size-[17px]" strokeWidth={2} />
            </button>
          </SimpleTooltip>
        ) : null}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileChange}
          aria-label="Attach files"
        />
        <SimpleTooltip content="Attach files">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isBusy}
            className={COMPOSE_TOOL_CLASS}
            aria-label="Attach files"
          >
            <Paperclip className="size-[17px]" />
          </button>
        </SimpleTooltip>
        <ComposeTemplatesPopover
          templates={composeSettings.templates}
          disabled={isBusy}
          onInsert={insertTemplate}
        />
        <ComposeSignaturePopover
          options={listComposeSignatureOptions(
            composeSettings,
            identities,
            selectedIdentity?.id ?? null,
            signatureKind,
            signatureChoice,
          )}
          defaultKey={defaultSignatureKey}
          noneSelected={!hasActiveSignature}
          disabled={isBusy}
          onChoose={chooseSignature}
        />
        {isMobile && scheduling ? (
          <ComposeSchedulePopover
            scheduling={scheduling}
            recipients={recipientEmails}
            disabled={isBusy}
            scheduledSendAt={scheduledSendAt}
            onSchedule={setScheduledSendAt}
            onClear={() => setScheduledSendAt(null)}
          />
        ) : null}
        <SimpleTooltip content={plainTextMode ? "Write this message as rich text" : "Write this message as plain text"}>
          <button
            type="button"
            onClick={() => setPlainTextMode(!plainTextMode)}
            disabled={isBusy}
            aria-pressed={plainTextMode}
            className={cn(
              "ml-0.5 inline-flex h-[34px] cursor-pointer items-center gap-1.5 rounded-[9px] px-2.5 text-xs transition-colors disabled:opacity-40",
              plainTextMode
                ? "bg-accent/15 text-accent"
                : "text-muted-foreground hover:bg-[var(--bg-overlay-tertiary)] hover:text-foreground",
            )}
          >
            <AlignLeft className="size-3.5" />
            Plain text
          </button>
        </SimpleTooltip>
        <div className="ml-auto flex min-w-0 items-center gap-3.5 pl-2">
          <ComposeEncryptionStatus state={encryption} />
          {composeSettings.signOutgoingMail ? <ComposeSignedIndicator /> : null}
          {visibleErrors.body ? (
            <ComposeFieldError id={errorId("body")} message={visibleErrors.body} />
          ) : (
            <span className="hidden items-center gap-2 text-xs text-muted-foreground @[52rem]:flex">
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[11px] font-medium">
                {sendShortcut}
              </kbd>
              {scheduledSendAt ? "to schedule" : "to send"}
            </span>
          )}
          {isMobile ? null : (
            <ClearComposeButton
              isMobile={false}
              hasAttachments={composeAttachments.length > 0}
              onClear={clearMessage}
            />
          )}
        </div>
      </div>

      </div>

      <Dialog
        open={attachmentWarning.open}
        onOpenChange={(open) =>
          setAttachmentWarning((current) => ({ ...current, open }))
        }
      >
        <DialogContent
          showClose={false}
          className="max-w-md p-0 overflow-hidden bg-popover border-border/50 shadow-2xl"
        >
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle>Forgot an attachment?</DialogTitle>
            <DialogDescription>
              Your message mentions “{attachmentWarning.keyword}” but no files are
              attached.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="px-5 py-4 border-t border-border/50 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setAttachmentWarning((current) => ({ ...current, open: false }))
              }
            >
              Go back
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setAttachmentWarning((current) => ({ ...current, open: false }));
                void requestSend(true, attachmentWarning.sendAt);
              }}
            >
              Send anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Invisible grips on the docked window's free edges; Open full editor is the way to a bigger composer without dragging. */
function ComposeResizeHandles({
  handleProps,
}: {
  handleProps: (edge: ComposeResizeEdge) => React.HTMLAttributes<HTMLElement>;
}) {
  return (
    <>
      <div aria-hidden {...handleProps("top")} className="absolute inset-x-5 -top-1 z-10 h-2 cursor-ns-resize touch-none" />
      <div aria-hidden {...handleProps("left")} className="absolute inset-y-5 -left-1 z-10 w-2 cursor-ew-resize touch-none" />
      <div aria-hidden {...handleProps("corner")} className="absolute -top-1.5 -left-1.5 z-10 size-6 cursor-nwse-resize touch-none" />
    </>
  );
}

export function ComposeDialog({
  identities,
  fallbackFromEmail,
  onClose,
  onSend,
  onExpand,
  isBusy,
  onImageUpload,
  activeMailbox,
  scheduling,
}: ComposeDialogProps) {
  const { isComposeOpen, isComposeMinimized: minimized, setIsComposeMinimized } = useMailComposeChrome();
  const { requestComposeClose } = useMailCompose();
  const isMobile = useIsMobile();
  const open = isComposeOpen;
  const { size, windowRef, handleProps } = useComposeWindowSize();

  function handleDismiss() {
    if (requestComposeClose()) {
      onClose();
    }
  }

  const formProps = {
    identities,
    fallbackFromEmail,
    onClose,
    onSend,
    onExpand,
    isBusy,
    onImageUpload,
    activeMailbox,
    scheduling,
  };

  function handleDismissRequest(event?: Event) {
    event?.preventDefault();
    handleDismiss();
  }

  if (isMobile) {
    return (
      <Drawer
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) handleDismissRequest();
        }}
      >
        <DrawerContent
          className="max-h-[100svh] rounded-t-[1.25rem]"
          onPointerDownOutside={handleDismissRequest}
          onInteractOutside={handleDismissRequest}
          onEscapeKeyDown={handleDismissRequest}
        >
          <VisuallyHidden>
            <DrawerHeader showClose={false}>
              <DrawerTitle>New mail</DrawerTitle>
            </DrawerHeader>
          </VisuallyHidden>
          <ComposeForm {...formProps} />
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog
      open={open}
      modal={false}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) handleDismissRequest();
      }}
    >
      <DialogContent
        ref={windowRef}
        variant="bottom"
        showClose={false}
        showOverlay={false}
        aria-describedby={undefined}
        style={minimized ? undefined : { width: size.width, height: size.height }}
        className={cn(
          // Grips sit just outside the rounded edge, so the window does not clip, and without a transition a resize follows the pointer.
          "left-auto right-2 bottom-2 translate-x-0 transition-none overflow-visible p-0 flex flex-col max-w-[calc(100dvw-1rem)] max-h-[calc(100dvh-1rem)] rounded-[20px] bg-[var(--bg-l2-solid)] border-[var(--border-secondary)] shadow-[var(--shadow-l3)]",
          minimized && "w-[min(100%,360px)]",
        )}
        // ComposeForm focuses To, or the body when replying, instead of the first header button.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={handleDismissRequest}
      >
        <VisuallyHidden>
          <DialogTitle>New mail</DialogTitle>
        </VisuallyHidden>
        {minimized ? null : <ComposeResizeHandles handleProps={handleProps} />}
        <ComposeForm
          {...formProps}
          autoFocus
          minimized={minimized}
          onMinimizedChange={setIsComposeMinimized}
        />
      </DialogContent>
    </Dialog>
  );
}
