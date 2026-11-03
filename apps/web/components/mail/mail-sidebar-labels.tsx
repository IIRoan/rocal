"use client";

import { useRef, useState, type ReactElement } from "react";
import { ChevronRight, CirclePlus, Plus, Tag } from "lucide-react";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/ui/sidebar";
import { cn } from "@workspace/ui/lib/utils";
import type { LabelDef } from "@/lib/mail/types";
import { resolveLabelDisplayColor } from "@workspace/calendar-core";
import {
  SimpleTooltip,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/ui/tooltip";

/** Full name on hover or keyboard focus, only when the `data-sidebar-name` child is cut short. */
export function TruncatedNameTooltip({
  name,
  children,
}: {
  name: string;
  children: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <Tooltip
      open={open}
      onOpenChange={(next) => {
        const label = triggerRef.current?.querySelector("[data-sidebar-name]");
        setOpen(next && !!label && label.scrollWidth > label.clientWidth);
      }}
    >
      <TooltipTrigger ref={triggerRef} asChild>
        {children}
      </TooltipTrigger>
      <TooltipContent side="right">{name}</TooltipContent>
    </Tooltip>
  );
}

export function MailSidebarLabels({
  labels,
  activeLabelId,
  isBusy,
  onSelectLabel,
  onOpenLabels,
}: {
  labels: LabelDef[];
  activeLabelId: string | null;
  isBusy: boolean;
  onSelectLabel: (labelId: string) => void;
  onOpenLabels?: () => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="mt-4">
      <div data-sidebar-heading className="pl-1">
        <h2 className="flex min-w-0 flex-1 font-medium tracking-normal">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 rounded px-1 py-0.5 transition-colors hover:text-[var(--text-primary)]"
          >
            <ChevronRight
              size={12}
              strokeWidth={2.5}
              className={cn(
                "shrink-0 transition-transform duration-150 motion-reduce:transition-none",
                expanded && "rotate-90",
              )}
            />
            Labels
          </button>
        </h2>
        {onOpenLabels ? (
          <SimpleTooltip content="Manage labels">
            <button
              type="button"
              onClick={onOpenLabels}
              disabled={isBusy}
              aria-label="Manage labels"
              className="flex size-6 cursor-pointer items-center justify-center rounded-md text-[var(--icon-tertiary)] transition-colors hover:bg-[var(--bg-cell-hover)] hover:text-[var(--icon-primary)] disabled:opacity-30"
            >
              <CirclePlus size={14} strokeWidth={2} />
            </button>
          </SimpleTooltip>
        ) : null}
      </div>
      {expanded ? (
        <SidebarMenu className="gap-1">
          {labels.map((label) => {
            const isSelected = activeLabelId === label.id;
            return (
              <SidebarMenuItem key={label.id}>
                <TruncatedNameTooltip name={label.name}>
                  <SidebarMenuButton
                    isActive={isSelected}
                    aria-current={isSelected ? "page" : undefined}
                    onClick={() => onSelectLabel(label.id)}
                  >
                    <Tag
                      size={16}
                      strokeWidth={2}
                      style={{ color: resolveLabelDisplayColor(label.color) }}
                    />
                    <span data-sidebar-name className="truncate">
                      {label.name}
                    </span>
                  </SidebarMenuButton>
                </TruncatedNameTooltip>
              </SidebarMenuItem>
            );
          })}
          {labels.length === 0 && onOpenLabels ? (
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={onOpenLabels}
                disabled={isBusy}
              >
                <Plus size={16} strokeWidth={2} />
                <span>New label</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}
        </SidebarMenu>
      ) : null}
    </div>
  );
}
