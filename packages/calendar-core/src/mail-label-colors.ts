export const MAIL_LABEL_PRESET_COLORS = [
  { value: "blue", hex: "#3b82f6", label: "Blue" },
  { value: "red", hex: "#ef4444", label: "Red" },
  { value: "green", hex: "#22c55e", label: "Green" },
  { value: "yellow", hex: "#facc15", label: "Yellow" },
  { value: "orange", hex: "#f97316", label: "Orange" },
  { value: "purple", hex: "#a855f7", label: "Purple" },
  { value: "pink", hex: "#ec4899", label: "Pink" },
  { value: "teal", hex: "#14b8a6", label: "Teal" },
  { value: "indigo", hex: "#6366f1", label: "Indigo" },
] as const;

export const MAIL_LABEL_CUSTOM_DEFAULT_COLOR = "#6366f1";

/** Unknown label definitions use each platform's neutral theme color. */
export const MAIL_LABEL_GHOST_COLOR = "";

export function isValidLabelHex(value: string): boolean {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(value);
}

export function resolveLabelDisplayColor(
  color: string,
  neutralColor = "var(--text-tertiary)",
): string {
  if (color === MAIL_LABEL_GHOST_COLOR) return neutralColor;
  if (isValidLabelHex(color)) return color;
  return (
    MAIL_LABEL_PRESET_COLORS.find((entry) => entry.value === color)?.hex ??
    color
  );
}

export function normalizeLabelColorInput(color: string): string {
  if (isValidLabelHex(color)) return color;
  return resolveLabelDisplayColor(color);
}
