export type ListDensity = "compact" | "comfortable";
export type MarkAsReadDelay = "instant" | "delayed" | "never";

export type MailListSettings = {
  density: ListDensity;
  markAsReadDelay: MarkAsReadDelay;
  threadExpandInList: boolean;
  undoToastDurationMs: number;
  showLabelChipsInList: boolean;
  keyboardShortcutsEnabled: boolean;
};

export const DEFAULT_MAIL_LIST_SETTINGS: MailListSettings = {
  density: "compact",
  markAsReadDelay: "instant",
  threadExpandInList: true,
  undoToastDurationMs: 5000,
  showLabelChipsInList: true,
  keyboardShortcutsEnabled: true,
};

export const MARK_AS_READ_DELAY_MS = 3000;
export const MIN_UNDO_TOAST_DURATION_MS = 2000;
export const MAX_UNDO_TOAST_DURATION_MS = 15000;

export const LIST_DENSITY_OPTIONS: { value: ListDensity; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "comfortable", label: "Comfortable" },
];

export const MARK_AS_READ_DELAY_OPTIONS: {
  value: MarkAsReadDelay;
  label: string;
}[] = [
  { value: "instant", label: "Instantly" },
  { value: "delayed", label: "After 3 seconds" },
  { value: "never", label: "Never (manual only)" },
];

export const UNDO_TOAST_DURATION_OPTIONS: { value: number; label: string }[] = [
  { value: 3000, label: "3 seconds" },
  { value: 5000, label: "5 seconds" },
  { value: 10000, label: "10 seconds" },
  { value: 15000, label: "15 seconds" },
];

function isUndoToastDuration(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_UNDO_TOAST_DURATION_MS &&
    value <= MAX_UNDO_TOAST_DURATION_MS
  );
}

/** Coerces stored settings field by field so one bad value never resets the rest. */
export function normalizeMailListSettings(value: unknown): MailListSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_MAIL_LIST_SETTINGS;
  }
  const parsed = value as Partial<Record<keyof MailListSettings, unknown>>;
  return {
    density:
      parsed.density === "comfortable" || parsed.density === "compact"
        ? parsed.density
        : DEFAULT_MAIL_LIST_SETTINGS.density,
    markAsReadDelay:
      parsed.markAsReadDelay === "instant" ||
      parsed.markAsReadDelay === "delayed" ||
      parsed.markAsReadDelay === "never"
        ? parsed.markAsReadDelay
        : DEFAULT_MAIL_LIST_SETTINGS.markAsReadDelay,
    threadExpandInList:
      typeof parsed.threadExpandInList === "boolean"
        ? parsed.threadExpandInList
        : DEFAULT_MAIL_LIST_SETTINGS.threadExpandInList,
    undoToastDurationMs: isUndoToastDuration(parsed.undoToastDurationMs)
      ? parsed.undoToastDurationMs
      : DEFAULT_MAIL_LIST_SETTINGS.undoToastDurationMs,
    showLabelChipsInList:
      typeof parsed.showLabelChipsInList === "boolean"
        ? parsed.showLabelChipsInList
        : DEFAULT_MAIL_LIST_SETTINGS.showLabelChipsInList,
    keyboardShortcutsEnabled:
      typeof parsed.keyboardShortcutsEnabled === "boolean"
        ? parsed.keyboardShortcutsEnabled
        : DEFAULT_MAIL_LIST_SETTINGS.keyboardShortcutsEnabled,
  };
}

export function parseMailListSettings(raw: string | null): MailListSettings {
  if (!raw) return DEFAULT_MAIL_LIST_SETTINGS;
  try {
    return normalizeMailListSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_MAIL_LIST_SETTINGS;
  }
}

export function serializeMailListSettings(settings: MailListSettings): string {
  return JSON.stringify(normalizeMailListSettings(settings));
}

/** Milliseconds before an opened message is marked read, or `null` when it never is. */
export function resolveMarkAsReadDelayMs(delay: MarkAsReadDelay): number | null {
  if (delay === "never") return null;
  return delay === "delayed" ? MARK_AS_READ_DELAY_MS : 0;
}
