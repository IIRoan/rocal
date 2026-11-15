"use client";

import { useState } from "react";
import { BellOff } from "lucide-react";
import {
  describeMailUnsubscribe,
  getMailUnsubscribe,
  MAIL_UNSUBSCRIBE_LABELS,
  MAIL_UNSUBSCRIBED_KEYWORD,
  resolveMessageReplyFrom,
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
import { cn } from "@workspace/ui/lib/utils";
import type { MessageReaderController } from "../use-message-reader-controller";

export function MessageReaderUnsubscribeLine({
  controller,
}: {
  controller: MessageReaderController;
}) {
  const { isMobile, message, props } = controller;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const onUnsubscribe = props.onUnsubscribe;
  const identities = props.identities ?? [];
  const replyFrom = resolveMessageReplyFrom(identities, message);
  const first = getMailUnsubscribe(message, {
    allowOneClick: true,
    allowMailto: replyFrom !== null,
  })?.targets[0];
  if (!onUnsubscribe || !first) return null;
  const address =
    identities.find((identity) => identity.id === replyFrom?.identityId)?.email ?? "your address";
  const lineClass = cn(
    "-my-0.5 flex min-w-0 max-w-full items-center gap-1 self-start py-0.5 text-muted-foreground",
    isMobile ? "text-[11px]" : "text-xs",
  );

  if (message.keywords?.[MAIL_UNSUBSCRIBED_KEYWORD] === true) {
    return (
      <span className={lineClass}>
        <BellOff className="size-3 shrink-0" strokeWidth={2.25} aria-hidden />
        <span className="truncate">{MAIL_UNSUBSCRIBE_LABELS.done}</span>
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className={cn(lineClass, "cursor-pointer transition-colors hover:text-foreground")}
      >
        <BellOff className="size-3 shrink-0" strokeWidth={2.25} aria-hidden />
        <span className="truncate">{MAIL_UNSUBSCRIBE_LABELS.action}</span>
      </button>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent
          showClose={false}
          className="max-w-md overflow-hidden border-border/50 bg-popover p-0 shadow-2xl"
        >
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle>{MAIL_UNSUBSCRIBE_LABELS.title}</DialogTitle>
            <DialogDescription>{describeMailUnsubscribe(first, address)}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 border-t border-border/50 px-5 py-4">
            <Button size="sm" variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setConfirmOpen(false);
                onUnsubscribe(message);
              }}
            >
              {MAIL_UNSUBSCRIBE_LABELS.action}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
