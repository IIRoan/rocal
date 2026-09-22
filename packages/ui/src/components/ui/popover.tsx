"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "radix-ui";

import { cn } from "@workspace/ui/lib/utils";

function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  showArrow = false,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content> & {
  showArrow?: boolean;
}) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        forceMount
        data-slot="popover-content"
        data-surface-motion=""
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "bg-popover text-popover-foreground z-50 w-72 max-w-[calc(100dvw-1rem)] rounded-md border p-4 shadow-md outline-hidden",
          className,
        )}
        {...props}
      >
        {props.children}
        {showArrow && (
          <PopoverPrimitive.Arrow className="fill-popover -my-px drop-shadow-[0_1px_0_hsl(var(--border))]" />
        )}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger };
