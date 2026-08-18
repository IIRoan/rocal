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
} from "lucide-react";
import { useRef, useState, useEffect } from "react";
import type { Editor } from "@tiptap/react";
import {
  useMailCompose,
  useMailComposeChrome,
} from "./mail-compose-context";
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
  validateComposeRecipients,
  pickOutgoingAttachmentFiles,
} from "@workspace/calendar-core";
import { RichTextEditor, type InlineImageUpload } from "./rich-text-editor";
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
import { toast } from "sonner";
import { cn } from "@workspace/ui/lib/utils";

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
  if (status === "idle") return null;
  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        Saving draft…
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <Check className="size-3 text-emerald-600" />
        Draft saved
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-destructive">
      <AlertCircle className="size-3" />
      Draft save failed
    </span>
  );
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
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const prevSignatureIdentityIdRef = useRef<string | null>(null);
  const prevPlainTextModeRef = useRef(plainTextMode);
  const [ccBccVisible, setCcBccVisible] = useState({
    cc: !!composeCc,
    bcc: !!composeBcc,
  });
  const [toTouched, setToTouched] = useState(false);
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
  const toValid =
    recipientValidation.to.length > 0 && !recipientValidation.errors.recipients;
  const showToError =
    toTouched &&
    composeTo.trim().length > 0 &&
    Boolean(
      recipientValidation.errors.to ?? recipientValidation.errors.recipients,
    );
  const canSend =
    toValid &&
    composeSubject.trim().length > 0 &&
    !recipientValidation.errors.subject;

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

  async function requestSend(skipAttachmentCheck = false) {
    if (!skipAttachmentCheck) {
      const bodyText = plainTextMode
        ? composeBody
        : htmlToPlainText(composeHtmlBody);
      const matched = shouldWarnAboutMissingAttachment({
        enabled: composeSettings.attachmentReminderEnabled,
        attachmentCount: composeAttachments.length,
        subject: composeSubject,
        bodyText,
        keywords: composeSettings.attachmentReminderKeywords,
      });
      if (matched) {
        setAttachmentWarning({ open: true, keyword: matched });
        return;
      }
    }
    await onSend({ skipAttachmentCheck });
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

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {isDraggingOver && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-background/80">
          <div className="flex flex-col items-center gap-2 text-primary">
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
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={isMobile ? "h-7 px-2 text-xs text-muted-foreground" : "h-7 px-2.5 text-xs text-muted-foreground"}
          onClick={clearCompose}
        >
          Clear
        </Button>
        {onExpand && (
          <button
            type="button"
            onClick={onExpand}
            title="Open full editor"
            className="p-1 rounded hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
          >
            <Maximize2 className="size-3.5" />
          </button>
        )}
        <Button
          size="sm"
          className={isMobile ? "h-7 px-2.5 text-xs" : "h-7 text-xs"}
          onClick={() => void requestSend()}
          disabled={isBusy || !canSend}
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
        <span
          className={`shrink-0 text-xs font-medium text-muted-foreground/60 ${
            isMobile ? "w-10" : "w-14"
          }`}
        >
          From
        </span>
        {identities.length > 1 ? (
          <select
            value={selectedIdentityId ?? ""}
            onChange={(event) => setSelectedIdentityId(event.target.value || null)}
            disabled={isBusy}
            aria-label="From"
            className="flex-1 min-w-0 bg-transparent text-sm text-foreground border-0 outline-none focus:ring-0"
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

      <div
        className={`flex items-center border-b shrink-0 transition-colors ${
          isMobile ? "h-9 gap-2 px-3" : "h-10 gap-3 px-4"
        } ${showToError ? "border-destructive/60" : "border-border/50"}`}
      >
        <span
          className={`shrink-0 text-xs font-medium transition-colors ${
            isMobile ? "w-10" : "w-14"
          } ${showToError ? "text-destructive/70" : "text-muted-foreground/60"}`}
        >
          To
        </span>
        <RecipientSuggestInput
          value={composeTo}
          onChange={setComposeTo}
          onBlur={() => setToTouched(true)}
          placeholder="recipient@example.com"
          disabled={isBusy}
        />
        <div className="flex items-center gap-1 shrink-0">
          {!ccBccVisible.cc && (
            <button
              type="button"
              onClick={() =>
                setCcBccVisible((current) => ({ ...current, cc: true }))
              }
              className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors px-1"
            >
              CC
            </button>
          )}
          {!ccBccVisible.bcc && (
            <button
              type="button"
              onClick={() =>
                setCcBccVisible((current) => ({ ...current, bcc: true }))
              }
              className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors px-1"
            >
              BCC
            </button>
          )}
        </div>
      </div>

      {ccBccVisible.cc && (
        <div
          className={`flex items-center border-b border-border/50 shrink-0 ${
            isMobile ? "h-9 gap-2 px-3" : "h-10 gap-3 px-4"
          }`}
        >
          <span
            className={`shrink-0 text-xs font-medium text-muted-foreground/60 ${
              isMobile ? "w-10" : "w-14"
            }`}
          >
            CC
          </span>
          <RecipientSuggestInput
            value={composeCc}
            onChange={setComposeCc}
            placeholder="cc@example.com"
            disabled={isBusy}
          />
          <button
            type="button"
            onClick={() => {
              setCcBccVisible((current) => ({ ...current, cc: false }));
              setComposeCc("");
            }}
            aria-label="Hide CC"
            className="shrink-0 p-0.5 rounded hover:bg-muted/50 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          >
            <Minus className="size-3" />
          </button>
        </div>
      )}

      {ccBccVisible.bcc && (
        <div
          className={`flex items-center border-b border-border/50 shrink-0 ${
            isMobile ? "h-9 gap-2 px-3" : "h-10 gap-3 px-4"
          }`}
        >
          <span
            className={`shrink-0 text-xs font-medium text-muted-foreground/60 ${
              isMobile ? "w-10" : "w-14"
            }`}
          >
            BCC
          </span>
          <RecipientSuggestInput
            value={composeBcc}
            onChange={setComposeBcc}
            placeholder="bcc@example.com"
            disabled={isBusy}
          />
          <button
            type="button"
            onClick={() => {
              setCcBccVisible((current) => ({ ...current, bcc: false }));
              setComposeBcc("");
            }}
            aria-label="Hide BCC"
            className="shrink-0 p-0.5 rounded hover:bg-muted/50 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          >
            <Minus className="size-3" />
          </button>
        </div>
      )}

      <div
        className={`flex items-center border-b border-border/50 shrink-0 ${
          isMobile ? "h-9 gap-2 px-3" : "h-10 gap-3 px-4"
        }`}
      >
        <span
          className={`shrink-0 text-xs font-medium text-muted-foreground/60 ${
            isMobile ? "w-10" : "w-14"
          }`}
        >
          Subject
        </span>
        <input
          type="text"
          value={composeSubject}
          onChange={(e) => setComposeSubject(e.target.value)}
          placeholder="What's this about?"
          disabled={isBusy}
          aria-label="Subject"
          className="flex-1 h-8 bg-transparent border-0 ring-0 focus:ring-0 focus:outline-none text-sm placeholder:text-muted-foreground/40"
        />
      </div>

      <div
        className={`flex min-h-0 flex-1 flex-col overflow-hidden ${
          isMobile ? "px-1 pb-1.5 pt-1" : "px-2 pb-2 pt-2"
        }`}
        role="presentation"
        onKeyDown={(event) => {
          if (
            (event.metaKey || event.ctrlKey) &&
            event.key === "Enter" &&
            canSend &&
            !isBusy
          ) {
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
            className="min-h-0 flex-1 resize-none bg-transparent px-2 py-2 font-mono text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/40"
          />
        ) : (
          <RichTextEditor
            content={composeHtmlBody}
            onChange={setComposeHtmlBody}
            onImageUpload={onImageUpload}
            disabled={isBusy}
            className="min-h-0 flex-1"
            onEditorReady={(editor) => {
              editorRef.current = editor;
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
              className="break-words [&_a]:text-primary [&_a]:underline"
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
              className="flex items-center gap-1 bg-muted/60 rounded px-2 py-1 text-xs max-w-[200px]"
            >
              <Paperclip className="size-3 shrink-0 text-muted-foreground" />
              <span className="truncate text-foreground/80">{file.name}</span>
              <span className="text-muted-foreground/60 shrink-0">
                {formatFileSize(file.size)}
              </span>
              <button
                type="button"
                onClick={() => removeAttachment(file)}
                aria-label={`Remove ${file.name}`}
                className="shrink-0 ml-0.5 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        className={`flex items-center justify-between border-t border-border/50 shrink-0 ${
          isMobile ? "px-3 py-1.5" : "px-4 py-2"
        }`}
      >
        <div className="flex items-center gap-1">
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
            className="p-1.5 rounded hover:bg-muted/50 transition-colors text-muted-foreground/60 hover:text-muted-foreground disabled:opacity-40"
            aria-label="Attach files"
          >
            <Paperclip className="size-4" />
          </button>
          <button
            type="button"
            onClick={() =>
              updateSettings({ plainTextMode: !composeSettings.plainTextMode })
            }
            disabled={isBusy}
            title={
              composeSettings.plainTextMode
                ? "Rich text compose"
                : "Plain text compose"
            }
            className={cn(
              "inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors disabled:opacity-40",
              composeSettings.plainTextMode
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground/60 hover:bg-muted/50 hover:text-muted-foreground",
            )}
          >
            <AlignLeft className="size-3.5" />
            Plain text
          </button>
        </div>
        <span className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground/40">
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">
            ⌘↵
          </kbd>
          to send
        </span>
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
      onOpenChange={(nextOpen) => {
        if (!nextOpen) handleDismissRequest();
      }}
    >
      <DialogContent
        variant="spotlight"
        showClose={false}
        aria-describedby={undefined}
        className="overflow-hidden p-0 bg-popover border-border/50 shadow-2xl flex flex-col min-h-[360px] max-h-[min(720px,calc(90dvh-2rem))]"
        onPointerDownOutside={handleDismissRequest}
        onInteractOutside={handleDismissRequest}
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
