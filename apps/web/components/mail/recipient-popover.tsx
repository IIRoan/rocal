"use client";

import { useState } from "react";
import { Copy, Send } from "lucide-react";
import {
  enrichSelfMailRecipient,
  isCurrentUserMailAddress,
} from "@workspace/calendar-core";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/ui/popover";
import { cn } from "@workspace/ui/lib/utils";
import { toast } from "sonner";
import { getMailComposeBridge } from "./mail-compose-bridge";
import { SenderAvatar } from "./mail-avatar";

export type RecipientPopoverProps = {
  name?: string | null;
  email: string;
  /** Show `Name <email@example.com>` inline in the trigger. */
  showInlineAddress?: boolean;
  className?: string;
};

export function RecipientPopover({
  name,
  email,
  showInlineAddress = false,
  className,
}: RecipientPopoverProps) {
  const [open, setOpen] = useState(false);
  const displayName = name?.trim() || email;
  const showAddressSuffix =
    showInlineAddress && Boolean(name?.trim()) && displayName !== email;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(email);
      toast.success("Copied");
      setOpen(false);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleCompose = () => {
    const bridge = getMailComposeBridge();
    if (!bridge) {
      toast.error("Compose is not available");
      return;
    }
    bridge.seedNewMessage({ email, name });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "min-w-0 cursor-pointer text-left transition-colors",
            className,
          )}
        >
          {showAddressSuffix ? (
            <>
              <span className="text-foreground hover:text-primary hover:underline">
                {displayName}
              </span>
              <span className="text-muted-foreground">
                {" "}
                &lt;{email}&gt;
              </span>
            </>
          ) : (
            <span className="text-foreground hover:text-primary hover:underline">
              {displayName}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={6}
        className="w-[300px] p-0 overflow-hidden"
      >
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          <SenderAvatar email={email} name={name ?? undefined} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{displayName}</div>
            {displayName !== email ? (
              <div className="truncate text-xs text-muted-foreground">
                {email}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-1 border-t border-border px-2 py-2">
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="inline-flex items-center gap-1.5 rounded px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Copy className="size-3.5" strokeWidth={2.25} />
            Copy
          </button>
          <button
            type="button"
            onClick={handleCompose}
            className="inline-flex items-center gap-1.5 rounded px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Send className="size-3.5" strokeWidth={2.25} />
            Email
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function RecipientPopoverList({
  recipients,
  currentUserEmail,
  currentUserName,
  className,
  maxVisible = 3,
}: {
  recipients: Array<{ email: string; name?: string | null }>;
  currentUserEmail?: string;
  currentUserName?: string | null;
  className?: string;
  maxVisible?: number;
}) {
  const visible = recipients.slice(0, maxVisible);
  const remaining = recipients.length - visible.length;
  const account = { email: currentUserEmail, name: currentUserName };

  return (
    <span className={cn("inline-flex min-w-0 flex-wrap items-center", className)}>
      {visible.map((recipient, index) => {
        const enriched = enrichSelfMailRecipient(recipient, account);
        const isMe = isCurrentUserMailAddress(recipient.email, currentUserEmail);

        return (
          <span key={`${recipient.email}-${index}`} className="inline-flex items-center">
            {index > 0 ? (
              <span className="mr-1 text-muted-foreground">,</span>
            ) : null}
            <RecipientPopover
              name={enriched.name}
              email={enriched.email}
              showInlineAddress={isMe || Boolean(enriched.name?.trim())}
              className="text-sm"
            />
          </span>
        );
      })}
      {remaining > 0 ? (
        <span className="ml-1 text-muted-foreground">+{remaining}</span>
      ) : null}
    </span>
  );
}
