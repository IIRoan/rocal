"use client";

import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/ui/popover";
import { SimpleTooltip } from "@workspace/ui/components/ui/tooltip";
import { cn } from "@workspace/ui/lib/utils";

/** The shared surface of compose's menus: sender, templates, signature and schedule. */
export const COMPOSE_MENU_CLASS =
  "z-[100] flex max-h-[min(28rem,calc(100dvh-6rem))] max-w-[calc(100dvw-2rem)] flex-col gap-0.5 overflow-y-auto rounded-xl p-1.5";

export const COMPOSE_TOOL_CLASS =
  "inline-flex size-[34px] shrink-0 cursor-pointer items-center justify-center rounded-[9px] text-[var(--icon-secondary)] transition-colors hover:bg-[var(--bg-overlay-tertiary)] hover:text-[var(--icon-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40";

export function ComposeMenuHeading({ children }: { children: ReactNode }) {
  return <p className="px-2.5 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">{children}</p>;
}

export function ComposeMenuNote({ children }: { children: ReactNode }) {
  return (
    <p className="mt-1 border-t border-[var(--border-tertiary)] px-2.5 pt-2 pb-1 text-[11.5px] leading-snug text-muted-foreground">
      {children}
    </p>
  );
}

/** A compose toolbar button whose menu opens above it under a heading named like the button. */
export function ComposeToolMenu({
  label,
  icon: Icon,
  disabled,
  className,
  children,
}: {
  label: string;
  icon: LucideIcon;
  disabled: boolean;
  className: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <SimpleTooltip content={label}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={label}
            className={cn(COMPOSE_TOOL_CLASS, open && "bg-[var(--bg-overlay-tertiary)] text-[var(--icon-primary)]")}
          >
            <Icon className="size-[17px]" />
          </button>
        </PopoverTrigger>
      </SimpleTooltip>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        // Focus returns to the body editor on insert, not to this trigger.
        onCloseAutoFocus={(event) => event.preventDefault()}
        className={cn(COMPOSE_MENU_CLASS, className)}
      >
        <ComposeMenuHeading>{label}</ComposeMenuHeading>
        {children(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  );
}
