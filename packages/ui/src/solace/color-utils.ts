export const TEXT_COLORS = [
  "primary",
  "secondary",
  "tertiary",
  "disabled",
  "destructive",
  "link",
  "inverse",
  "white",
  "black",
] as const;

export const ACCENT_COLORS = [
  "green",
  "orange",
  "red",
  "yellow",
  "pink",
  "dark-blue",
  "blue",
] as const;

export type AccentColor = (typeof ACCENT_COLORS)[number];
export type TextColor = (typeof TEXT_COLORS)[number];
export type Color = TextColor | AccentColor;

export const TEXT_COLOR_VALUES: Record<TextColor, string> = {
  primary: "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  disabled: "var(--text-disabled)",
  destructive: "var(--text-destructive)",
  link: "var(--text-link)",
  inverse: "var(--text-inverse)",
  white: "var(--text-always-white)",
  black: "var(--text-always-black)",
};

export const ACCENT_COLOR_VALUES: Record<AccentColor, [string, string, AccentColor]> =
  {
    red: ["var(--accent-red-primary)", "var(--accent-red-secondary)", "red"],
    orange: [
      "var(--accent-orange-primary)",
      "var(--accent-orange-secondary)",
      "orange",
    ],
    pink: ["var(--accent-pink-primary)", "var(--accent-pink-secondary)", "pink"],
    yellow: [
      "var(--accent-yellow-primary)",
      "var(--accent-yellow-secondary)",
      "yellow",
    ],
    green: [
      "var(--accent-green-primary)",
      "var(--accent-green-secondary)",
      "green",
    ],
    blue: ["var(--accent-blue-primary)", "var(--accent-blue-secondary)", "blue"],
    "dark-blue": [
      "var(--accent-dark-blue-primary)",
      "var(--accent-dark-blue-secondary)",
      "dark-blue",
    ],
  };

export const ICON_COLOR_VALUES: Record<TextColor, string> = {
  primary: "var(--icon-primary)",
  secondary: "var(--icon-secondary)",
  tertiary: "var(--icon-tertiary)",
  disabled: "var(--icon-disabled)",
  destructive: "var(--icon-destructive)",
  link: "var(--icon-link)",
  inverse: "var(--icon-inverse)",
  white: "var(--icon-always-white)",
  black: "var(--icon-always-black)",
};

export function isAccentColor(color: Color): color is AccentColor {
  return (ACCENT_COLORS as readonly string[]).includes(color);
}

export function getColorTextValue(color: Color): string {
  if (isAccentColor(color)) {
    return ACCENT_COLOR_VALUES[color][0];
  }
  return TEXT_COLOR_VALUES[color];
}

export function getIconColorValue(color: Color | "source"): string {
  if (color === "source") return "currentColor";
  if (isAccentColor(color)) {
    return ACCENT_COLOR_VALUES[color][0];
  }
  return ICON_COLOR_VALUES[color];
}
