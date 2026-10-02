"use client";

import { useLayoutEffect, useRef } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@workspace/ui/components/ui/button";
import { usePrefersReducedMotion } from "@workspace/ui/hooks";
import { fadeInMailReaderContent } from "../mail-app/mail-reader-transition";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import type { MessageReaderController, MessageReaderViewModel } from "../use-message-reader-controller";
import { MessageReaderToolbar } from "./message-reader-toolbar";
import { MessageReaderTitle } from "./message-reader-title";
import { MessageReaderHeader } from "./message-reader-header";
import { MessageReaderConversationStrip } from "./message-reader-conversation-strip";
import { MessageReaderCalendarCards } from "./message-reader-calendar-cards";
import { MessageReaderSimpleLoginBanner } from "./message-reader-simplelogin";
import { MessageReaderBody } from "./message-reader-body";
import { MessageReaderReplyBar } from "./message-reader-reply-bar";

export function MessageReaderShell({
  controller,
  view,
}: {
  controller: MessageReaderController;
  view: MessageReaderViewModel;
}) {
  const { showRawHtmlDialog, dispatchChrome } = controller;
  const { displayHtml, orderedConversationMessages, message } = view;
  const conversationThreadKey =
    orderedConversationMessages[0]?.threadId ??
    orderedConversationMessages[0]?.id ??
    message?.id ??
    "";
  const rootRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  const handleCopySource = async () => {
    try {
      await navigator.clipboard.writeText(displayHtml);
      toast.success("Copied");
    } catch {
      toast.error("Failed to copy");
    }
  };

  // Toolbar stays put; only the message content fades (WAAPI, so it stays on the compositor), making a switch read as new content in a fixed frame.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const fades = Array.from(
      root.querySelectorAll<HTMLElement>(":scope > :not(:first-child)"),
    ).flatMap((element) => fadeInMailReaderContent(element, prefersReducedMotion) ?? []);
    return () => fades.forEach((fade) => fade.cancel());
  }, [message?.id, prefersReducedMotion]);

  return (
    <div
      ref={rootRef}
      className="flex h-full flex-col overflow-hidden bg-[var(--bg-l2-solid)]"
    >
      <MessageReaderToolbar controller={controller} view={view} />
      <MessageReaderTitle controller={controller} view={view} />
      <MessageReaderConversationStrip
        key={conversationThreadKey}
        controller={controller}
        view={view}
      />
      <article className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <MessageReaderHeader controller={controller} view={view} />
        <MessageReaderSimpleLoginBanner controller={controller} />
        <MessageReaderCalendarCards controller={controller} view={view} />
        <div className="flex min-h-0 flex-1 flex-col">
          <MessageReaderBody controller={controller} view={view} />
        </div>
        <MessageReaderReplyBar controller={controller} view={view} />
      </article>
      <Dialog
        open={showRawHtmlDialog}
        onOpenChange={(open) =>
          dispatchChrome({ type: "patch", patch: { showRawHtmlDialog: open } })
        }
      >
        <DialogContent
          className="flex flex-col w-[90vw] max-w-4xl max-h-[80vh]"
          variant="center"
        >
          <DialogHeader className="shrink-0 flex-row items-center justify-between gap-3 px-6 pt-6 pb-4 pr-12 border-b border-border/60">
            <DialogTitle className="text-base">HTML source</DialogTitle>
            <Button variant="outline" size="sm" onClick={handleCopySource} disabled={!displayHtml}>
              <Copy />
              Copy source
            </Button>
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
