"use client";

import * as React from "react";
import Link from "next/link";
import {
  CalendarDays,
  Mail,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
} from "lucide-react";

import { cn } from "../../lib/utils";
import { type User } from "../calendar/types";
import LogoSvg from "./logo";
import { SidebarIconButton } from "./sidebar-icon-button";
import { NavUser } from "../navigation/nav-user";
import { Sidebar, SidebarContent, SidebarRail, useSidebar } from "../ui/sidebar";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

const APPS = [
  { id: "mail", label: "Mail", href: "/mail", icon: Mail },
  { id: "calendar", label: "Calendar", href: "/calendar", icon: CalendarDays },
] as const;

const RAIL_BUTTON_CLASS =
  "flex size-9 items-center justify-center rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring";

export interface SidebarPrimaryAction {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}

export interface SidebarShellProps
  extends Omit<React.ComponentProps<typeof Sidebar>, "children"> {
  /** Names the app in the panel header and marks it in the rail. */
  activeApp?: "calendar" | "mail";
  onOpenSearch?: () => void;
  /** Opens the account menu from the rail avatar; without it the rail has no avatar. */
  user?: User;
  onLogout?: () => void;
  onOpenSettings?: () => void;
  /** Compose or New event: docked at the foot of the panel, and an accent icon in the collapsed rail. */
  primaryAction?: SidebarPrimaryAction;
  /** Panel body, or the compact list the collapsed rail shows under its own buttons. */
  children: (opts: { isCollapsed: boolean }) => React.ReactNode;
}

/** Shared sidebar for Calendar and Mail: one floating surface holding the app rail and the app's panel. */
export function SidebarShell({
  activeApp = "calendar",
  onOpenSearch,
  user,
  onLogout,
  onOpenSettings,
  primaryAction,
  children,
  ...props
}: SidebarShellProps) {
  const { state, isMobile, toggleSidebar } = useSidebar();
  // The mobile sheet always shows the panel, whatever the desktop collapse state is.
  const isCollapsed = !isMobile && state === "collapsed";
  const appName = activeApp === "mail" ? "Mail" : "Calendar";

  return (
    <Sidebar
      variant="floating"
      collapsible="icon"
      role="navigation"
      aria-label={`${appName} sidebar`}
      {...props}
    >
      <div className="flex h-full min-h-0">
        <SidebarAppRail
          activeApp={activeApp}
          isCollapsed={isCollapsed}
          onOpenSearch={onOpenSearch}
          user={user}
          onLogout={onLogout}
          onOpenSettings={onOpenSettings}
          primaryAction={primaryAction}
          onExpand={toggleSidebar}
        >
          {children}
        </SidebarAppRail>
        {isCollapsed ? null : (
          <SidebarPanel
            appName={appName}
            user={user}
            primaryAction={primaryAction}
            onCollapse={isMobile ? undefined : toggleSidebar}
          >
            {children({ isCollapsed })}
          </SidebarPanel>
        )}
      </div>

      <SidebarRail />
    </Sidebar>
  );
}

/** The always-visible rail: apps, search, settings and the account; collapsed it also carries the primary action and the app's compact list. */
function SidebarAppRail({
  activeApp,
  isCollapsed,
  onOpenSearch,
  user,
  onLogout,
  onOpenSettings,
  primaryAction,
  onExpand,
  children,
}: Pick<SidebarShellProps, "onOpenSearch" | "user" | "onLogout" | "onOpenSettings" | "primaryAction" | "children"> & {
  activeApp: "calendar" | "mail";
  isCollapsed: boolean;
  onExpand: () => void;
}) {
  return (
    <div className="flex w-(--sidebar-width-icon) shrink-0 flex-col items-center gap-1 py-3">
      <LogoSvg width="22" height="22" className="mb-2 shrink-0 text-accent" aria-hidden />
      {APPS.map((app) => (
        <RailAppLink key={app.id} app={app} active={app.id === activeApp} />
      ))}
      <span aria-hidden className="my-1 h-px w-6 bg-sidebar-border" />
      {onOpenSearch ? (
        <SidebarIconButton label="Search" onClick={onOpenSearch}>
          <Search size={16} strokeWidth={2} />
        </SidebarIconButton>
      ) : null}
      {isCollapsed ? (
        <>
          {primaryAction ? (
            <SidebarIconButton
              label={primaryAction.label}
              onClick={primaryAction.onClick}
              className="bg-accent text-accent-foreground hover:bg-accent/90 hover:text-accent-foreground"
            >
              {primaryAction.icon}
            </SidebarIconButton>
          ) : null}
          <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
            {children({ isCollapsed })}
          </div>
          <SidebarIconButton label="Expand sidebar" onClick={onExpand}>
            <PanelLeftOpen size={16} strokeWidth={2} />
          </SidebarIconButton>
        </>
      ) : (
        <span className="flex-1" />
      )}
      {onOpenSettings ? (
        <SidebarIconButton label="Settings" onClick={onOpenSettings}>
          <Settings size={16} strokeWidth={2} />
        </SidebarIconButton>
      ) : null}
      {user ? <NavUser user={user} onLogout={onLogout} onOpenSettings={onOpenSettings} /> : null}
    </div>
  );
}

/** The app's own panel: its name and account, its content, and the primary action at the foot. */
function SidebarPanel({
  appName,
  user,
  primaryAction,
  onCollapse,
  children,
}: {
  appName: string;
  user?: User;
  primaryAction?: SidebarPrimaryAction;
  /** Absent in the mobile sheet, which closes by itself. */
  onCollapse?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col border-l border-sidebar-border">
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <div className="grid min-w-0 flex-1 leading-[130%]">
          <span className="truncate text-[15px] font-semibold text-foreground">{appName}</span>
          {user ? <span className="truncate text-xs text-muted-foreground">{user.name || user.email}</span> : null}
        </div>
        {onCollapse ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onCollapse}
            aria-label="Collapse sidebar"
          >
            <PanelLeftClose size={16} strokeWidth={2} />
          </Button>
        ) : null}
      </div>
      <SidebarContent className="flex flex-col gap-0 overflow-hidden">{children}</SidebarContent>
      {primaryAction ? (
        <div className="shrink-0 p-3 pt-2">
          <Button onClick={primaryAction.onClick} className="w-full rounded-full shadow-none">
            {primaryAction.icon}
            {primaryAction.label}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function RailAppLink({
  app,
  active,
}: {
  app: (typeof APPS)[number];
  active: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={app.href}
          aria-label={app.label}
          aria-current={active ? "page" : undefined}
          className={cn(
            RAIL_BUTTON_CLASS,
            "cursor-pointer",
            active
              ? "bg-hover text-foreground"
              : "text-muted-foreground hover:bg-hover hover:text-foreground",
          )}
        >
          <app.icon size={16} strokeWidth={active ? 2.25 : 2} />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right" align="center">
        {app.label}
      </TooltipContent>
    </Tooltip>
  );
}
