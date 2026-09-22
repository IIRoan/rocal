"use client";

import * as React from "react";

import { cn } from "@workspace/ui/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../components/ui/tooltip";

import { Size, Type } from "./types";
import Icons from "./icons";
import { Icon } from "./icons.constants";
import Typography from "./typography";
import { TypographySize, TypographyWeight } from "./typography.constants";
import type { Color } from "./color-utils";

export type ButtonSize = Size.SMALL | Size.MEDIUM | Size.LARGE;

const BUTTON_ICON_SIZE: Record<ButtonSize, Size> = {
  small: Size.SMALL,
  medium: Size.MEDIUM,
  large: Size.X_MEDIUM,
};

const TYPOGRAPHY_SIZE: Record<ButtonSize, TypographySize> = {
  small: TypographySize.SMALL,
  medium: TypographySize.MEDIUM,
  large: TypographySize.LARGE,
};

const BUTTON_TYPE_COLOR: Record<Type, Color> = {
  primary: "inverse",
  secondary: "primary",
  tertiary: "primary",
  destructive: "destructive",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  small: "h-[33px] rounded-xl px-4 gap-1",
  medium: "h-[35px] rounded-[14px] px-4 gap-1.5",
  large: "h-[42px] rounded-2xl px-6 gap-2",
};

const TYPE_CLASS: Record<Type, string> = {
  primary:
    "border border-transparent bg-[var(--cta-primary-default)] shadow-[var(--shadow-l1)] hover:bg-[var(--cta-primary-hover)] active:bg-[var(--cta-primary-active)] disabled:bg-[var(--cta-primary-disabled)] disabled:shadow-none",
  secondary:
    "border border-[var(--border-secondary)] bg-[var(--cta-secondary-default)] hover:bg-[var(--cta-secondary-hover)] active:bg-[var(--cta-secondary-active)]",
  tertiary:
    "border border-transparent bg-transparent hover:bg-[var(--bg-overlay-tertiary)] active:bg-[var(--bg-overlay-secondary)]",
  destructive:
    "border border-[var(--border-destructive)] bg-[var(--cta-destructive-default)] hover:bg-[var(--cta-destructive-hover)] active:bg-[var(--cta-destructive-active)]",
};

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  active?: boolean;
  size?: ButtonSize;
  type?: Type;
  tooltip?: string;
  fullWidth?: boolean;
  icon?: Icon | React.ReactElement;
  loading?: boolean;
  compact?: boolean;
}

export function Button({
  children,
  className,
  active = false,
  size = Size.MEDIUM,
  type = Type.PRIMARY,
  tooltip,
  fullWidth = false,
  icon,
  disabled,
  loading,
  compact,
  onClick,
  ...props
}: ButtonProps) {
  const contentColor: Color =
    disabled || loading ? "disabled" : BUTTON_TYPE_COLOR[type];
  const iconSize = BUTTON_ICON_SIZE[size];

  const button = (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={onClick}
      className={cn(
        "relative inline-flex cursor-pointer items-center justify-center select-none",
        SIZE_CLASS[size],
        TYPE_CLASS[type],
        fullWidth && "w-full",
        compact && "h-auto rounded px-2 py-1",
        active && "active",
        disabled && "pointer-events-none",
        className,
      )}
      {...props}
    >
      {typeof icon === "string" ? (
        <Icons icon={icon} size={iconSize} color={contentColor} />
      ) : (
        icon
      )}
      <Typography
        size={TYPOGRAPHY_SIZE[size]}
        weight={TypographyWeight.MEDIUM}
        color={contentColor}
      >
        {children}
      </Typography>
    </button>
  );

  if (!tooltip) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export default Button;
