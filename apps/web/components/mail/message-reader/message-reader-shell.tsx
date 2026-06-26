"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import type { MessageReaderController, MessageReaderViewModel } from "../use-message-reader-controller";
import { MessageReaderToolbar } from "./message-reader-toolbar";
import { MessageReaderHeader } from "./message-reader-header";
import { MessageReaderConversationStrip } from "./message-reader-conversation-strip";
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
  const { displayHtml } = view;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <MessageReaderToolbar controller={controller} view={view} />
      <div className="shrink min-h-0 overflow-y-auto">
        <MessageReaderHeader controller={controller} view={view} />
        <MessageReaderConversationStrip controller={controller} view={view} />
        <MessageReaderCalendarCards controller={controller} view={view} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <MessageReaderBody controller={controller} view={view} />
      </div>
      <MessageReaderReplyBar controller={controller} view={view} />
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
