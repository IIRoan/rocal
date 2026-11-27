"use client";

import {
  Button,
  IconButton,
  Size,
  Type,
  type ButtonProps,
  type IconButtonProps,
} from "@workspace/ui/solace";
import { cn } from "@workspace/ui/lib/utils";

const touchTarget = "pointer-coarse:min-h-11 pointer-coarse:min-w-11";
const actionShape = { height: "2rem", borderRadius: "var(--radius-lg)" };
const iconShape = { ...actionShape, width: actionShape.height };

export function ReaderActionButton({
  className,
  tone = Type.SECONDARY,
  ...props
}: Omit<ButtonProps, "size" | "style" | "type"> & { tone?: Type }) {
  return (
    <Button
      {...props}
      size={Size.SMALL}
      type={tone}
      style={actionShape}
      className={cn(touchTarget, "shrink-0 gap-1.5 px-2.5", className)}
    />
  );
}

export function ReaderActionIcon({
  className,
  tone = Type.SECONDARY,
  ...props
}: Omit<IconButtonProps, "size" | "style" | "type"> & { tone?: Type }) {
  return (
    <IconButton
      {...props}
      className={cn(touchTarget, className)}
      size={Size.SMALL}
      type={tone}
      style={iconShape}
    />
  );
}
