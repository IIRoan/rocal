"use client";

import { useState } from "react";
import { ChevronRight, CirclePlus, Plus, Tag } from "lucide-react";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/ui/sidebar";
import { cn } from "@workspace/ui/lib/utils";
import type { LabelDef } from "@/lib/mail/types";
import { resolveLabelDisplayColor } from "@/lib/mail/mail-label-colors";

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
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 rounded px-1 py-0.5 transition-colors hover:text-[var(--text-primary)]"
        >
          <ChevronRight
            size={12}
            strokeWidth={2.5}
            className={cn("shrink-0 transition-transform duration-150", expanded && "rotate-90")}
          />
          Labels
        </button>
        {onOpenLabels ? (
          <button
            type="button"
            onClick={onOpenLabels}
            disabled={isBusy}
            aria-label="Manage labels"
            title="Manage labels"
            className="flex size-6 cursor-pointer items-center justify-center rounded-md text-[var(--icon-tertiary)] transition-colors hover:bg-[var(--bg-cell-hover)] hover:text-[var(--icon-primary)] disabled:opacity-30"
          >
            <CirclePlus size={14} strokeWidth={2} />
          </button>
        ) : null}
      </div>
      {expanded ? (
        <SidebarMenu className="gap-1">
          {labels.map((label) => {
            const isSelected = activeLabelId === label.id;
            return (
              <SidebarMenuItem key={label.id}>
                <SidebarMenuButton
                  isActive={isSelected}
                  onClick={() => onSelectLabel(label.id)}
                >
                  <Tag
                    size={16}
                    strokeWidth={2}
                    style={{ color: resolveLabelDisplayColor(label.color) }}
                  />
                  <span className="truncate">{label.name}</span>
                </SidebarMenuButton>
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
