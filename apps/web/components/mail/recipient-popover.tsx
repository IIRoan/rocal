"use client";

import { useState } from "react";
import {
  DROPDOWN_PANEL_ROW_CLASS,
  DropdownPanel,
  Icon,
  Icons,
} from "@workspace/ui/solace";
import { cn } from "@workspace/ui/lib/utils";
import { toast } from "@workspace/ui/lib/toast";
import { getMailComposeBridge } from "./mail-compose-bridge";
import { SenderAvatar } from "./mail-avatar";

export type RecipientPopoverProps = {
  name?: string | null;
  email: string;
  className?: string;
};

export function RecipientPopover({
  name,
  email,
  className,
}: RecipientPopoverProps) {
  const [open, setOpen] = useState(false);
  const displayName = name?.trim() || email;

  return (
    <DropdownPanel
      open={open}
      onOpenChange={setOpen}
      align="start"
      width={300}
      trigger={
        // Padding cancelled by margin gives the inline name a 24px target (WCAG 2.5.8) without moving the text.
        <button
          type="button"
          className={cn(
            "-my-1 min-w-0 cursor-pointer py-1 text-left transition-colors",
            className,
          )}
        >
          <span className="text-foreground hover:text-accent hover:underline">
            {displayName}
          </span>
        </button>
      }
    >
      <div className="flex items-center gap-3 p-3">
        <SenderAvatar email={email} name={name ?? undefined} />
        <div className="min-w-0 flex-1">
          <div className="break-words text-[15px] font-medium text-[var(--text-primary)]">
            {displayName}
          </div>
          {displayName !== email ? (
            <div className="break-words text-[13px] text-[var(--text-secondary)]">
              {email}
            </div>
          ) : null}
        </div>
      </div>
      <RecipientActions
        name={name}
        email={email}
        onDone={() => setOpen(false)}
        className="border-t border-[var(--border-tertiary)] p-1"
      />
    </DropdownPanel>
  );
}

/** Copy the address or start a message to it; `onDone` closes whatever surface holds the actions. */
export function RecipientActions({
  name,
  email,
  onDone,
  className,
}: {
  name?: string | null;
  email: string;
  onDone: () => void;
  className?: string;
}) {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(email);
      toast.success("Copied");
      onDone();
    } catch {
      toast.error("Couldn't copy the address. Select it above and copy it.");
    }
  };

  const handleCompose = () => {
    const bridge = getMailComposeBridge();
    if (!bridge) {
      toast.error("Couldn't start a new message. Reload Mail and try again.");
      return;
    }
    bridge.seedNewMessage({ email, name });
    onDone();
  };

  return (
    <div className={cn("flex flex-col", className)}>
      <button
        type="button"
        onClick={() => void handleCopy()}
        className={DROPDOWN_PANEL_ROW_CLASS}
      >
        <Icons icon={Icon.Copy} color="secondary" />
        Copy address
      </button>
      <button
        type="button"
        onClick={handleCompose}
        className={DROPDOWN_PANEL_ROW_CLASS}
      >
        <Icons icon={Icon.Send} color="secondary" />
        Send email
      </button>
    </div>
  );
}
