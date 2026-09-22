"use client";

import * as React from "react";

import { cn } from "@workspace/ui/lib/utils";

import { FilledVariant, Size } from "./types";
import Icons from "./icons";
import { Icon } from "./icons.constants";
import Typography from "./typography";
import { TypographySize, TypographyWeight } from "./typography.constants";
import type { Color } from "./color-utils";
import { getColorTextValue } from "./color-utils";

export type ChipSize = Size.X_SMALL | Size.SMALL | Size.MEDIUM | Size.LARGE;

export interface ChipProps {
  className?: string;
  color?: Color;
  icon?: Icon;
  label?: React.ReactNode;
  noBorder?: boolean;
  onClick?: (event: React.MouseEvent) => void;
  size?: ChipSize;
  variant?: FilledVariant;
}

const PADDING: Record<ChipSize, string> = {
  xsmall: "p-0.5",
  small: "p-1",
  medium: "p-1",
  large: "p-1",
};

export function Chip({
  className,
  color = "secondary",
  icon,
  label,
  noBorder,
  onClick,
  size = Size.MEDIUM,
  variant = FilledVariant.UNFILLED,
}: ChipProps) {
  const Comp = onClick ? "button" : "span";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "inline-flex w-fit shrink-0 items-center rounded-full",
        PADDING[size],
        !noBorder && "border border-[var(--border-secondary)]",
        variant === FilledVariant.FILLED && "bg-[var(--bg-overlay-tertiary)]",
        onClick && "cursor-pointer hover:bg-[var(--cta-secondary-hover)]",
        className,
      )}
      style={{ color: getColorTextValue(color) }}
    >
      {icon ? (
        <Icons
          icon={icon}
          size={size === Size.LARGE ? Size.MEDIUM : Size.X_SMALL}
          color={color}
        />
      ) : null}
      {label !== undefined && label !== null ? (
        <span className={cn(size === Size.X_SMALL ? "px-1" : "px-2")}>
          <Typography
            color={color}
            size={
              size === Size.X_SMALL || size === Size.SMALL
                ? TypographySize.CAPTION
                : TypographySize.SMALL
            }
            weight={TypographyWeight.MEDIUM}
          >
            {label}
          </Typography>
        </span>
      ) : null}
    </Comp>
  );
}

export default Chip;
