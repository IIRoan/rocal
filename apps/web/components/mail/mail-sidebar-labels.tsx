"use client";

import { useState } from "react";
import { ChevronRight, Plus, Tag } from "lucide-react";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/ui/sidebar";
import { cn } from "@workspace/ui/lib/utils";
import type { LabelDef } from "@/lib/mail/types";
import { resolveLabelDisplayColor } from "@/lib/mail/mail-label-colors";

const ROW_CLASS =
  "h-8 rounded-md pl-2 text-[15px] font-[380] transition-colors";

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
    <div className="group/labels mt-4">
      <div className="mb-0.5 flex h-7 items-center gap-1 pr-1 pl-1">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-[13px] font-[470] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
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
            className="flex size-6 cursor-pointer items-center justify-center rounded-md text-[var(--icon-tertiary)] opacity-0 transition-[opacity,color,background-color] hover:bg-[var(--bg-overlay-tertiary)] hover:text-[var(--icon-primary)] focus-visible:opacity-100 group-hover/labels:opacity-100 disabled:opacity-30"
          >
            <Plus size={14} strokeWidth={2.25} />
          </button>
        ) : null}
      </div>
      {expanded ? (
        <SidebarMenu className="gap-0.5">
          {labels.map((label) => {
            const isSelected = activeLabelId === label.id;
            return (
              <SidebarMenuItem key={label.id}>
                <SidebarMenuButton
                  className={cn(
                    ROW_CLASS,
                    isSelected
                      ? "bg-[var(--bg-overlay-tertiary)] text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-overlay-tertiary)] hover:text-[var(--text-primary)]",
                  )}
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
                className={cn(
                  ROW_CLASS,
                  "text-[var(--text-tertiary)] hover:bg-[var(--bg-overlay-tertiary)] hover:text-[var(--text-primary)]",
                )}
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
