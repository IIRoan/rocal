import type * as React from "react";

import { Alignment } from "./types";
import type { Color } from "./color-utils";

export enum TypographyOverflow {
  VISIBLE = "visible",
  HIDDEN = "hidden",
}

export enum TypographySize {
  H1 = "h1",
  H2 = "h2",
  H3 = "h3",
  H4 = "h4",
  LARGE = "large",
  MEDIUM = "medium",
  SMALL = "small",
  CAPTION = "caption",
}

export enum TypographyWeight {
  BOLD = 560,
  MEDIUM = 470,
  REGULAR = 380,
}

export enum TextDecoration {
  UNDERLINE = "underline",
  LINE_THROUGH = "line-through",
}

export interface TypographyProps {
  align?: Alignment;
  capitalize?: boolean;
  children?: React.ReactNode;
  className?: string;
  color?: Color;
  dataTest?: string;
  id?: string;
  inline?: boolean;
  maxWidth?: number | string;
  minWidth?: number | string;
  mono?: boolean;
  overflow?: TypographyOverflow;
  selectable?: boolean;
  size?: TypographySize;
  textDecoration?: TextDecoration;
  uppercase?: boolean;
  weight?: TypographyWeight;
  width?: number | string;
  wrap?: boolean;
  onClick?: (event: React.MouseEvent) => void;
}
