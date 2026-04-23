import { Lock, ShieldCheck } from "lucide-react";

import { cn } from "../../lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover";
import type { EncryptionState } from "./types";

export interface EncryptableCalendarItem {
  encryptionState?: EncryptionState | null;
  encryptedContent?: string | null;
  encryptedName?: string | null;
  /**
   * When set on a Calendar, every event in that calendar is forced to
   * full ciphertext storage regardless of the user's global encryption
   * mode. The badge surfaces this even before the calendar has any
   * encrypted rows of its own.
   */
  forceFullEncryption?: boolean | null;
}

export type EncryptionDisplayState =
  | "encrypted"
  | "shadow_write"
  | "plaintext"
  | "force_full";

interface EncryptionStatusMeta {
  state: EncryptionDisplayState;
  label: string;
  shortLabel: string;
  description: string;
  Icon: typeof Lock;
  iconClassName: string;
  protectedFields: string[];
  visibleFields: string[];
}

export function resolveEncryptionState(
  item: EncryptableCalendarItem,
): EncryptionDisplayState {
  if (item.forceFullEncryption) {
    return "force_full";
  }

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
    case "force_full":
      return {
        state: "force_full",
        label: "Force-encrypted calendar",
        shortLabel: "Locked",
        description:
          "Every event in this calendar is stored as ciphertext only. Reminders and ICS sharing won't include event details.",
        Icon: ShieldCheck,
        iconClassName: "text-primary",
        protectedFields: ["Title", "Description", "Location", "Calendar name"],
        visibleFields: ["Start & end times", "All-day flag", "Recurrence rule"],
      };
    case "encrypted":
      return {
        state: "encrypted",
        label: "End-to-end encrypted",
        shortLabel: "Encrypted",
        description:
          "Stored as ciphertext only. The server can't read this item's contents.",
        Icon: ShieldCheck,
        iconClassName: "text-foreground/70",
        protectedFields: ["Title", "Description", "Location"],
        visibleFields: ["Start & end times", "All-day flag", "Recurrence rule"],
      };
    case "shadow_write":
      return {
        state: "shadow_write",
        label: "Hybrid encrypted",
        shortLabel: "Hybrid",
        description:
          "Encrypted at rest, but plaintext shadows are kept so reminders and sharing keep working.",
        Icon: Lock,
        iconClassName: "text-foreground/55",
        protectedFields: ["Encrypted ciphertext copy stored alongside"],
        visibleFields: [
          "Title (plaintext shadow for reminders)",
          "Description",
          "Location",
          "Start & end times",
          "Recurrence rule",
        ],
      };
    default:
      return {
        state: "plaintext",
        label: "Not encrypted",
        shortLabel: "Plaintext",
        description: "Stored as plaintext on the server.",
        Icon: Lock,
        iconClassName: "text-muted-foreground/40",
        protectedFields: [],
        visibleFields: [
          "Title",
          "Description",
          "Location",
          "Start & end times",
          "Recurrence rule",
        ],
      };
  }
}

interface EncryptionStatusBadgeProps {
  item: EncryptableCalendarItem;
  className?: string;
  /**
   * Deprecated. The badge is always rendered as a single uniform icon
   * with a tooltip on hover. Kept for source compatibility with existing
   * call sites.
   */
  showLabel?: boolean;
  labelClassName?: string;
  /**
   * When true (the default), no icon is rendered for plaintext items.
   * Calendar surfaces are dense, and showing an indicator on every
   * plaintext event/calendar adds visual noise without meaningful
   * information.
   */
  hidePlaintext?: boolean;
  /**
   * When true, renders only the status icon (non-interactive span). Use this
   * when embedding inside another button/clickable element to avoid nested
   * interactive elements (which break hydration / a11y).
   */
  asIcon?: boolean;
}

export function EncryptionStatusBadge({
  item,
  className,
  hidePlaintext = true,
  asIcon = false,
}: EncryptionStatusBadgeProps) {
  const meta = getEncryptionStatusMeta(item);
  const { Icon } = meta;

  if (hidePlaintext && meta.state === "plaintext") {
    return null;
  }

  if (asIcon) {
    return (
      <span
        aria-label={meta.label}
        title={meta.label}
        className={cn(
          "inline-flex items-center justify-center shrink-0",
          "h-3.5 w-3.5",
          className,
        )}
      >
        <Icon
          className={cn("h-3 w-3", meta.iconClassName)}
          aria-hidden
          strokeWidth={2.25}
        />
      </span>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={meta.label}
          className={cn(
            "inline-flex items-center justify-center shrink-0 rounded-sm",
            "outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
            "transition-colors hover:bg-accent/40",
            "h-5 w-5",
            className,
          )}
        >
          <Icon
            className={cn("h-3 w-3", meta.iconClassName)}
            aria-hidden
            strokeWidth={2.25}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={6}
        className="w-72 p-0 overflow-hidden"
      >
        <div className="flex items-start gap-2.5 px-3 pt-3 pb-2 border-b border-border/50">
          <div
            className={cn(
              "flex items-center justify-center h-7 w-7 rounded-md shrink-0 bg-muted/50",
            )}
          >
            <Icon
              className={cn("h-4 w-4", meta.iconClassName)}
              strokeWidth={2.25}
              aria-hidden
            />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium leading-tight">
              {meta.label}
            </div>
            <div className="text-[11px] text-muted-foreground leading-snug mt-0.5">
              {meta.description}
            </div>
          </div>
        </div>
        <div className="px-3 py-2.5 space-y-2.5">
          {meta.protectedFields.length > 0 && (
            <div>
              <div className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase mb-1">
                Encrypted on server
              </div>
              <ul className="space-y-0.5">
                {meta.protectedFields.map((field) => (
                  <li
                    key={`enc-${field}`}
                    className="text-xs flex items-center gap-1.5"
                  >
                    <ShieldCheck
                      className="h-3 w-3 text-primary shrink-0"
                      strokeWidth={2.25}
                      aria-hidden
                    />
                    <span className="truncate">{field}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {meta.visibleFields.length > 0 && (
            <div>
              <div className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase mb-1">
                Visible to server
              </div>
              <ul className="space-y-0.5">
                {meta.visibleFields.map((field) => (
                  <li
                    key={`plain-${field}`}
                    className="text-xs flex items-center gap-1.5 text-muted-foreground"
                  >
                    <Lock
                      className="h-3 w-3 opacity-40 shrink-0"
                      strokeWidth={2.25}
                      aria-hidden
                    />
                    <span className="truncate">{field}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

