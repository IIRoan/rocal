"use client";

import { Paperclip, Reply, Smile, X } from "lucide-react";
import { Button } from "@workspace/ui/components/ui/button";
import {
  Button as SolaceButton,
  DropdownPanel,
  FilledVariant,
  Icon,
  IconText,
  Size,
  TypographyWeight,
} from "@workspace/ui/solace";
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
    canReply,
    props,
  } = controller;
  const { onSendReply, onForward } = props;
  const { senderEmail, senderName } = view;

  return (
    <div className="shrink-0">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
        tabIndex={-1}
        aria-hidden="true"
      />

      {isReplyExpanded ? (
        <div
          ref={expandedWrapRef}
          className="flex flex-col rounded-xl border border-[var(--border-secondary)] px-3 pt-2.5 pb-2 focus-within:border-[var(--border-primary)]"
          onBlur={(e) => {
            // Emoji picker is portalled outside this container.
            if (emojiPickerOpen) return;
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
          <div className="flex items-center gap-1.5 pb-1">
            <Reply className="size-3.5 shrink-0 text-[var(--icon-secondary)]" />
            <span className="text-xs text-[var(--text-secondary)]">
              Reply to{" "}
              <span className="font-medium text-[var(--text-primary)]">
                {senderName || senderEmail}
              </span>
            </span>
          </div>
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
            className="w-full resize-none appearance-none border-0 bg-transparent py-1 text-sm text-[var(--text-primary)] outline-none ring-0 placeholder:text-[var(--text-disabled)] focus:border-0 focus:outline-none focus:ring-0"
            aria-label={`Reply to ${senderName || senderEmail}`}
            disabled={isBusy || isSendingReply}
          />
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pb-1.5">
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
          <div className="-ml-1.5 flex items-center gap-0.5 pt-1">
            <DropdownPanel
              open={emojiPickerOpen}
              onOpenChange={(open) =>
                dispatchMessageUi({ type: "patch", patch: { emojiPickerOpen: open } })
              }
              side="top"
              align="start"
              width={272}
              className="p-1.5"
              trigger={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  type="button"
                  aria-label="Add emoji"
                  disabled={isBusy || isSendingReply}
                >
                  <Smile />
                </Button>
              }
            >
                <div className="grid grid-cols-10 gap-0.5">
                  {COMMON_EMOJI.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className="flex items-center justify-center cursor-pointer rounded-md p-0.5 text-base hover:bg-[var(--bg-cell-hover)] transition-colors"
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
            </DropdownPanel>
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
            <SolaceButton
              aria-label="Send reply"
              className="ml-auto"
              disabled={
                !canReply ||
                isSendingReply ||
                (Boolean(onSendReply) && !replyText.trim())
              }
              icon={Icon.Send}
              onClick={() => void handleSendReply()}
              size={Size.SMALL}
            >
              Send
            </SolaceButton>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <IconText
            dataTest="message-reply"
            label="Reply"
            onClick={() =>
              dispatchMessageUi({ type: "patch", patch: { isReplyExpanded: true } })
            }
            size={Size.SMALL}
            startIcon={Icon.Reply}
            variant={FilledVariant.FILLED}
            weight={TypographyWeight.REGULAR}
          />
          <IconText
            disabled={!canReply}
            label="Forward"
            onClick={onForward}
            size={Size.SMALL}
            startIcon={Icon.Forward}
            variant={FilledVariant.FILLED}
            weight={TypographyWeight.REGULAR}
          />
        </div>
      )}
    </div>
  );
}
