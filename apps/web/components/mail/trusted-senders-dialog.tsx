"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@workspace/ui/components/ui/button";
import { Input } from "@workspace/ui/components/ui/input";
import {
  addTrustedSender,
  removeTrustedSender,
  useMailDisplaySettings,
} from "@/lib/mail/mail-display-settings";

export function TrustedSendersDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { settings } = useMailDisplaySettings();
  const [newEmail, setNewEmail] = useState("");

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

        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Remote images from these senders load automatically when the policy
            is set to ask.
          </p>

          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = newEmail.trim();
              if (!trimmed.includes("@")) return;
              addTrustedSender(trimmed);
              setNewEmail("");
            }}
          >
            <Input
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
              placeholder="sender@example.com"
              className="h-8 text-sm"
              type="email"
            />
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              disabled={!newEmail.trim().includes("@")}
            >
              Add
            </Button>
          </form>

          {settings.trustedSenders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No trusted senders yet.</p>
          ) : (
            <ul className="max-h-48 overflow-y-auto space-y-1">
              {settings.trustedSenders.map((email) => (
                <li
                  key={email}
                  className="flex items-center justify-between gap-2 rounded-md border border-border/50 px-2 py-1.5 text-sm"
                >
                  <span className="truncate">{email}</span>
                  <button
                    type="button"
                    onClick={() => removeTrustedSender(email)}
                    className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
