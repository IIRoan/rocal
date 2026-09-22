"use client";

import * as React from "react";

import { cn } from "@workspace/ui/lib/utils";
import { WarmTooltip } from "./warm-tooltip";

import { FilledVariant, Size } from "./types";
import Icons from "./icons";
import { Icon, type IconColor } from "./icons.constants";
import Typography from "./typography";
import {
  TypographySize,
  TypographyWeight,
  type TypographyProps,
} from "./typography.constants";
import type { Color } from "./color-utils";

export type IconTextSize = Size.X_SMALL | Size.SMALL | Size.MEDIUM | Size.LARGE;

const ICON_TEXT_ICON_SIZE: Record<IconTextSize, Size | number> = {
  xsmall: 8,
  small: Size.SMALL,
  medium: Size.MEDIUM,
  large: Size.X_MEDIUM,
};

const ICON_TEXT_TYPOGRAPHY_SIZE: Record<IconTextSize, TypographySize> = {
  xsmall: TypographySize.CAPTION,
  small: TypographySize.SMALL,
  medium: TypographySize.MEDIUM,
  large: TypographySize.LARGE,
};

const GAP_CLASS: Record<IconTextSize, string> = {
  xsmall: "gap-1",
  small: "gap-1.5",
  medium: "gap-2",
  large: "gap-2.5",
};

export type IconComponent = React.ReactElement<{
  color?: IconColor;
  size?: Size | number;
}>;

export interface IconTextProps
  extends Omit<TypographyProps, "children" | "size" | "color"> {
  label?: React.ReactNode;
  disabled?: boolean;
  disableHover?: boolean;
  startIcon?: Icon | IconComponent;
  endIcon?: Icon | IconComponent;
  size?: IconTextSize;
  color?: Color;
  noPadding?: boolean;
  tooltip?: string;
  variant?: FilledVariant;
  fullWidth?: boolean;
  dataTest?: string;
  ref?: React.Ref<HTMLButtonElement>;
}

function hasIconTextLabel(label?: React.ReactNode) {
  return Boolean(label) && (typeof label !== "string" || label.length > 0);
}

function iconTextClassName({
  size,
  fullWidth,
  isClickable,
  disabled,
  color,
  variant,
  noPadding,
  className,
}: {
  size: IconTextSize;
  fullWidth?: boolean;
  isClickable: boolean;
  disabled: boolean;
  color?: Color;
  variant: FilledVariant;
  noPadding: boolean;
  className?: string;
}) {
  return cn(
    "inline-flex min-w-0 items-center justify-center rounded select-none",
    GAP_CLASS[size],
    fullWidth ? "w-full" : "max-w-fit",
    isClickable && !disabled && "cursor-pointer hover:bg-[var(--bg-overlay-tertiary)]",
    color === "destructive" &&
      isClickable &&
      "hover:bg-[var(--bg-overlay-destructive)]",
    variant === FilledVariant.FILLED
      ? "h-[27px] border border-[var(--border-secondary)] bg-[var(--cta-secondary-default)] px-2 py-1"
      : "p-1",
    noPadding && "!p-0",
    disabled && "pointer-events-none",
    className,
  );
}

function renderIconTextGlyph(
  icon: Icon | IconComponent,
  textColor: Color,
  iconSize: Size | number,
) {
  if (typeof icon === "string") {
    return <Icons color={textColor} icon={icon} size={iconSize} />;
  }
  return icon;
}

function IconTextNode({
  isClickable,
  id,
  ref,
  dataTest,
  disabled,
  onClick,
  className,
  children,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
}: {
  isClickable: boolean;
  id?: string;
  ref?: React.Ref<HTMLButtonElement>;
  dataTest?: string;
  disabled: boolean;
  onClick?: TypographyProps["onClick"];
  className: string;
  children: React.ReactNode;
  "aria-label"?: string;
  // WarmTooltip injects this via cloneElement.
  "aria-describedby"?: string;
}) {
  if (isClickable) {
    return (
      <button
        id={id}
        ref={ref}
        type="button"
        data-test={dataTest}
        disabled={disabled}
        onClick={disabled ? undefined : onClick}
        className={className}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
      >
        {children}
      </button>
    );
  }
  return (
    <div
      id={id}
      data-test={dataTest}
      className={className}
      aria-describedby={ariaDescribedBy}
    >
      {children}
    </div>
  );
}

export function IconText({
  label,
  className,
  disabled = false,
  startIcon,
  endIcon,
  weight = TypographyWeight.MEDIUM,
  size = Size.MEDIUM,
  color,
  onClick,
  noPadding = false,
  dataTest,
  tooltip,
  variant = FilledVariant.UNFILLED,
  id,
  fullWidth,
  ref,
  ...typographyProps
}: IconTextProps) {
  const isClickable = Boolean(onClick);
  const hasLabel = hasIconTextLabel(label);
  if (!hasLabel && !startIcon && !endIcon) return null;

  const textColor: Color = disabled ? "disabled" : (color ?? "primary");
  const iconSize = ICON_TEXT_ICON_SIZE[size];
  const node = (
    <IconTextNode
      isClickable={isClickable}
      id={id}
      ref={ref}
      dataTest={dataTest}
      disabled={disabled}
      onClick={onClick}
      aria-label={hasLabel ? undefined : tooltip}
      className={iconTextClassName({
        size,
        fullWidth,
        isClickable,
        disabled,
        color,
        variant,
        noPadding,
        className,
      })}
    >
      {startIcon ? renderIconTextGlyph(startIcon, textColor, iconSize) : null}
      {hasLabel ? (
        <Typography
          color={textColor}
          size={ICON_TEXT_TYPOGRAPHY_SIZE[size]}
          weight={weight}
          {...typographyProps}
        >
          {label}
        </Typography>
      ) : null}
      {endIcon ? renderIconTextGlyph(endIcon, textColor, iconSize) : null}
    </IconTextNode>
  );

  if (!tooltip) return node;
  return (
    <WarmTooltip content={tooltip} disabled={disabled} side="top">
      {node}
    </WarmTooltip>
  );
}

export default IconText;
