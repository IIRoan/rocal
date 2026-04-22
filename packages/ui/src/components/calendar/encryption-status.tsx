import { Lock, LockOpen, ShieldCheck } from "lucide-react";

import { cn } from "../../lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../ui/tooltip";
import type { EncryptionState } from "./types";

export interface EncryptableCalendarItem {
  encryptionState?: EncryptionState | null;
  encryptedContent?: string | null;
  encryptedName?: string | null;
}

interface EncryptionStatusMeta {
  state: EncryptionState;
  label: string;
  shortLabel: string;
  description: string;
  Icon: typeof Lock;
  iconClassName: string;
  textClassName: string;
}

export function resolveEncryptionState(
  item: EncryptableCalendarItem,
): EncryptionState {
  if (item.encryptionState === "encrypted") {
    return "encrypted";
  }

  if (item.encryptionState === "shadow_write") {
    return "shadow_write";
  }

  if (item.encryptedContent || item.encryptedName) {
    return "shadow_write";
  }

  return "plaintext";
}

export function getEncryptionStatusMeta(
  item: EncryptableCalendarItem,
): EncryptionStatusMeta {
  switch (resolveEncryptionState(item)) {
    case "encrypted":
      return {
        state: "encrypted",
        label: "End-to-end encrypted",
        shortLabel: "Encrypted",
        description:
          "This item is fully encrypted at rest and decrypted on the client.",
        Icon: ShieldCheck,
        iconClassName: "text-foreground/70",
        textClassName: "text-muted-foreground",
      };
    case "shadow_write":
      return {
        state: "shadow_write",
        label: "Hybrid encrypted",
        shortLabel: "Hybrid",
        description:
          "Sensitive fields are encrypted, but plaintext shadows are still retained for compatibility features like search, reminders, or sharing.",
        Icon: Lock,
        iconClassName: "text-foreground/55",
        textClassName: "text-muted-foreground",
      };
    default:
      return {
        state: "plaintext",
        label: "Not encrypted",
        shortLabel: "Plaintext",
        description: "This item is not encrypted at rest.",
        Icon: LockOpen,
        iconClassName: "text-muted-foreground/50",
        textClassName: "text-muted-foreground",
      };
  }
}

interface EncryptionStatusBadgeProps {
  item: EncryptableCalendarItem;
  className?: string;
  /**
   * Deprecated. The badge is always rendered as an icon-only indicator with
   * a tooltip on hover. Kept for source compatibility with existing call
   * sites.
   */
  showLabel?: boolean;
  labelClassName?: string;
  /**
   * When true (the default), no icon is rendered for plaintext items.
   * Calendar surfaces are dense, and showing an open-lock indicator on
   * every plaintext event/calendar adds visual noise without meaningful
   * information.
   */
  hidePlaintext?: boolean;
}

export function EncryptionStatusBadge({
  item,
  className,
  hidePlaintext = true,
}: EncryptionStatusBadgeProps) {
  const meta = getEncryptionStatusMeta(item);
  const { Icon } = meta;

  if (hidePlaintext && meta.state === "plaintext") {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={meta.label}
          className={cn(
            "inline-flex items-center justify-center shrink-0 cursor-default",
            className,
          )}
        >
          <Icon
            className={cn("h-3 w-3", meta.iconClassName)}
            aria-hidden
            strokeWidth={2.25}
          />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[220px] text-balance">
        <div className="font-medium">{meta.label}</div>
        <div className="text-[11px] opacity-80 leading-snug mt-0.5">
          {meta.description}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

