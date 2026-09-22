"use client";

import * as React from "react";

import { cn } from "@workspace/ui/lib/utils";
import { WarmTooltip } from "./warm-tooltip";

import { FilledVariant, Size, Type } from "./types";
import { SIZE_HEIGHT } from "./types";
import Icons from "./icons";
import { Icon, type IconColor } from "./icons.constants";
import type { Color } from "./color-utils";

const BUTTON_ICON_SIZE: Record<
  Size.SMALL | Size.MEDIUM | Size.LARGE,
  Size
> = {
  small: Size.SMALL,
  medium: Size.MEDIUM,
  large: Size.X_MEDIUM,
};

const BUTTON_SIZE_BORDER_RADIUS: Record<
  Size.SMALL | Size.MEDIUM | Size.LARGE,
  number
> = {
  small: 4,
  medium: 6,
  large: 8,
};

const BUTTON_TYPE_COLOR: Record<Type, Color> = {
  primary: "inverse",
  secondary: "primary",
  tertiary: "primary",
  destructive: "destructive",
};

const FILLED_CLASS: Record<Type, string> = {
  primary: "bg-[var(--cta-primary-default)] hover:bg-[var(--cta-primary-hover)]",
  secondary:
    "border border-[var(--border-secondary)] bg-[var(--cta-secondary-default)] hover:bg-[var(--cta-secondary-hover)]",
  tertiary: "hover:bg-[var(--bg-overlay-tertiary)]",
  destructive:
    "border border-[var(--border-destructive)] hover:bg-[var(--cta-destructive-hover)]",
};

const GHOST_CLASS: Record<Type, string> = {
  primary: "hover:bg-[var(--bg-overlay-tertiary)]",
  secondary: "hover:bg-[var(--bg-overlay-tertiary)]",
  tertiary: "hover:bg-[var(--bg-overlay-tertiary)]",
  destructive: "hover:bg-[var(--cta-destructive-hover)]",
};

export type IconButtonType = Type;

export interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  active?: boolean;
  icon: Icon | React.ReactElement;
  size?: Size.SMALL | Size.MEDIUM | Size.LARGE;
  tooltip?: string;
  type?: IconButtonType;
  variant?: FilledVariant;
  ref?: React.Ref<HTMLButtonElement>;
}

export function IconButton({
  active = false,
  className,
  disabled,
  icon,
  size = Size.MEDIUM,
  tooltip = "",
  type = Type.PRIMARY,
  variant = FilledVariant.FILLED,
  onClick,
  ref,
  ...props
}: IconButtonProps) {
  const pixelSize = SIZE_HEIGHT[size];
  const iconSize = BUTTON_ICON_SIZE[size];
  const color = disabled
    ? "disabled"
    : variant === FilledVariant.FILLED
      ? BUTTON_TYPE_COLOR[type]
      : (type as IconColor);
  const surfaceClass =
    variant === FilledVariant.FILLED ? FILLED_CLASS[type] : GHOST_CLASS[type];

  const button = (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      aria-label={tooltip || undefined}
      onClick={disabled ? undefined : onClick}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center select-none",
        disabled && "cursor-default pointer-events-none",
        active && "bg-[var(--bg-overlay-secondary)]",
        surfaceClass,
        className,
      )}
      style={{
        width: pixelSize,
        height: pixelSize,
        borderRadius: BUTTON_SIZE_BORDER_RADIUS[size],
      }}
      {...props}
    >
      {typeof icon === "string" ? (
        <Icons icon={icon} size={iconSize} color={color} />
      ) : (
        icon
      )}
    </button>
  );

  if (!tooltip) return button;

  return (
    <WarmTooltip content={tooltip} disabled={disabled} side="top">
      {button}
    </WarmTooltip>
  );
}

export default IconButton;
