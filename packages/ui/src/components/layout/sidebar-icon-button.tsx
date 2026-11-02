"use client";

import * as React from "react";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

/** Collapsed-state icon button with a right-aligned tooltip. */
export function SidebarIconButton({
  label,
  pressed,
  className,
  children,
  ...props
}: Omit<
  React.ComponentProps<typeof Button>,
  "aria-label" | "aria-pressed" | "variant" | "size"
> & {
  label: string;
  /** Set for toggles so assistive tech hears the on/off state. */
  pressed?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          {...props}
          variant="ghost"
          size="icon"
          className={`size-9 rounded-lg transition-colors hover:bg-muted/80 hover:text-foreground ${className ?? "text-muted-foreground/70"}`}
          aria-label={label}
          aria-pressed={pressed}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" align="center">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
