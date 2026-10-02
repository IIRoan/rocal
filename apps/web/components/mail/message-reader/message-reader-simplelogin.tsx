"use client";

import { useState } from "react";
import { Check, ExternalLink, Shuffle } from "lucide-react";
import {
  getSimpleLoginForward,
  getSimpleLoginForwardNotice,
  resolveMessageReplyFrom,
  SIMPLELOGIN_DONE_KEYWORD,
  type SimpleLoginAction,
  type SimpleLoginActionMode,
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
import type { MessageReaderController } from "../use-message-reader-controller";

export function MessageReaderSimpleLoginBanner({
  controller,
}: {
  controller: MessageReaderController;
}) {
  const { message, props } = controller;
  const forward = getSimpleLoginForward(message);
  if (!forward) return null;
  const notice = getSimpleLoginForwardNotice(forward, message.from);
  const onSimpleLoginAction = props.onSimpleLoginAction;
  // A mailto command only works from the mailbox SimpleLogin forwards to.
  const action =
    forward.action &&
    onSimpleLoginAction &&
    (forward.action.target.type !== "mailto" ||
      resolveMessageReplyFrom(props.identities ?? [], message))
      ? forward.action
      : null;

  return (
    <div className="@container shrink-0 rounded-lg border border-border/50 bg-card">
      <div className="flex flex-col gap-2.5 px-3 py-2.5 @lg:flex-row @lg:items-center @lg:gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <Shuffle
            className="mt-px size-3.5 shrink-0 text-muted-foreground"
            strokeWidth={2.25}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] leading-4 text-muted-foreground">{notice.label}</p>
            {notice.alias ? (
              <p className="truncate text-[13px] font-medium leading-5 text-foreground">
                {notice.alias}
              </p>
            ) : null}
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{notice.detail}</p>
          </div>
        </div>
        {action && onSimpleLoginAction ? (
          <SimpleLoginActionControl
            action={action}
            done={message.keywords?.[SIMPLELOGIN_DONE_KEYWORD] === true}
            onConfirm={(mode) => onSimpleLoginAction(message, mode)}
          />
        ) : null}
      </div>
    </div>
  );
}

function SimpleLoginActionControl({
  action,
  done,
  onConfirm,
}: {
  action: SimpleLoginAction;
  done: boolean;
  onConfirm: (mode: SimpleLoginActionMode) => void;
}) {
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    mode: SimpleLoginActionMode;
  }>({ open: false, mode: "run" });
  const openConfirm = (mode: SimpleLoginActionMode) => setConfirmState({ open: true, mode });
  const closeConfirm = () => setConfirmState((current) => ({ ...current, open: false }));
  const undo = action.undo;
  const confirm =
    confirmState.mode === "undo" && undo
      ? {
          title: undo.confirmTitle,
          message: undo.confirmMessage,
          label: undo.confirmLabel,
          destructive: false,
        }
      : {
          title: action.confirmTitle,
          message: action.confirmMessage,
          label: action.label,
          destructive: action.kind !== "unsubscribe",
        };

  return (
    <>
      <div className="flex min-h-7 items-center gap-2 border-t border-border/50 pt-2.5 @lg:shrink-0 @lg:border-t-0 @lg:pt-0">
        {done ? (
          <>
            <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <Check className="size-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
              {action.doneLabel}
            </span>
            {undo ? (
              <Button
                size="xs"
                variant="outline"
                className="ml-auto shrink-0"
                onClick={() => openConfirm("undo")}
              >
                {undo.label}
                <ExternalLink className="size-3" strokeWidth={2.25} aria-hidden />
              </Button>
            ) : null}
          </>
        ) : (
          <Button
            size="xs"
            variant="outline"
            className="ml-auto shrink-0"
            onClick={() => openConfirm("run")}
          >
            {action.label}
          </Button>
        )}
      </div>
      <Dialog
        open={confirmState.open}
        onOpenChange={(open) => {
          if (!open) closeConfirm();
        }}
      >
        <DialogContent
          showClose={false}
          className="max-w-md overflow-hidden border-border/50 bg-popover p-0 shadow-2xl"
        >
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle>{confirm.title}</DialogTitle>
            <DialogDescription>{confirm.message}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 border-t border-border/50 px-5 py-4">
            <Button size="sm" variant="outline" onClick={closeConfirm}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant={confirm.destructive ? "destructive" : "default"}
              onClick={() => {
                closeConfirm();
                onConfirm(confirmState.mode);
              }}
            >
              {confirm.label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
