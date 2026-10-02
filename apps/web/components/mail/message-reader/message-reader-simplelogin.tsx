"use client";

import { useState, type ReactNode } from "react";
import {
  Ban,
  BellOff,
  ChevronRight,
  Copy,
  ExternalLink,
  RotateCcw,
  Shuffle,
  UserX,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  getSimpleLoginForward,
  getSimpleLoginForwardNotice,
  resolveMessageReplyFrom,
  SIMPLELOGIN_DONE_KEYWORD,
  type SimpleLoginAction,
  type SimpleLoginActionKind,
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
import { DROPDOWN_PANEL_ROW_CLASS, DropdownPanel } from "@workspace/ui/solace";
import { cn } from "@workspace/ui/lib/utils";
import type { MessageReaderController } from "../use-message-reader-controller";

const ACTION_ICONS: Record<SimpleLoginActionKind, LucideIcon> = {
  "alias-disable": Ban,
  "contact-block": UserX,
  unsubscribe: BellOff,
};

const ROW_ICON_CLASS = "size-4 shrink-0";

export function MessageReaderSimpleLoginLine({
  controller,
}: {
  controller: MessageReaderController;
}) {
  const { isMobile, message, props } = controller;
  const [open, setOpen] = useState(false);
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    mode: SimpleLoginActionMode;
  }>({ open: false, mode: "run" });
  const forward = getSimpleLoginForward(message);
  if (!forward) return null;
  const notice = getSimpleLoginForwardNotice(forward, message.from);
  const alias = notice.alias;
  const onSimpleLoginAction = props.onSimpleLoginAction;
  // A mailto command only works from the mailbox SimpleLogin forwards to.
  const action =
    forward.action &&
    onSimpleLoginAction &&
    (forward.action.target.type !== "mailto" ||
      resolveMessageReplyFrom(props.identities ?? [], message))
      ? forward.action
      : null;
  const done = message.keywords?.[SIMPLELOGIN_DONE_KEYWORD] === true;
  const status = action && done ? action.doneLabel : null;

  const copyAlias = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Alias copied");
      setOpen(false);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const openConfirm = (mode: SimpleLoginActionMode) => {
    setOpen(false);
    setConfirmState({ open: true, mode });
  };

  return (
    <>
      <DropdownPanel
        open={open}
        onOpenChange={setOpen}
        align="start"
        width={320}
        trigger={
          <button
            type="button"
            className={cn(
              "-my-0.5 flex min-w-0 max-w-full cursor-pointer items-center gap-1 self-start py-0.5 text-muted-foreground transition-colors hover:text-foreground",
              isMobile ? "text-[11px]" : "text-xs",
            )}
          >
            <Shuffle className="size-3 shrink-0" strokeWidth={2.25} aria-hidden />
            <span className="truncate">
              {status ? `Via SimpleLogin · ${status}` : "Via SimpleLogin"}
            </span>
            <ChevronRight className="size-3 shrink-0" strokeWidth={2.25} aria-hidden />
          </button>
        }
      >
        <p className="px-3 pt-3 pb-2 text-[15px] font-[470] text-[var(--text-primary)]">
          SimpleLogin
        </p>
        <PanelSection title="Alias" footer={notice.detail}>
          <AliasRow
            alias={alias}
            label={notice.label}
            status={status}
            onCopy={(value) => void copyAlias(value)}
          />
        </PanelSection>
        {action ? (
          <SimpleLoginActionSection action={action} done={done} onSelect={openConfirm} />
        ) : null}
      </DropdownPanel>
      {action && onSimpleLoginAction ? (
        <SimpleLoginConfirmDialog
          action={action}
          state={confirmState}
          onClose={() => setConfirmState((current) => ({ ...current, open: false }))}
          onConfirm={(mode) => onSimpleLoginAction(message, mode)}
        />
      ) : null}
    </>
  );
}

