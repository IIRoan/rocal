"use client";

import { useState } from "react";
import { Check, Shuffle } from "lucide-react";
import {
  getSimpleLoginForward,
  resolveMessageReplyFrom,
  SIMPLELOGIN_DONE_KEYWORD,
} from "@workspace/calendar-core";
import { Button } from "@workspace/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/ui/dialog";
import { SimpleTooltip } from "@workspace/ui/components/ui/tooltip";
import type { MessageReaderController } from "../use-message-reader-controller";

export function SimpleLoginAliasBadge({ alias }: { alias: string | null }) {
  return (
    <SimpleTooltip content="Forwarded by SimpleLogin. The sender only sees your alias.">
      <span className="inline-flex min-w-0 items-center gap-1 rounded-md border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
        <Shuffle className="size-3 shrink-0" strokeWidth={2.25} />
        <span className="truncate">
          via SimpleLogin{alias ? ` · ${alias}` : ""}
        </span>
      </span>
    </SimpleTooltip>
  );
}

export function MessageReaderSimpleLoginBanner({
  controller,
}: {
  controller: MessageReaderController;
}) {
  const { message, props } = controller;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const action = getSimpleLoginForward(message)?.action;
  if (!action || !props.onSimpleLoginAction) return null;
  // A mailto command only works from the mailbox SimpleLogin forwards to.
  if (
    action.target.type === "mailto" &&
    !resolveMessageReplyFrom(props.identities ?? [], message)
  ) {
    return null;
  }
  const done = message.keywords?.[SIMPLELOGIN_DONE_KEYWORD] === true;
  const onSimpleLoginAction = props.onSimpleLoginAction;

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-secondary)] bg-[var(--bg-overlay-tertiary)] px-3 py-2 text-xs text-muted-foreground">
      <span>This message is from a SimpleLogin alias.</span>
      {done ? (
        <span className="inline-flex items-center gap-1.5 text-foreground/80">
          <Check className="size-3.5" strokeWidth={2.25} />
          {action.doneLabel}
        </span>
      ) : (
        <Button size="xs" variant="outline" onClick={() => setConfirmOpen(true)}>
          {action.label}
        </Button>
      )}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent
          showClose={false}
          className="max-w-md overflow-hidden border-border/50 bg-popover p-0 shadow-2xl"
        >
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle>{action.confirmTitle}</DialogTitle>
            <DialogDescription>{action.confirmMessage}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 border-t border-border/50 px-5 py-4">
            <Button size="sm" variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setConfirmOpen(false);
                onSimpleLoginAction(message);
              }}
            >
              {action.label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
