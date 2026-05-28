import { Lock, ShieldAlert, ShieldCheck } from "lucide-react";

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

export interface EncryptionStatusMeta {
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
        Icon: ShieldAlert,
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
