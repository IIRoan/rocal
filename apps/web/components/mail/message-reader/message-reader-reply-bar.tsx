"use client";

import {
  Paperclip,
  Reply,
  Send,
  Smile,
  X,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/ui/popover";
import { Button } from "@workspace/ui/components/ui/button";
import type {
  MessageReaderController,
  MessageReaderViewModel,
} from "../use-message-reader-controller";
import { COMMON_EMOJI } from "./constants";

export function MessageReaderReplyBar({
  controller,
  view,
}: {
  controller: MessageReaderController;
  view: MessageReaderViewModel;
}) {
  const {
    fileInputRef,
    textareaRef,
    expandedWrapRef,
    dispatchMessageUi,
    isReplyExpanded,
    replyText,
    attachedFiles,
    emojiPickerOpen,
    isSendingReply,
    handleFileSelect,
    handleSendReply,
    autoResizeTextarea,
    isBusy,
    props,
  } = controller;
  const { onSendReply } = props;
  const { senderEmail, senderName } = view;

  return (
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
          onClick={() =>
            dispatchMessageUi({ type: "patch", patch: { isReplyExpanded: true } })
          }
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
              dispatchMessageUi({
                type: "patch",
                patch: { isReplyExpanded: false },
              });
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
              dispatchMessageUi({
                type: "patch",
                patch: { replyText: e.target.value },
              });
              autoResizeTextarea();
            }}
            onFocus={() =>
              dispatchMessageUi({ type: "patch", patch: { isReplyExpanded: true } })
            }
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
                      dispatchMessageUi({
                        type: "patch",
                        patch: {
                          attachedFiles: attachedFiles.filter(
                            (attachment) => attachment !== file,
                          ),
                        },
                      })
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
            <Popover
              open={emojiPickerOpen}
              onOpenChange={(open) =>
                dispatchMessageUi({ type: "patch", patch: { emojiPickerOpen: open } })
              }
            >
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
                onInteractOutside={() =>
                  dispatchMessageUi({
                    type: "patch",
                    patch: { emojiPickerOpen: false },
                  })
                }
              >
                <div className="grid grid-cols-10 gap-0.5">
                  {COMMON_EMOJI.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className="flex items-center justify-center rounded p-0.5 text-base hover:bg-accent transition-colors"
                      onClick={() => {
                        dispatchMessageUi({ type: "appendReplyText", value: emoji });
                        dispatchMessageUi({
                          type: "patch",
                          patch: { emojiPickerOpen: false },
                        });
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
}
