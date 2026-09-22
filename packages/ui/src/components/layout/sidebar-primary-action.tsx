"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import {
  SidebarGroup,
  SidebarGroupContent,
  useSidebar,
} from "../ui/sidebar";
import { Button } from "../ui/button";
import { SidebarIconButton } from "./sidebar-icon-button";

export interface SidebarPrimaryActionProps {
  label: string;
  onClick?: () => void;
  /** Icon shown in the collapsed rail. Defaults to a plus glyph. */
  icon?: React.ReactNode;
  /** Tailwind classes applied to the collapsed icon button. */
  collapsedClassName?: string;
  /** Extra classes on the expanded CTA. */
  className?: string;
}

/** Full-width outline CTA when expanded; centred icon when collapsed. */
export function SidebarPrimaryAction({
  label,
  onClick,
  icon,
  collapsedClassName,
  className,
}: SidebarPrimaryActionProps) {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <SidebarGroup className={`px-2 shrink-0 ${isCollapsed ? "pt-2" : "pt-1"}`}>
      {isCollapsed ? (
        <SidebarGroupContent className="flex flex-col items-center">
          <SidebarIconButton
            label={label}
            onClick={onClick}
            className={collapsedClassName}
          >
            {icon ?? <Plus size={18} strokeWidth={2.5} className="text-primary" />}
          </SidebarIconButton>
        </SidebarGroupContent>
      ) : (
        <SidebarGroupContent>
          <Button
            onClick={onClick}
            variant="outline"
            className={`w-full h-9 rounded-xl border-border/60 text-foreground/80 font-medium text-[13px] hover:bg-muted/60 hover:text-foreground transition-colors ${className ?? ""}`}
            style={{ fontWeight: 470 }}
          >
            <Plus size={15} strokeWidth={2} />
            {label}
          </Button>
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  );
}
