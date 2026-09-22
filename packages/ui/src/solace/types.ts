export enum Alignment {
  CENTER = "center",
  INHERIT = "inherit",
  JUSTIFY = "justify",
  LEFT = "left",
  RIGHT = "right",
}

export enum FilledVariant {
  FILLED = "filled",
  UNFILLED = "unfilled",
}

export enum Layout {
  INLINE = "inline",
  STACKED = "stacked",
}

export enum Size {
  X_SMALL = "xsmall",
  SMALL = "small",
  MEDIUM = "medium",
  X_MEDIUM = "xmedium",
  LARGE = "large",
  X_LARGE = "xlarge",
}

export enum ThemeMode {
  LIGHT = "light",
  DARK = "dark",
}

export enum Type {
  PRIMARY = "primary",
  SECONDARY = "secondary",
  TERTIARY = "tertiary",
  DESTRUCTIVE = "destructive",
}

export const SIZE_HEIGHT: Record<
  Size.X_SMALL | Size.SMALL | Size.MEDIUM | Size.LARGE,
  number
> = {
  xsmall: 28,
  small: 33,
  medium: 35,
  large: 42,
};
