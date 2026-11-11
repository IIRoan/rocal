"use client";

import { Forward, Reply, ReplyAll } from "lucide-react";
import { Button } from "@workspace/ui/components/ui/button";
import type { MessageReaderProps } from "../message-reader-types";

export function MessageReaderReplyActions({
  onReply,
  onReplyAll,
  onForward,
  disabled,
  onClose,
}: Pick<MessageReaderProps, "onReply" | "onReplyAll" | "onForward"> & {
  disabled: boolean;
  onClose: () => void;
}) {
  return (
    <>
      <Button
        variant="ghost"
        disabled={disabled}
        className="h-11 w-full justify-start gap-3 px-3 text-foreground/80"
        onClick={() => {
          onReply();
          onClose();
        }}
      >
        <Reply className="size-4 text-muted-foreground" strokeWidth={2.25} />
        Reply
      </Button>
      {onReplyAll ? (
        <Button
          variant="ghost"
          disabled={disabled}
          className="h-11 w-full justify-start gap-3 px-3 text-foreground/80"
          onClick={() => {
            onReplyAll();
            onClose();
          }}
        >
          <ReplyAll
            className="size-4 text-muted-foreground"
            strokeWidth={2.25}
          />
          Reply all
        </Button>
      ) : null}
      <Button
        variant="ghost"
        disabled={disabled}
        className="h-11 w-full justify-start gap-3 px-3 text-foreground/80"
        onClick={() => {
          onForward();
          onClose();
        }}
      >
        <Forward className="size-4 text-muted-foreground" strokeWidth={2.25} />
        Forward
      </Button>
    </>
  );
}
