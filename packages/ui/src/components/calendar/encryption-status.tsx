import { Lock, LockOpen } from "lucide-react";

import { cn } from "../../lib/utils";
import type { EncryptionState } from "./types";

export interface EncryptableCalendarItem {
  encryptionState?: EncryptionState | null;
  encryptedContent?: string | null;
  encryptedName?: string | null;
}

interface EncryptionStatusMeta {
  label: string;
  description: string;
  Icon: typeof Lock;
  iconClassName: string;
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
        label: "Encrypted",
        description: "This item is encrypted at rest and decrypted on the client.",
        Icon: Lock,
        iconClassName: "text-emerald-600 dark:text-emerald-400",
      };
    case "shadow_write":
      return {
        label: "Not encrypted",
        description:
          "This item is not fully encrypted at rest because plaintext is still retained for compatibility features.",
        Icon: LockOpen,
        iconClassName: "text-muted-foreground/70",
      };
    default:
      return {
        label: "Not encrypted",
        description:
          "This item is not encrypted at rest.",
        Icon: LockOpen,
        iconClassName: "text-muted-foreground/70",
      };
  }
}

interface EncryptionStatusBadgeProps {
  item: EncryptableCalendarItem;
  className?: string;
}

export function EncryptionStatusBadge({
  item,
  className,
}: EncryptionStatusBadgeProps) {
  const meta = getEncryptionStatusMeta(item);
  const { Icon } = meta;

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