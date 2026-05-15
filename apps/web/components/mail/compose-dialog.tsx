"use client";

import { Send, ArrowLeft } from "lucide-react";
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
  composeTo: string;
  composeSubject: string;
  composeBody: string;
  setComposeTo: (v: string) => void;
  setComposeSubject: (v: string) => void;
  setComposeBody: (v: string) => void;
  isBusy: boolean;
}

function ComposeForm({
  fromEmail,
  onClose,
  onSend,
  composeTo,
  composeSubject,
  composeBody,
  setComposeTo,
  setComposeSubject,
  setComposeBody,
  isBusy,
  onKeyDown,
}: Omit<ComposeDialogProps, "open"> & { onKeyDown?: (e: React.KeyboardEvent) => void }) {
  return (
    <div className="flex flex-col" style={{ minHeight: "clamp(400px, 60svh, 580px)", maxHeight: "calc(100dvh - 160px)" }}>
      <div className="flex items-center gap-2 px-3 h-12 border-b border-border/50 shrink-0">
        <button type="button" onClick={onClose} className="p-1 rounded hover:bg-muted/50 transition-colors">
          <ArrowLeft className="h-4 w-4 text-muted-foreground" />
        </button>
        <span className="text-sm font-medium flex-1">New message</span>
        <Button
          size="sm" className="h-7 text-xs"
          onClick={() => void onSend()}
          disabled={isBusy || !composeTo.trim() || !composeSubject.trim()}
        >
          <Send size={12} />
          {isBusy ? "Sending…" : "Send"}
        </Button>
      </div>

      <div className="flex items-center gap-3 px-4 h-11 border-b border-border/50 shrink-0">
        <span className="text-xs font-medium text-muted-foreground/60 w-14 shrink-0">From</span>
        <span className="flex-1 text-sm text-muted-foreground truncate">{fromEmail}</span>
      </div>

      <div className="flex items-center gap-3 px-4 h-11 border-b border-border/50 shrink-0">
        <span className="text-xs font-medium text-muted-foreground/60 w-14 shrink-0">To</span>
        <input
          type="email"
          value={composeTo}
          onChange={(e) => setComposeTo(e.target.value)}
          placeholder="recipient@example.com"
          disabled={isBusy}
          autoFocus
          autoComplete="off"
          className="flex-1 h-8 bg-transparent border-0 ring-0 focus:ring-0 focus:outline-none text-sm placeholder:text-muted-foreground/40"
        />
      </div>

      <div className="flex items-center gap-3 px-4 h-11 border-b border-border/50 shrink-0">
        <span className="text-xs font-medium text-muted-foreground/60 w-14 shrink-0">Subject</span>
        <input
          type="text"
          value={composeSubject}
          onChange={(e) => setComposeSubject(e.target.value)}
          placeholder="What's this about?"
          disabled={isBusy}
          className="flex-1 h-8 bg-transparent border-0 ring-0 focus:ring-0 focus:outline-none text-sm placeholder:text-muted-foreground/40"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-2">
        <textarea
          value={composeBody}
          onChange={(e) => setComposeBody(e.target.value)}
          placeholder="Write your message…"
          disabled={isBusy}
          className="w-full h-full min-h-32 bg-transparent border-0 ring-0 focus:ring-0 focus:outline-none text-sm resize-none placeholder:text-muted-foreground/40 leading-relaxed"
        />
      </div>

      <div className="px-4 py-2 border-t border-border/50 text-xs text-muted-foreground flex items-center justify-between shrink-0">
        <span className="text-muted-foreground/40">Sent as plaintext</span>
        <span className="hidden sm:flex items-center gap-2">
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">⌘↵</kbd> to send
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
  composeTo,
  composeSubject,
  composeBody,
  setComposeTo,
  setComposeSubject,
  setComposeBody,
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
    composeTo,
    composeSubject,
    composeBody,
    setComposeTo,
    setComposeSubject,
    setComposeBody,
    isBusy,
  };

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
        <DrawerContent className="max-h-[95svh]">
          <VisuallyHidden>
            <DrawerHeader>
              <DrawerTitle>New message</DrawerTitle>
            </DrawerHeader>
          </VisuallyHidden>
          <div onKeyDown={handleKeyDown}>
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
        className="overflow-hidden p-0 bg-popover border-border/50 shadow-2xl flex flex-col"
        onKeyDown={handleKeyDown}
      >
        <VisuallyHidden><DialogTitle>New message</DialogTitle></VisuallyHidden>
        <ComposeForm {...formProps} />
      </DialogContent>
    </Dialog>
  );
}
