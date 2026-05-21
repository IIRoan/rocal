"use client";

import { Send, ArrowLeft, Paperclip, X, Minus, Maximize2 } from "lucide-react";
import { useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
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

export interface ComposeDialogProps {
  open: boolean;
  fromEmail: string;
  onClose: () => void;
  onSend: () => Promise<void>;
  onExpand?: () => void;
  composeTo: string;
  composeCc: string;
  composeBcc: string;
  composeSubject: string;
  composeBody: string;
  composeAttachments: File[];
  setComposeTo: (v: string) => void;
  setComposeCc: (v: string) => void;
  setComposeBcc: (v: string) => void;
  setComposeSubject: (v: string) => void;
  setComposeBody: (v: string) => void;
  setComposeAttachments: Dispatch<SetStateAction<File[]>>;
  isBusy: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ComposeForm({
  fromEmail,
  onClose,
  onSend,
  onExpand,
  composeTo,
  composeCc,
  composeBcc,
  composeSubject,
  composeBody,
  composeAttachments,
  setComposeTo,
  setComposeCc,
  setComposeBcc,
  setComposeSubject,
  setComposeBody,
  setComposeAttachments,
  isBusy,
  onKeyDown,
}: Omit<ComposeDialogProps, "open"> & {
  onKeyDown?: (e: React.KeyboardEvent) => void;
}) {
  const [showCc, setShowCc] = useState(!!composeCc);
  const [showBcc, setShowBcc] = useState(!!composeBcc);
  const [toTouched, setToTouched] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();

  const isValidEmail = (email: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const toEmails = composeTo
    .split(/[,;]/)
    .flatMap((e) => (e.trim() ? [e.trim()] : []));
  const toValid = toEmails.length > 0 && toEmails.every(isValidEmail);
  const showToError = toTouched && composeTo.trim().length > 0 && !toValid;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) {
      setComposeAttachments((prev) => [...prev, ...files]);
    }
    e.target.value = "";
  };

  const removeAttachment = (file: File) => {
    setComposeAttachments((prev) =>
      prev.filter((attachment) => attachment !== file),
    );
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
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
        <span className="text-sm font-medium flex-1">New mail</span>
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
          disabled={isBusy || !toValid || !composeSubject.trim()}
        >
          <Send size={12} />
          {isBusy ? "Sending…" : "Send"}
        </Button>
      </div>

      {/* From (read-only) */}
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
        <span className="flex-1 text-sm text-muted-foreground truncate">
          {fromEmail}
        </span>
      </div>

      {/* To */}
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
        <input
          type="text"
          value={composeTo}
          onChange={(e) => setComposeTo(e.target.value)}
          onBlur={() => setToTouched(true)}
          placeholder="recipient@example.com"
          disabled={isBusy}
          autoComplete="off"
          className="flex-1 h-8 bg-transparent border-0 ring-0 focus:ring-0 focus:outline-none text-sm placeholder:text-muted-foreground/40"
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

      {/* CC (conditional) */}
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
          <input
            type="text"
            value={composeCc}
            onChange={(e) => setComposeCc(e.target.value)}
            placeholder="cc@example.com"
            disabled={isBusy}
            autoComplete="off"
            className="flex-1 h-8 bg-transparent border-0 ring-0 focus:ring-0 focus:outline-none text-sm placeholder:text-muted-foreground/40"
          />
          <button
            type="button"
            onClick={() => { setShowCc(false); setComposeCc(""); }}
            className="shrink-0 p-0.5 rounded hover:bg-muted/50 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          >
            <Minus className="size-3" />
          </button>
        </div>
      )}

      {/* BCC (conditional) */}
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
          <input
            type="text"
            value={composeBcc}
            onChange={(e) => setComposeBcc(e.target.value)}
            placeholder="bcc@example.com"
            disabled={isBusy}
            autoComplete="off"
            className="flex-1 h-8 bg-transparent border-0 ring-0 focus:ring-0 focus:outline-none text-sm placeholder:text-muted-foreground/40"
          />
          <button
            type="button"
            onClick={() => { setShowBcc(false); setComposeBcc(""); }}
            className="shrink-0 p-0.5 rounded hover:bg-muted/50 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          >
            <Minus className="size-3" />
          </button>
        </div>
      )}

      {/* Subject */}
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

      {/* Body */}
      <div
        className={`flex-1 overflow-y-auto ${
          isMobile ? "px-3 pb-1.5 pt-2" : "px-4 pb-2 pt-3"
        }`}
        role="presentation"
        onKeyDown={onKeyDown}
      >
        <textarea
          value={composeBody}
          onChange={(e) => setComposeBody(e.target.value)}
          placeholder="Write your message…"
          disabled={isBusy}
          className={`size-full bg-transparent border-0 text-sm resize-none placeholder:text-muted-foreground/40 focus:outline-none focus:ring-0 ring-0 ${
            isMobile ? "min-h-24 leading-normal" : "min-h-32 leading-relaxed"
          }`}
        />
      </div>

      {/* Attachment chips */}
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

      {/* Footer toolbar */}
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
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">⌘↵</kbd>
          to send
        </span>
      </div>
    </div>
  );
}

export function ComposeDialog({
  open,
  fromEmail,
  onClose,
  onSend,
  onExpand,
  composeTo,
  composeCc,
  composeBcc,
  composeSubject,
  composeBody,
  composeAttachments,
  setComposeTo,
  setComposeCc,
  setComposeBcc,
  setComposeSubject,
  setComposeBody,
  setComposeAttachments,
  isBusy,
}: ComposeDialogProps) {
  const isMobile = useIsMobile();

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      if (!isBusy && composeTo.trim() && composeSubject.trim()) {
        e.preventDefault();
        void onSend();
      }
    }
  };

  const formProps = {
    fromEmail,
    onClose,
    onSend,
    onExpand,
    composeTo,
    composeCc,
    composeBcc,
    composeSubject,
    composeBody,
    composeAttachments,
    setComposeTo,
    setComposeCc,
    setComposeBcc,
    setComposeSubject,
    setComposeBody,
    setComposeAttachments,
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
        className="overflow-hidden p-0 bg-popover border-border/50 shadow-2xl flex flex-col min-h-[360px] max-h-[min(620px,calc(83dvh-2rem))]"
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
