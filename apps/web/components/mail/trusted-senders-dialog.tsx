"use client";

import { X } from "lucide-react";
import { TrustedSendersPanel } from "./trusted-senders-panel";

export function TrustedSendersDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
      onClick={() => onOpenChange(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="trusted-senders-title"
        className="w-full max-w-md rounded-lg border border-border bg-background shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
          <h2 id="trusted-senders-title" className="text-sm font-medium">
            Trusted senders
          </h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded p-1 hover:bg-muted/50"
            aria-label="Close"
          >
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>

        <TrustedSendersPanel className="py-3" />
      </div>
    </div>
  );
}
