"use client";

import {
  Send,
  ArrowLeft,
  Paperclip,
  X,
  Minus,
  Maximize2,
  Loader2,
  Check,
  AlertCircle,
  AlignLeft,
  Type,
} from "lucide-react";
import { useId, useRef, useState, useEffect } from "react";
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
import { useIsMobile } from "@workspace/ui/hooks";
import type { JmapIdentity } from "@/lib/mail/types";
import {
  canSendCompose,
  getSimpleLoginComposeNotice,
  parsedAddressesToEmails,
  validateComposeRecipients,
  pickOutgoingAttachmentFiles,
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
  appendHtmlSignature,
  appendPlainTextSignature,
  buildEmbeddedSignatureHtml,
  getPlainTextSignature,
  hasEmbeddedSignature,
  htmlToPlainText,
  swapEmbeddedSignatureInHtml,
  swapEmbeddedSignatureInPlainText,
  resolveComposeSignatureIdentity,
  sanitizeSignatureHtml,
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
import { toast } from "@workspace/ui/lib/toast";
import { cn } from "@workspace/ui/lib/utils";
import { SimpleTooltip } from "@workspace/ui/components/ui/tooltip";

export interface ComposeDialogProps {
  identities: JmapIdentity[];
  fallbackFromEmail: string;
  onClose: () => void;
  onSend: (options?: { skipAttachmentCheck?: boolean }) => Promise<void>;
  onExpand?: () => void;
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
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={isMobile ? "h-7 px-2 text-xs text-muted-foreground" : "h-7 px-2.5 text-xs text-muted-foreground"}
        onClick={() => {
          if (hasAttachments || getMailComposeBridge()?.hasUserContent()) {
            setConfirmOpen(true);
            return;
          }
          onClear();
        }}
      >
        Clear
      </Button>
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
}: ComposeDialogProps) {
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
    draftSaveStatus,
    composeDraftId,
    clearCompose,
    composeMode,
    composeReplySource,
    quotedAttachments,
    requestComposeClose,
  } = useMailCompose();
  const { settings: composeSettings, updateSettings } = useMailComposeSettings();
  const plainTextMode = composeSettings.plainTextMode;
  const [attachmentWarning, setAttachmentWarning] = useState({
    open: false,
    keyword: "",
  });
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
  const prevSignatureIdentityIdRef = useRef<string | null>(null);
  const prevPlainTextModeRef = useRef(plainTextMode);
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

  const selectedIdentity =
    identities.find((identity) => identity.id === selectedIdentityId) ??
    identities[0] ??
    null;

  const signatureIdentity = resolveComposeSignatureIdentity(
    identities,
    selectedIdentity?.id ?? null,
  );
  const signatureEmbeddedInBody = hasEmbeddedSignature(composeHtmlBody);
  const showBelowQuoteSignaturePreview =
    !plainTextMode &&
    !signatureEmbeddedInBody &&
    composeSettings.signaturePosition === "below_quote" &&
    Boolean(
      signatureIdentity?.htmlSignature?.trim() ||
        signatureIdentity?.textSignature?.trim(),
    );

  useComposeQuotedInlineImages({
    enabled:
      !plainTextMode &&
      (composeMode === "reply" || composeMode === "forward"),
    setHtmlBody: setComposeHtmlBody,
    quotedAttachments,
    activeMailbox,
  });

  useEffect(() => {
    const previousMode = prevPlainTextModeRef.current;
    prevPlainTextModeRef.current = plainTextMode;
    if (previousMode === plainTextMode) return;

    if (plainTextMode) {
      const plain = htmlToPlainText(composeHtmlBody);
      if (plain) {
        setComposeBody(plain);
      }
      return;
    }

    if (!composeHtmlBody.trim() && composeBody.trim()) {
      setComposeHtmlBody(plainTextToComposerBody(composeBody));
    }
  }, [
    composeBody,
    composeHtmlBody,
    plainTextMode,
    setComposeBody,
    setComposeHtmlBody,
  ]);

  useEffect(() => {
    const previousIdentityId = prevSignatureIdentityIdRef.current;
    const identityChanged = previousIdentityId !== signatureIdentity?.id;
    prevSignatureIdentityIdRef.current = signatureIdentity?.id ?? null;
    if (!identityChanged) return;
    const isReplyLike = composeMode === "reply" || composeMode === "forward";
    if (isReplyLike && composeSettings.signaturePosition !== "above_quote") {
      return;
    }
    if (!isReplyLike && composeMode !== "new" && composeMode !== "draft") {
      return;
    }

    const previousSignatureIdentity = resolveComposeSignatureIdentity(
      identities,
      previousIdentityId,
    );

    if (plainTextMode) {
      const swapped = swapEmbeddedSignatureInPlainText(
        composeBody,
        previousSignatureIdentity,
        signatureIdentity,
        { separator: composeSettings.signatureSeparatorEnabled },
      );
      if (swapped !== null) {
        setComposeBody(swapped);
      }
      return;
    }

    if (!editorRef.current) return;
    const swapped = swapEmbeddedSignatureInHtml(
      serializeEditorContent(editorRef.current),
      signatureIdentity,
      { separator: composeSettings.signatureSeparatorEnabled },
    );
    if (swapped) {
      setComposeHtmlBody(swapped);
    }
  }, [
    composeBody,
    composeMode,
    composeSettings.signaturePosition,
    composeSettings.signatureSeparatorEnabled,
    identities,
    plainTextMode,
    setComposeBody,
    setComposeHtmlBody,
    signatureIdentity,
  ]);
  const fromEmail = selectedIdentity?.email ?? fallbackFromEmail;
  const fromLabel = selectedIdentity
    ? selectedIdentity.name
      ? `${selectedIdentity.name} <${fromEmail}>`
      : fromEmail
    : fallbackFromEmail;

  const recipientValidation = validateComposeRecipients({
    to: composeTo,
    cc: composeCc,
    bcc: composeBcc,
    subject: composeSubject,
  });
  const simpleLoginNotice = composeReplySource
    ? getSimpleLoginComposeNotice({
        message: composeReplySource,
        identities,
        fromEmail,
        recipients: parsedAddressesToEmails([
          ...recipientValidation.to,
          ...recipientValidation.cc,
          ...recipientValidation.bcc,
        ]),
      })
    : NO_SIMPLELOGIN_NOTICE;
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const accepted = pickOutgoingAttachmentFiles(
      Array.from(e.target.files ?? []),
      {
        maxBytes: mailServerLimits.maxOutgoingAttachmentBytes,
        onReject: (error) => toast.error(error),
      },
    );
    if (accepted.length > 0) {
      setComposeAttachments((prev) => [...prev, ...accepted]);
    }
    e.target.value = "";
  };

  const removeAttachment = (file: File) => {
    setComposeAttachments((prev) =>
      prev.filter((attachment) => attachment !== file),
    );
  };

  function addDroppedFiles(files: File[]) {
    const accepted = pickOutgoingAttachmentFiles(files, {
      maxBytes: mailServerLimits.maxOutgoingAttachmentBytes,
      onReject: (error) => toast.error(error),
    });
    if (accepted.length > 0) {
      setComposeAttachments((prev) => [...prev, ...accepted]);
    }
  }

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
      addDroppedFiles(Array.from(event.dataTransfer.files));
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

  async function requestSend(skipAttachmentCheck = false) {
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
        setAttachmentWarning({ open: true, keyword: matched });
        return;
      }
    }
    try {
      await onSend({ skipAttachmentCheck });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not send the message.",
      );
    }
  }

  const applySignaturePreview = () => {
    if (!signatureIdentity) return;
    if (plainTextMode) {
      setComposeBody(
        appendPlainTextSignature(composeBody, signatureIdentity, {
          separator: composeSettings.signatureSeparatorEnabled,
        }),
      );
      return;
    }
    const embedded = buildEmbeddedSignatureHtml(signatureIdentity, {
      embed: true,
      separator: composeSettings.signatureSeparatorEnabled,
    });
    if (!embedded) return;
    if (signatureEmbeddedInBody) {
      const swapped = swapEmbeddedSignatureInHtml(composeHtmlBody, signatureIdentity, {
        separator: composeSettings.signatureSeparatorEnabled,
      });
      if (swapped) {
        setComposeHtmlBody(swapped);
      }
      return;
    }
    setComposeHtmlBody(
      composeHtmlBody.trim()
        ? `${composeHtmlBody}${embedded}`
        : `<p></p>${embedded}`,
    );
  };

  function handleRequestClose() {
    if (requestComposeClose()) {
      onClose();
    }
  }

  function clearMessage() {
    clearCompose();
    setFieldFeedback((current) => ({
      ...current,
      toTouched: false,
      sendAttempted: false,
    }));
  }

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
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
        className={`flex items-center border-b border-border/50 shrink-0 ${
          isMobile ? "h-11 gap-1.5 px-2.5" : "h-12 gap-2 px-3"
        }`}
      >
        <button
          type="button"
          onClick={handleRequestClose}
          aria-label="Close"
          className="p-1 rounded hover:bg-muted/50 transition-colors"
        >
          <ArrowLeft className="size-4 text-muted-foreground" />
        </button>
        <span className="text-sm font-medium flex-1">
          {composeDraftId ? "Draft" : "New mail"}
        </span>
        <DraftSaveIndicator status={draftSaveStatus} />
        <ClearComposeButton
          isMobile={isMobile}
          hasAttachments={composeAttachments.length > 0}
          onClear={clearMessage}
        />
        {onExpand && (
          <SimpleTooltip content="Open full editor">
            <button
              type="button"
              onClick={onExpand}
              aria-label="Open full editor"
              className="p-1 rounded hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
            >
              <Maximize2 className="size-3.5" />
            </button>
          </SimpleTooltip>
        )}
        <Button
          size="sm"
          className={cn(
            "aria-disabled:opacity-50",
            isMobile ? "h-7 px-2.5 text-xs" : "h-7 text-xs",
          )}
          onClick={() => void requestSend()}
          aria-disabled={isBusy || undefined}
        >
          <Send size={12} />
          {isBusy ? "Sending…" : "Send"}
        </Button>
      </div>

      <div
        className={`flex items-center border-b border-border/50 shrink-0 ${
          isMobile ? "h-9 gap-2 px-3" : "h-10 gap-3 px-4"
        }`}
      >
        <label
          htmlFor={identities.length > 1 ? `${fieldId}-from` : undefined}
          className={labelClass}
        >
          From
        </label>
        {identities.length > 1 ? (
          <select
            id={`${fieldId}-from`}
            value={selectedIdentityId ?? ""}
            onChange={(event) => setSelectedIdentityId(event.target.value || null)}
            disabled={isBusy}
            className="flex-1 min-w-0 bg-transparent text-sm text-foreground border-0"
          >
            {identities.map((identity) => (
              <option key={identity.id} value={identity.id}>
                {identity.name
                  ? `${identity.name} <${identity.email}>`
                  : identity.email}
              </option>
            ))}
          </select>
        ) : (
          <span className="flex-1 text-sm text-muted-foreground truncate">
            {fromLabel}
          </span>
        )}
        {signatureIdentity &&
          (signatureIdentity.textSignature || signatureIdentity.htmlSignature) &&
          !signatureEmbeddedInBody &&
          composeSettings.signaturePosition === "below_quote" && (
            <button
              type="button"
              onClick={applySignaturePreview}
              className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground"
            >
              Insert signature
            </button>
          )}
      </div>

      {simpleLoginNotice.requiredFrom && (
        <ComposeSimpleLoginRequiredFromRow
          requiredFrom={simpleLoginNotice.requiredFrom}
          isMobile={isMobile}
          disabled={isBusy}
          onSwitch={setSelectedIdentityId}
        />
      )}

      <div
        className={`flex items-center border-b shrink-0 transition-colors ${
          isMobile ? "min-h-9 gap-2 px-3" : "min-h-10 gap-3 px-4"
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
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors px-1"
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
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors px-1"
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
            isMobile ? "min-h-9 gap-2 px-3" : "min-h-10 gap-3 px-4"
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
            isMobile ? "min-h-9 gap-2 px-3" : "min-h-10 gap-3 px-4"
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
        className={`flex items-center border-b border-border/50 shrink-0 ${
          isMobile ? "min-h-9 gap-2 px-3" : "min-h-10 gap-3 px-4"
        }`}
      >
        <label htmlFor={`${fieldId}-subject`} className={labelClass}>
          Subject
        </label>
        <input
          id={`${fieldId}-subject`}
          type="text"
          value={composeSubject}
          onChange={(e) => setComposeSubject(e.target.value)}
          placeholder="What's this about?"
          disabled={isBusy}
          aria-label="Subject"
          aria-invalid={visibleErrors.subject ? true : undefined}
          aria-describedby={visibleErrors.subject ? errorId("subject") : undefined}
          className="min-w-0 flex-1 h-8 bg-transparent border-0 text-sm placeholder:text-muted-foreground"
        />
        {visibleErrors.subject ? (
          <ComposeFieldError id={errorId("subject")} message={visibleErrors.subject} />
        ) : null}
      </div>

      <div
        className={`flex min-h-0 flex-1 flex-col overflow-hidden ${
          isMobile ? "px-1 pb-1.5 pt-1" : "px-2 pb-2 pt-2"
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
            className="min-h-0 flex-1 resize-none rounded-sm bg-transparent p-2 font-mono text-sm leading-relaxed text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground"
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
            }}
          />
        )}
      </div>

      {showBelowQuoteSignaturePreview && signatureIdentity && (
        <div
          className={`shrink-0 border-t border-border/50 text-sm leading-6 text-muted-foreground ${
            isMobile ? "px-3 py-2" : "px-4 py-2"
          }`}
        >
          {composeSettings.signatureSeparatorEnabled ? (
            <div className="mb-1">--</div>
          ) : null}
          {signatureIdentity.htmlSignature ? (
            <div
              className="break-words [&_a]:text-accent [&_a]:underline"
              // repo-rules-allow secure-email-html: signature HTML is sanitized by sanitizeSignatureHtml before insertion.
              dangerouslySetInnerHTML={{
                __html: sanitizeSignatureHtml(signatureIdentity.htmlSignature),
              }}
            />
          ) : (
            <div className="whitespace-pre-wrap break-words font-mono">
              {getPlainTextSignature(signatureIdentity)}
            </div>
          )}
        </div>
      )}

      {composeAttachments.length > 0 && (
        <div
          className={`flex flex-wrap gap-1.5 border-t border-border/50 shrink-0 ${
            isMobile ? "px-3 pb-1 pt-1.5" : "px-4 pb-1 pt-2"
          }`}
        >
          {composeAttachments.map((file) => (
            <div
              key={`${file.name}-${file.size}-${file.lastModified}`}
              className="flex min-w-0 max-w-full items-center gap-1 bg-muted/60 rounded px-2 py-1 text-xs"
            >
              <Paperclip className="size-3 shrink-0 text-muted-foreground" />
              <span className="min-w-0 break-words text-foreground/80">{file.name}</span>
              <span className="text-muted-foreground shrink-0">
                {formatFileSize(file.size)}
              </span>
              <button
                type="button"
                onClick={() => removeAttachment(file)}
                aria-label={`Remove ${file.name}`}
                className="shrink-0 ml-0.5 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {formatOpen && formatEditor && !plainTextMode ? (
        <RichTextEditorToolbar
          editor={formatEditor}
          disabled={isBusy}
          onClose={() => setFormatOpen(false)}
        />
      ) : null}

      <div
        className={`flex items-center justify-between shrink-0 ${
          formatOpen && !plainTextMode ? "" : "border-t border-[var(--border-tertiary)]"
        } ${isMobile ? "px-3 py-1.5" : "px-2 py-1.5"}`}
      >
        <div className="flex items-center gap-1">
          {!plainTextMode ? (
            <button
              type="button"
              aria-label="Formatting options"
              aria-pressed={formatOpen}
              disabled={isBusy}
              onClick={() => setFormatOpen((open) => !open)}
              className={cn(
                "inline-flex size-[30px] cursor-pointer items-center justify-center rounded-md text-[var(--icon-secondary)] hover:bg-[var(--bg-overlay-tertiary)] disabled:opacity-40",
                formatOpen && "bg-[var(--bg-overlay-tertiary)] text-[var(--icon-primary)]",
              )}
            >
              <Type className="size-4" strokeWidth={2} />
            </button>
          ) : null}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileChange}
            aria-label="Attach files"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isBusy}
            className="p-1.5 rounded hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground disabled:opacity-40"
            aria-label="Attach files"
          >
            <Paperclip className="size-4" />
          </button>
          <SimpleTooltip content={composeSettings.plainTextMode ? "Rich text compose" : "Plain text compose"}>
            <button
              type="button"
              onClick={() =>
                updateSettings({ plainTextMode: !composeSettings.plainTextMode })
              }
              disabled={isBusy}
              aria-pressed={composeSettings.plainTextMode}
              className={cn(
                "inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors disabled:opacity-40",
                composeSettings.plainTextMode
                  ? "bg-accent/15 text-accent"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              <AlignLeft className="size-3.5" />
              Plain text
            </button>
          </SimpleTooltip>
        </div>
        {visibleErrors.body ? (
          <ComposeFieldError id={errorId("body")} message={visibleErrors.body} />
        ) : (
          <span className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[11px] font-medium">
              ⌘↵
            </kbd>
            to send
          </span>
        )}
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
                void requestSend(true);
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

export function ComposeDialog({
  identities,
  fallbackFromEmail,
  onClose,
  onSend,
  onExpand,
  isBusy,
  onImageUpload,
  activeMailbox,
}: ComposeDialogProps) {
  const { isComposeOpen } = useMailComposeChrome();
  const { requestComposeClose } = useMailCompose();
  const isMobile = useIsMobile();
  const open = isComposeOpen;

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
        variant="bottom"
        showClose={false}
        showOverlay={false}
        aria-describedby={undefined}
        className="left-auto right-2 bottom-2 translate-x-0 overflow-hidden p-0 flex flex-col min-h-[500px] w-[min(50vw,800px)] min-w-[min(100%,680px)] max-h-[min(920px,calc(100dvh-16px))] rounded-[20px] bg-[var(--bg-l2-solid)] border-[var(--border-secondary)] shadow-[var(--shadow-l3)]"
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={handleDismissRequest}
      >
        <VisuallyHidden>
          <DialogTitle>New mail</DialogTitle>
        </VisuallyHidden>
        <ComposeForm {...formProps} />
      </DialogContent>
    </Dialog>
  );
}
