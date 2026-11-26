"use client";

import { useEffectEvent, useLayoutEffect, useRef } from "react";
import { Copy } from "lucide-react";
import { toast } from "@workspace/ui/lib/toast";
import { Button } from "@workspace/ui/components/ui/button";
import { usePrefersReducedMotion } from "@workspace/ui/hooks";
import { MOTION_EASING, slideFadeIn } from "@workspace/ui/lib/motion";
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
import { MessageReaderThreadStack } from "./message-reader-thread-stack";
import { MessageReaderCalendarCards } from "./message-reader-calendar-cards";
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
  const contentRef = useRef<HTMLDivElement>(null);
  const shownAtRef = useRef<number | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const threadAt = Date.parse(orderedConversationMessages.at(-1)?.receivedAt ?? message?.receivedAt ?? "") || 0;

  const handleCopySource = async () => {
    try {
      await navigator.clipboard.writeText(displayHtml);
      toast.success("Copied");
    } catch {
      toast.error("Unable to copy. Select the source and copy it manually.");
    }
  };

  // A newer conversation drops in from above and an older one rises from below, like moving through a stack of mail; the toolbar stays put.
  const slideInConversation = useEffectEvent((content: HTMLElement) => {
    const previousAt = shownAtRef.current;
    shownAtRef.current = threadAt;
    const fromAbove = previousAt !== null && threadAt > previousAt;
    return slideFadeIn(content, { y: fromAbove ? -14 : 14 }, { duration: 280, easing: MOTION_EASING.reveal });
  });
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content || prefersReducedMotion) return;
    const enter = slideInConversation(content);
    return () => enter?.cancel();
  }, [conversationThreadKey, prefersReducedMotion]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--bg-l2-solid)]">
      <MessageReaderToolbar controller={controller} view={view} />
      <div ref={contentRef} data-mail-reader-content="" className="flex min-h-0 flex-1 flex-col">
      <MessageReaderTitle controller={controller} view={view} />
      <MessageReaderThreadStack
        key={conversationThreadKey}
        controller={controller}
        view={view}
      >
        <article className="flex flex-1 flex-col gap-4 p-4">
          <MessageReaderHeader controller={controller} view={view} />
          <MessageReaderCalendarCards controller={controller} view={view} />
          <div className="flex min-h-0 flex-1 flex-col">
            <MessageReaderBody controller={controller} view={view} />
          </div>
          <MessageReaderReplyBar controller={controller} view={view} />
        </article>
      </MessageReaderThreadStack>
      </div>
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
          <div className="flex-1 min-h-0 overflow-auto overscroll-contain px-6 py-4">
            <pre className="text-xs font-mono text-foreground/80 whitespace-pre-wrap break-all select-all">
              {displayHtml}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
