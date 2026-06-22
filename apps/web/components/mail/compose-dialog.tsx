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
} from "lucide-react";
import { useRef, useState } from "react";
import {
  useMailCompose,
  useMailComposeChrome,
} from "./mail-compose-context";
import {
  Dialog,
  DialogContent,
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
import { RichTextEditor } from "./rich-text-editor";
import { RecipientSuggestInput } from "./recipient-suggest-input";
import {
  appendHtmlSignature,
  appendPlainTextSignature,
} from "@/lib/mail/signature-utils";
import { toast } from "sonner";

export interface ComposeDialogProps {
  identities: JmapIdentity[];
  fallbackFromEmail: string;
  onClose: () => void;
  onSend: () => Promise<void>;
  onExpand?: () => void;
  isBusy: boolean;
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
  onKeyDown,
}: ComposeDialogProps & {
  onKeyDown?: (e: React.KeyboardEvent) => void;
}) {
  const {
    composeTo,
    setComposeTo,
    composeCc,
    setComposeCc,
    composeBcc,
    setComposeBcc,
    composeSubject,
    setComposeSubject,
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
  } = useMailCompose();
  const [showCc, setShowCc] = useState(!!composeCc);
  const [showBcc, setShowBcc] = useState(!!composeBcc);
  const [toTouched, setToTouched] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

  const selectedIdentity =
    identities.find((identity) => identity.id === selectedIdentityId) ??
    identities[0] ??
    null;
  const fromLabel = selectedIdentity
    ? selectedIdentity.name
      ? `${selectedIdentity.name} <${selectedIdentity.email}>`
      : selectedIdentity.email
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

  const applySignaturePreview = () => {
    if (!selectedIdentity) return;
    const withHtml = appendHtmlSignature(composeHtmlBody, selectedIdentity);
    if (withHtml !== composeHtmlBody) {
      setComposeHtmlBody(withHtml);
      return;
    }
    const plain = appendPlainTextSignature("", selectedIdentity);
    if (plain) {
      setComposeHtmlBody(`<p>${plain.replace(/\n/g, "<br>")}</p>`);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div
        className={`flex items-center border-b border-border/50 shrink-0 ${
          isMobile ? "h-11 gap-1.5 px-2.5" : "h-12 gap-2 px-3"
        }`}
      >
        <button
          type="button"
          onClick={onClose}
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
          onClick={() => void onSend()}
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
        {selectedIdentity &&
          (selectedIdentity.textSignature || selectedIdentity.htmlSignature) && (
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
          {!showCc && (
            <button
              type="button"
              onClick={() => setShowCc(true)}
              className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors px-1"
            >
              CC
            </button>
          )}
          {!showBcc && (
            <button
              type="button"
              onClick={() => setShowBcc(true)}
              className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors px-1"
            >
              BCC
            </button>
          )}
        </div>
      </div>

      {showCc && (
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
              setShowCc(false);
              setComposeCc("");
            }}
            className="shrink-0 p-0.5 rounded hover:bg-muted/50 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          >
            <Minus className="size-3" />
          </button>
        </div>
      )}

      {showBcc && (
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
              setShowBcc(false);
              setComposeBcc("");
            }}
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
          className="flex-1 h-8 bg-transparent border-0 ring-0 focus:ring-0 focus:outline-none text-sm placeholder:text-muted-foreground/40"
        />
      </div>

      <div
        className={`flex min-h-0 flex-1 flex-col overflow-hidden ${
          isMobile ? "px-1 pb-1.5 pt-1" : "px-2 pb-2 pt-2"
        }`}
        role="presentation"
        onKeyDown={onKeyDown}
      >
        <RichTextEditor
          content={composeHtmlBody}
          onChange={setComposeHtmlBody}
          disabled={isBusy}
          className="min-h-0 flex-1"
        />
      </div>

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
        </div>
        <span className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground/40">
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">
            ⌘↵
          </kbd>
          to send
        </span>
      </div>
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
}: ComposeDialogProps) {
  const { isComposeOpen } = useMailComposeChrome();
  const { composeTo, composeCc, composeBcc, composeSubject } = useMailCompose();
  const isMobile = useIsMobile();
  const open = isComposeOpen;
  const canSendFromShortcut = validateComposeRecipients({
    to: composeTo,
    cc: composeCc,
    bcc: composeBcc,
    subject: composeSubject,
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      if (
        !isBusy &&
        !canSendFromShortcut.errors.to &&
        !canSendFromShortcut.errors.recipients &&
        !canSendFromShortcut.errors.subject
      ) {
        e.preventDefault();
        void onSend();
      }
    }
  };

  const formProps = {
    identities,
    fallbackFromEmail,
    onClose,
    onSend,
    onExpand,
    isBusy,
  };

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
        <DrawerContent className="max-h-[100svh] rounded-t-[1.25rem]">
          <VisuallyHidden>
            <DrawerHeader>
              <DrawerTitle>New mail</DrawerTitle>
            </DrawerHeader>
          </VisuallyHidden>
          <div role="presentation" onKeyDown={handleKeyDown}>
            <ComposeForm {...formProps} />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        variant="spotlight"
        showClose={false}
        aria-describedby={undefined}
        className="overflow-hidden p-0 bg-popover border-border/50 shadow-2xl flex flex-col min-h-[360px] max-h-[min(720px,calc(90dvh-2rem))]"
        onKeyDown={handleKeyDown}
      >
        <VisuallyHidden>
          <DialogTitle>New mail</DialogTitle>
        </VisuallyHidden>
        <ComposeForm {...formProps} />
      </DialogContent>
    </Dialog>
  );
}
