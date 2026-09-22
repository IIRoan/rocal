"use client";

import * as React from "react";
import Link from "next/link";
import { Search, PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";

import { type User } from "../calendar/types";
import LogoSvg from "./logo";
import { SidebarAppSwitcher } from "./sidebar-app-switcher";
import { SidebarIconButton } from "./sidebar-icon-button";
import { NavUser } from "../navigation/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "../ui/sidebar";
import { Button } from "../ui/button";

export interface SidebarShellProps
  extends Omit<React.ComponentProps<typeof Sidebar>, "children"> {
  /** Names the app in the header and highlights it in the switcher. */
  activeApp?: "calendar" | "mail";
  onOpenSearch?: () => void;
  /** Header profile selector. When omitted a Settings footer is shown (expanded only). */
  user?: User;
  onLogout?: () => void;
  onOpenSettings?: () => void;
  /** Scrollable body; receives collapsed state for compact rail variants. */
  children: (opts: { isCollapsed: boolean }) => React.ReactNode;
}

/** Shared sidebar chrome for Calendar and Mail. */
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

  const appName = activeApp === "mail" ? "Solace Mail" : "Solace Calendar";
  const brand = user ? (
    <NavUser
      user={user}
      appName={appName}
      isCollapsed={isCollapsed}
      onLogout={onLogout}
      onOpenSettings={onOpenSettings}
    />
  ) : (
    <Link className="inline-flex items-center gap-2 p-1" href="/">
      <LogoSvg width="26" height="26" className="shrink-0 text-primary" />
      {isCollapsed ? null : (
        <span className="text-[15px] tracking-[-0.04em] text-foreground">
          {appName}
        </span>
      )}
    </Link>
  );
  const headerButtonClassName =
    "size-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground";

  return (
    <Sidebar variant="inset" collapsible="icon" {...props}>
      <SidebarHeader
        className={
          isCollapsed
            ? "items-center gap-1 px-2 pt-3 pb-2"
            : "px-3 pt-3 pb-2"
        }
      >
        {isCollapsed ? (
          <>
            {brand}
            <SidebarAppSwitcher activeApp={activeApp} />
            {onOpenSearch && (
              <SidebarIconButton label="Search" onClick={onOpenSearch}>
                <Search size={15} strokeWidth={2} />
              </SidebarIconButton>
            )}
            <Button
              variant="ghost"
              size="icon"
              className={headerButtonClassName}
              onClick={toggleSidebar}
              aria-label="Expand sidebar"
            >
              <PanelLeftOpen size={16} strokeWidth={2} />
            </Button>
          </>
        ) : (
          <div className="flex items-center justify-between gap-1">
            {brand}
            <div className="flex shrink-0 items-center">
              {onOpenSearch && (
                <Button
                  variant="ghost"
                  size="icon"
                  className={headerButtonClassName}
                  onClick={onOpenSearch}
                  aria-label="Search"
                >
                  <Search size={15} strokeWidth={2} />
                </Button>
              )}
              <SidebarAppSwitcher activeApp={activeApp} />
              <Button
                variant="ghost"
                size="icon"
                className={headerButtonClassName}
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

      {user || isCollapsed ? null : (
        <SidebarFooter className="p-2 border-t border-border/40">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="rounded-lg h-9 text-[13px] font-medium text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors"
                onClick={onOpenSettings}
              >
                <Settings size={16} />
                Settings
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      )}

      <SidebarRail />
    </Sidebar>
  );
}