function AliasRow({
  alias,
  label,
  status,
  onCopy,
}: {
  alias: string | null;
  label: string;
  status: string | null;
  onCopy: (alias: string) => void;
}) {
  const detail = status ?? (alias ? label : null);
  const content = (
    <>
      <Shuffle className={cn(ROW_ICON_CLASS, "text-[var(--icon-secondary)]")} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{alias ?? label}</span>
        {detail ? (
          <span className="block truncate text-[13px] text-[var(--text-secondary)]">
            {detail}
          </span>
        ) : null}
      </span>
    </>
  );
  const rowClass = cn(DROPDOWN_PANEL_ROW_CLASS, "h-auto min-h-11 py-1.5");

  if (!alias) {
    return <div className={cn(rowClass, "cursor-default hover:bg-transparent")}>{content}</div>;
  }
  return (
    <button
      type="button"
      onClick={() => onCopy(alias)}
      aria-label={`Copy alias ${alias}`}
      className={rowClass}
    >
      {content}
      <Copy className={cn(ROW_ICON_CLASS, "text-[var(--icon-link)]")} aria-hidden />
    </button>
  );
}

function PanelSection({
  title,
  footer,
  children,
}: {
  title?: string;
  footer: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-px border-t border-[var(--border-tertiary)] p-1">
      {title ? (
        <p className="px-2 pt-1.5 pb-1 text-[13px] font-[470] text-[var(--text-tertiary)]">
          {title}
        </p>
      ) : null}
      {children}
      <p className="px-2 pt-1 pb-1.5 text-xs leading-snug text-[var(--text-tertiary)]">
        {footer}
      </p>
    </div>
  );
}

function SimpleLoginActionSection({
  action,
  done,
  onSelect,
}: {
  action: SimpleLoginAction;
  done: boolean;
  onSelect: (mode: SimpleLoginActionMode) => void;
}) {
  if (done) {
    const undo = action.undo;
    if (!undo) return null;
    return (
      <PanelSection footer={undo.confirmMessage}>
        <button
          type="button"
          onClick={() => onSelect("undo")}
          className={DROPDOWN_PANEL_ROW_CLASS}
        >
          <RotateCcw className={cn(ROW_ICON_CLASS, "text-[var(--icon-secondary)]")} aria-hidden />
          <span className="min-w-0 flex-1 truncate">{undo.label}</span>
          <ExternalLink className={cn(ROW_ICON_CLASS, "text-[var(--icon-link)]")} aria-hidden />
        </button>
      </PanelSection>
    );
  }

  const destructive = action.kind !== "unsubscribe";
  const ActionIcon = ACTION_ICONS[action.kind];
  return (
    <PanelSection footer={action.confirmMessage}>
      <button
        type="button"
        onClick={() => onSelect("run")}
        className={cn(
          DROPDOWN_PANEL_ROW_CLASS,
          destructive &&
            "text-[var(--text-destructive)] hover:bg-[var(--cta-destructive-hover)] focus-visible:bg-[var(--cta-destructive-hover)]",
        )}
      >
        <ActionIcon
          className={cn(
            ROW_ICON_CLASS,
            destructive ? "text-[var(--icon-destructive)]" : "text-[var(--icon-secondary)]",
          )}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate">{action.label}</span>
      </button>
    </PanelSection>
  );
}

function SimpleLoginConfirmDialog({
  action,
  state,
  onClose,
  onConfirm,
}: {
  action: SimpleLoginAction;
  state: { open: boolean; mode: SimpleLoginActionMode };
  onClose: () => void;
  onConfirm: (mode: SimpleLoginActionMode) => void;
}) {
  const undo = action.undo;
  const confirm =
    state.mode === "undo" && undo
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
    <Dialog
      open={state.open}
      onOpenChange={(open) => {
        if (!open) onClose();
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
          <Button size="sm" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant={confirm.destructive ? "destructive" : "default"}
            onClick={() => {
              onClose();
              onConfirm(state.mode);
            }}
          >
            {confirm.label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
