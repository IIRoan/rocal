"use client";

import * as React from "react";
import { GearSixIcon } from "@phosphor-icons/react";
import { Plus, Search, PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { type User } from "../calendar/types";
import LogoSvg from "./logo";
import { SidebarAppSwitcher } from "./sidebar-app-switcher";
import { NavUser } from "../navigation/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "../ui/sidebar";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

/**
 * Collapsed-state icon button with a right-aligned tooltip. Shared by every
 * sidebar so collapsed sizing/spacing stays identical across apps.
 */
export function SidebarIconButton({
  label,
  onClick,
  className,
  children,
}: {
  label: string;
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`size-9 rounded-lg transition-colors hover:bg-muted/80 hover:text-foreground ${className ?? "text-muted-foreground/70"}`}
          onClick={onClick}
          aria-label={label}
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

export interface SidebarPrimaryActionProps {
  label: string;
  onClick?: () => void;
  /** Icon shown in the collapsed rail. Defaults to a plus glyph. */
  icon?: React.ReactNode;
  /** Tailwind classes applied to the collapsed icon button. */
  collapsedClassName?: string;
}

/**
 * The "New event" / "Compose" call-to-action. Renders as a full-width outline
 * button when expanded and a centred icon button when collapsed.
 */
export function SidebarPrimaryAction({
  label,
  onClick,
  icon,
  collapsedClassName,
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
            className="w-full h-9 rounded-xl border-border/60 text-foreground/80 font-medium text-[13px] hover:bg-muted/60 hover:text-foreground transition-colors"
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

export interface SidebarShellProps
  extends Omit<React.ComponentProps<typeof Sidebar>, "children"> {
  /** Highlights the active app in the header switcher. */
  activeApp?: "calendar" | "mail";
  onOpenSearch?: () => void;
  /** Footer user. When omitted a Settings fallback is shown (expanded only). */
  user?: User;
  onLogout?: () => void;
  onOpenSettings?: () => void;
  /**
   * Scrollable body content. Receives the collapsed state so consumers can
   * render compact rail variants without re-deriving it.
   */
  children: (opts: { isCollapsed: boolean }) => React.ReactNode;
}

/**
 * Shared sidebar chrome: a fixed-width inset `Sidebar` with a consistent
 * header (app switcher + search + collapse toggle), footer (user menu) and
 * rail. App-specific content is supplied via `children`, keeping width and
 * collapse behaviour identical between Calendar and Mail.
 */
export function SidebarShell({
  activeApp = "calendar",
  onOpenSearch,
  user,
  onLogout,
  onOpenSettings,
  children,
  ...props
}: SidebarShellProps) {
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <Sidebar variant="inset" collapsible="icon" {...props}>
      <SidebarHeader
        className={
          isCollapsed ? "items-center pt-4 px-2 pb-3" : "pt-4 px-4 pb-3"
        }
      >
        {isCollapsed ? (
          <>
            <a className="inline-flex justify-center" href="/">
              <LogoSvg width="28" height="28" className="text-primary" />
            </a>
            {onOpenSearch && (
              <SidebarIconButton label="Search" onClick={onOpenSearch}>
                <Search size={15} strokeWidth={2} />
              </SidebarIconButton>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-lg text-muted-foreground/50 hover:bg-muted/60 hover:text-foreground"
              onClick={toggleSidebar}
              aria-label="Expand sidebar"
            >
              <PanelLeftOpen size={16} strokeWidth={2} />
            </Button>
          </>
        ) : (
          <div className="flex items-center justify-between">
            <SidebarAppSwitcher activeApp={activeApp} />
            <div className="flex items-center gap-0.5">
              {onOpenSearch && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 rounded-lg text-muted-foreground/50 hover:bg-muted/60 hover:text-foreground"
                  onClick={onOpenSearch}
                  aria-label="Search"
                >
                  <Search size={15} strokeWidth={2} />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="size-8 rounded-lg text-muted-foreground/50 hover:bg-muted/60 hover:text-foreground"
                onClick={toggleSidebar}
                aria-label="Collapse sidebar"
              >
                <PanelLeftClose size={16} strokeWidth={2} />
              </Button>
            </div>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="gap-0 flex flex-col overflow-hidden">
        {children({ isCollapsed })}
      </SidebarContent>

      <SidebarFooter className="p-2 border-t border-border/40">
        {user ? (
          <NavUser
            user={user}
            onLogout={onLogout}
            onOpenSettings={onOpenSettings}
          />
        ) : isCollapsed ? null : (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="rounded-lg h-9 text-[13px] font-medium text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors"
                onClick={onOpenSettings}
              >
                <GearSixIcon size={16} weight="regular" />
                Settings
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
