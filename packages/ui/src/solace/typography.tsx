"use client";

import { cn } from "@workspace/ui/lib/utils";

import { getColorTextValue } from "./color-utils";
import { Alignment } from "./types";
import {
  TextDecoration,
  TypographyOverflow,
  TypographySize,
  TypographyWeight,
  type TypographyProps,
} from "./typography.constants";

const SIZE_CLASS: Record<TypographySize, string> = {
  h1: "text-[34px] leading-[120%] tracking-[-0.02em]",
  h2: "text-[28px] leading-[120%] tracking-[-0.02em]",
  h3: "text-[22px] leading-7 tracking-[-0.02em]",
  h4: "text-[19px] leading-[130%] tracking-[-0.02em]",
  large: "text-[17px] leading-[130%] tracking-[-0.01em]",
  medium: "text-[15px] leading-[130%] tracking-[0]",
  small: "text-[13px] leading-[130%] tracking-[0]",
  caption: "text-[11px] leading-[130%] tracking-[0.01em]",
};

const WEIGHT_VALUE: Record<TypographyWeight, number> = {
  [TypographyWeight.REGULAR]: 400,
  [TypographyWeight.MEDIUM]: 500,
  [TypographyWeight.BOLD]: 600,
};

function toCssSize(value?: number | string) {
  if (value === undefined) return undefined;
  return typeof value === "number" ? `${value}px` : value;
}

function typographyClassName({
  inline,
  size,
  capitalize,
  uppercase,
  clickable,
  mono,
  className,
}: {
  inline: boolean;
  size: TypographySize;
  capitalize?: boolean;
  uppercase?: boolean;
  clickable: boolean;
  mono: boolean;
  className?: string;
}) {
  return cn(
    inline ? "inline-flex" : "flex",
    "min-w-0 break-words antialiased",
    SIZE_CLASS[size],
    capitalize && "capitalize",
    uppercase && "uppercase",
    clickable && "cursor-pointer",
    mono && "font-mono",
    className,
  );
}

export default function Typography({
  children,
  align = Alignment.INHERIT,
  capitalize,
  className,
  color = "primary",
  dataTest,
  id,
  inline = false,
  size = TypographySize.MEDIUM,
  maxWidth,
  minWidth,
  mono = false,
  overflow = TypographyOverflow.HIDDEN,
  selectable = true,
  textDecoration,
  uppercase,
  weight = TypographyWeight.REGULAR,
  width,
  wrap = false,
  onClick,
}: TypographyProps) {
  const Comp = onClick ? "button" : "span";

  return (
    <Comp
      id={id}
      data-test={dataTest}
      {...(onClick ? { type: "button" as const } : {})}
      onClick={onClick}
      className={typographyClassName({
        inline,
        size,
        capitalize,
        uppercase,
        clickable: Boolean(onClick),
        mono,
        className,
      })}
      style={{
        color: getColorTextValue(color),
        fontWeight: WEIGHT_VALUE[weight],
        textAlign: align,
        justifyContent: align === Alignment.INHERIT ? undefined : align,
        width: toCssSize(width) ?? (align === Alignment.INHERIT ? "fit-content" : "100%"),
        maxWidth: toCssSize(maxWidth) ?? "100%",
        minWidth: toCssSize(minWidth) ?? "0px",
      }}
    >
      <span
        className={cn(
          overflow === TypographyOverflow.HIDDEN && "overflow-hidden text-ellipsis",
          wrap ? "whitespace-normal" : "whitespace-nowrap",
          !selectable && "select-none",
        )}
        style={{ textDecoration }}
      >
        {children}
      </span>
    </Comp>
  );
}

export { Typography };
