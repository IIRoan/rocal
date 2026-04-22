import { Lock, LockOpen } from "lucide-react";

import { cn } from "../../lib/utils";
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
  badgeClassName: string;
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
        label: "Encrypted",
        shortLabel: "Encrypted",
        description:
          "This item is fully encrypted at rest and decrypted on the client.",
        Icon: Lock,
        iconClassName: "text-emerald-600 dark:text-emerald-400",
        badgeClassName:
          "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200",
      };
    case "shadow_write":
      return {
        state: "shadow_write",
        label: "Hybrid encrypted",
        shortLabel: "Hybrid",
        description:
          "Sensitive fields are encrypted, but plaintext shadows are still retained for compatibility features like search, reminders, or sharing.",
        Icon: Lock,
        iconClassName: "text-amber-700 dark:text-amber-300",
        badgeClassName:
          "border-amber-500/20 bg-amber-500/10 text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200",
      };
    default:
      return {
        state: "plaintext",
        label: "Not encrypted",
        shortLabel: "Plaintext",
        description: "This item is not encrypted at rest.",
        Icon: LockOpen,
        iconClassName: "text-muted-foreground/70",
        badgeClassName:
          "border-border/60 bg-muted/60 text-muted-foreground",
      };
  }
}

interface EncryptionStatusBadgeProps {
  item: EncryptableCalendarItem;
  className?: string;
  showLabel?: boolean;
  labelClassName?: string;
}

export function EncryptionStatusBadge({
  item,
  className,
  showLabel = false,
  labelClassName,
}: EncryptionStatusBadgeProps) {
  const meta = getEncryptionStatusMeta(item);
  const { Icon } = meta;

  if (showLabel) {
    return (
      <span
        title={meta.description}
        aria-label={meta.label}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none shrink-0",
          meta.badgeClassName,
          className,
        )}
      >
        <Icon className={cn("h-3.5 w-3.5", meta.iconClassName)} />
        <span className={cn("truncate", labelClassName)}>{meta.shortLabel}</span>
      </span>
    );
  }

  return (
    <span
      title={meta.description}
      aria-label={meta.label}
      className={cn(
        "inline-flex items-center justify-center shrink-0",
        className,
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", meta.iconClassName)} />
    </span>
  );
}