"use client";

import * as React from "react";
import { GearSixIcon } from "@phosphor-icons/react";
import {
  Check,
  Plus,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
} from "lucide-react";
import { useCalendarContext } from "../calendar/calendar-context";
import {
  type CalendarEvent,
  User,
  Calendar as CalendarData,
} from "../calendar/types";
import LogoSvg from "./logo";

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
import { SheetClose } from "../ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { SidebarCalendar } from "../navigation/sidebar-calendar";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { LogOut } from "lucide-react";
import { getColorSwatchValue } from "../calendar/utils";
import { SidebarAppSwitcher } from "./sidebar-app-switcher";

function CollapsedIconButton({
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

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user?: User;
  onLogout?: () => void;
  onOpenSettings?: () => void;
  onOpenCalendarManagement?: () => void;
  onOpenSearch?: () => void;
  onCreateEvent?: () => void;
  isMobile?: boolean;
  getCachedEventsForRange?: (range: {
    start: Date;
    end: Date;
  }) => CalendarEvent[] | undefined;
  prefetchRange?: (range: { start: Date; end: Date }) => void;
  activeApp?: "calendar" | "mail";
}

export function AppSidebar({
  user,
  onLogout,
  onOpenSettings,
  onOpenCalendarManagement,
  onOpenSearch,
  onCreateEvent,
  isMobile = false,
  getCachedEventsForRange,
  prefetchRange,
  activeApp = "calendar",
  ...props
}: AppSidebarProps) {
  const { calendars, isCalendarVisible, toggleCalendarVisibility } =
    useCalendarContext();
  const ownedCalendars = calendars.filter(
    (calendar) => calendar.kind === "owned",
  );
  const publicCalendars = calendars.filter(
    (calendar) => calendar.kind === "public_holiday",
  );
  const subscribedCalendars = calendars.filter(
    (calendar) =>
      calendar.kind !== "owned" && calendar.kind !== "public_holiday",
  );

  if (isMobile) {
    const initials =
      user?.name
        ?.split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase() || "GU";

    return (
      <div className="flex h-full w-full flex-col overflow-hidden overscroll-none bg-background">
        {/* Header */}
        <div className="safe-area-inset-top flex shrink-0 items-center justify-between border-b border-border/40 px-4 pb-2.5 pt-2.5">
          <div className="flex items-center gap-2.5">
            <LogoSvg className="size-7 text-primary" />
            <span
              className="text-[17px] tracking-[-0.04em] text-foreground"
              style={{ fontWeight: 380 }}
            >
              solace
            </span>
          </div>
          <div className="flex items-center gap-1">
            {onOpenSearch && (
              <SheetClose asChild>
                <button
                  onClick={onOpenSearch}
                  aria-label="Search"
                  className="size-9 flex items-center justify-center rounded-xl text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors active:scale-90"
                >
                  <Search size={18} strokeWidth={2} />
                </button>
              </SheetClose>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="outline-none active:scale-90 transition-transform">
                  <Avatar className="size-8 rounded-full">
                    <AvatarImage src={user?.avatar} alt={user?.name} />
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 rounded-xl">
                <div className="px-3 py-2.5">
                  <p className="text-sm font-semibold leading-none text-foreground">
                    {user?.name || "Guest"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {user?.email}
                  </p>
                </div>
                <DropdownMenuSeparator />
                <SheetClose asChild>
                  <DropdownMenuItem
                    className="gap-2.5 cursor-pointer"
                    onClick={onOpenSettings}
                  >
                    <GearSixIcon size={16} />
                    Settings
                  </DropdownMenuItem>
                </SheetClose>
                <DropdownMenuSeparator />
                <SheetClose asChild>
                  <DropdownMenuItem
                    className="gap-2.5 text-destructive focus:text-destructive cursor-pointer"
                    onClick={onLogout}
                  >
                    <LogOut size={16} />
                    Sign out
                  </DropdownMenuItem>
                </SheetClose>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex flex-1 flex-col gap-5 overflow-auto px-4 py-3">
          {/* New event CTA */}
          {onCreateEvent && (
            <SheetClose asChild>
              <Button
                onClick={onCreateEvent}
                variant="outline"
                className="h-10 w-full rounded-xl border-border/60 text-foreground/80 font-medium transition-colors active:scale-[0.98]"
                style={{ fontWeight: 470 }}
              >
                <Plus size={17} strokeWidth={2} />
                New event
              </Button>
            </SheetClose>
          )}

          {/* Mini calendar */}
          <div>
            <SidebarCalendar
              getCachedEventsForRange={getCachedEventsForRange}
              prefetchRange={prefetchRange}
              isMobile={true}
            />
          </div>

          {/* Calendars */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Calendars
              </span>
              <SheetClose asChild>
                <button
                  onClick={onOpenCalendarManagement}
                  className="text-muted-foreground/50 hover:text-foreground transition-colors"
                  aria-label="Manage calendars"
                >
                  <Settings2 size={14} strokeWidth={2.5} />
                </button>
              </SheetClose>
            </div>
            <div className="flex flex-col gap-1">
              {ownedCalendars.map((calendar: CalendarData) => {
                const isVisible = isCalendarVisible(calendar.id);
                const calColor = getColorSwatchValue(calendar.color || "blue");
                return (
                  <button
                    key={calendar.id}
                    type="button"
                    onClick={() => void toggleCalendarVisibility(calendar.id)}
                    aria-pressed={isVisible}
                    className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl transition-colors ${
                      isVisible
                        ? "bg-muted/50 text-foreground"
                        : "text-muted-foreground/60 hover:bg-muted/30"
                    }`}
                  >
                    <span
                      className="size-2.5 rounded-full shrink-0 transition-opacity"
                      style={{
                        backgroundColor: calColor,
                        opacity: isVisible ? 1 : 0.35,
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">
                      {calendar.name}
                    </span>
                    {isVisible && (
                      <Check
                        size={14}
                        strokeWidth={2.5}
                        className="shrink-0 text-foreground/70"
                      />
                    )}
                  </button>
                );
              })}

              {publicCalendars.length > 0 && (
                <>
                  <div className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    Public
                  </div>
                  {publicCalendars.map((calendar: CalendarData) => {
                    const isVisible = isCalendarVisible(calendar.id);
                    const calColor = getColorSwatchValue(
                      calendar.color || "blue",
                    );
                    return (
                      <button
                        key={calendar.id}
                        type="button"
                        onClick={() => void toggleCalendarVisibility(calendar.id)}
                        aria-pressed={isVisible}
                        className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl transition-colors ${
                          isVisible
                            ? "bg-muted/50 text-foreground"
                            : "text-muted-foreground/60 hover:bg-muted/30"
                        }`}
                      >
                        <span
                          className="size-2.5 rounded-full shrink-0 transition-opacity"
                          style={{
                            backgroundColor: calColor,
                            opacity: isVisible ? 1 : 0.35,
                          }}
                        />
                        <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">
                          {calendar.name}
                        </span>
                        {isVisible && (
                          <Check
                            size={14}
                            strokeWidth={2.5}
                            className="shrink-0 text-foreground/70"
                          />
                        )}
                      </button>
                    );
                  })}
                </>
              )}

              {subscribedCalendars.length > 0 && (
                <>
                  <div className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    Subscribed
                  </div>
                  {subscribedCalendars.map((calendar: CalendarData) => {
                    const isVisible = isCalendarVisible(calendar.id);
                    const calColor = getColorSwatchValue(
                      calendar.color || "blue",
                    );
                    return (
                      <button
                        key={calendar.id}
                        type="button"
                        onClick={() => void toggleCalendarVisibility(calendar.id)}
                        aria-pressed={isVisible}
                        className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl transition-colors ${
                          isVisible
                            ? "bg-muted/50 text-foreground"
                            : "text-muted-foreground/60 hover:bg-muted/30"
                        }`}
                      >
                        <span
                          className="size-2.5 rounded-full shrink-0 transition-opacity"
                          style={{
                            backgroundColor: calColor,
                            opacity: isVisible ? 1 : 0.35,
                          }}
                        />
                        <span className="min-w-0 flex-1 truncate text-left text-sm font-medium">
                          {calendar.name}
                        </span>
                        {isVisible && (
                          <Check
                            size={14}
                            strokeWidth={2.5}
                            className="shrink-0 text-foreground/70"
                          />
                        )}
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-safe-offset-5 pb-5 pt-3 border-t border-border/40 shrink-0">
          <SheetClose asChild>
            <Button
              variant="ghost"
              className="w-full h-11 rounded-xl bg-muted/50 hover:bg-muted font-medium text-sm transition-all active:scale-[0.98]"
            >
              Close
            </Button>
          </SheetClose>
        </div>
      </div>
    );
  }

  return (
    <AppSidebarDesktop
      {...{
        user,
        onLogout,
        onOpenSettings,
        onOpenCalendarManagement,
        onOpenSearch,
        onCreateEvent,
        getCachedEventsForRange,
        prefetchRange,
        activeApp,
        props,
      }}
    />
  );
}

function AppSidebarDesktop({
  user,
  onLogout,
  onOpenSettings,
  onOpenCalendarManagement,
  onOpenSearch,
  onCreateEvent,
  getCachedEventsForRange,
  prefetchRange,
  activeApp,
  props,
}: {
  user?: User;
  onLogout?: () => void;
  onOpenSettings?: () => void;
  onOpenCalendarManagement?: () => void;
  onOpenSearch?: () => void;
  onCreateEvent?: () => void;
  getCachedEventsForRange?: (range: {
    start: Date;
    end: Date;
  }) => CalendarEvent[] | undefined;
  prefetchRange?: (range: { start: Date; end: Date }) => void;
  activeApp: "calendar" | "mail";
  props: React.ComponentProps<typeof Sidebar>;
}) {
  const { calendars, isCalendarVisible, toggleCalendarVisibility } =
    useCalendarContext();
  const ownedCalendars = calendars.filter(
    (calendar) => calendar.kind === "owned",
  );
  const publicCalendars = calendars.filter(
    (calendar) => calendar.kind === "public_holiday",
  );
  const subscribedCalendars = calendars.filter(
    (calendar) =>
      calendar.kind !== "owned" && calendar.kind !== "public_holiday",
  );
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <Sidebar variant="inset" collapsible="icon" {...props}>
      {/* Header: logo + collapse toggle */}
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
              <CollapsedIconButton label="Search" onClick={onOpenSearch}>
                <Search size={15} strokeWidth={2} />
              </CollapsedIconButton>
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
        {/* Mini calendar (top, expanded only) */}
        {!isCollapsed && (
          <SidebarGroup className="px-3 pt-1 pb-3 shrink-0">
            <SidebarCalendar
              getCachedEventsForRange={getCachedEventsForRange}
              prefetchRange={prefetchRange}
            />
          </SidebarGroup>
        )}

        {/* New event CTA */}
        {onCreateEvent && (
          <SidebarGroup
            className={`px-2 shrink-0 ${isCollapsed ? "pt-2" : "pt-1"}`}
          >
            {isCollapsed ? (
              <SidebarGroupContent className="flex flex-col items-center">
                <CollapsedIconButton
                  label="New event"
                  onClick={onCreateEvent}
                  className="text-primary hover:bg-primary/10 hover:text-primary"
                >
                  <Plus size={18} strokeWidth={2.5} />
                </CollapsedIconButton>
              </SidebarGroupContent>
            ) : (
              <SidebarGroupContent>
                <Button
                  onClick={onCreateEvent}
                  variant="outline"
                  className="w-full h-9 rounded-xl border-border/60 text-foreground/80 font-medium text-[13px] hover:bg-muted/60 hover:text-foreground transition-colors"
                  style={{ fontWeight: 470 }}
                >
                  <Plus size={15} strokeWidth={2} />
                  New event
                </Button>
              </SidebarGroupContent>
            )}
          </SidebarGroup>
        )}

        {/* Calendars list */}
        <SidebarGroup
          className={`px-2 flex-1 overflow-y-auto ${isCollapsed ? "pt-2" : "pt-3"}`}
        >
          {isCollapsed ? (
            <SidebarGroupContent className="flex flex-col items-center gap-1">
              {calendars.map((calendar) => {
                const isVisible = isCalendarVisible(calendar.id);
                return (
                  <SidebarMenuItem
                    key={calendar.id}
                    className="flex justify-center list-none"
                  >
                    <CollapsedIconButton
                      label={calendar.name}
                      onClick={() => void toggleCalendarVisibility(calendar.id)}
                    >
                      <span
                        className="size-2.5 rounded-full shrink-0 transition-opacity"
                        style={{
                          backgroundColor: getColorSwatchValue(
                            calendar.color || "blue",
                          ),
                          opacity: isVisible ? 1 : 0.3,
                        }}
                      />
                    </CollapsedIconButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarGroupContent>
          ) : (
            <>
              <div className="flex items-center justify-between px-2 mb-1.5">
                <span className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                  Calendars
                </span>
                <button
                  onClick={onOpenCalendarManagement}
                  aria-label="Manage calendars"
                  className="text-muted-foreground/40 hover:text-foreground transition-colors"
                >
                  <Settings2 size={13} strokeWidth={2.5} />
                </button>
              </div>
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  {ownedCalendars.map((calendar) => {
                    const isVisible = isCalendarVisible(calendar.id);
                    return (
                      <SidebarMenuItem key={calendar.id}>
                        <SidebarMenuButton
                          onClick={() =>
                            void toggleCalendarVisibility(calendar.id)
                          }
                          className={`rounded-lg h-8 text-[13px] font-medium transition-colors cursor-pointer select-none ${
                            isVisible
                              ? "text-foreground"
                              : "text-muted-foreground/40"
                          }`}
                        >
                          <span
                            className="size-2 rounded-full shrink-0 transition-opacity"
                            style={{
                              backgroundColor: getColorSwatchValue(
                                calendar.color || "blue",
                              ),
                              opacity: isVisible ? 1 : 0.3,
                            }}
                          />
                          <span className="truncate">{calendar.name}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}

                  {publicCalendars.length > 0 && (
                    <SidebarMenuItem className="px-2 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/55 list-none">
                      Public
                    </SidebarMenuItem>
                  )}
                  {publicCalendars.map((calendar) => {
                    const isVisible = isCalendarVisible(calendar.id);
                    return (
                      <SidebarMenuItem key={calendar.id}>
                        <SidebarMenuButton
                          onClick={() =>
                            void toggleCalendarVisibility(calendar.id)
                          }
                          className={`rounded-lg h-8 text-[13px] font-medium transition-colors cursor-pointer select-none ${
                            isVisible
                              ? "text-foreground"
                              : "text-muted-foreground/40"
                          }`}
                        >
                          <span
                            className="size-2 rounded-full shrink-0 transition-opacity"
                            style={{
                              backgroundColor: getColorSwatchValue(
                                calendar.color || "blue",
                              ),
                              opacity: isVisible ? 1 : 0.3,
                            }}
                          />
                          <span className="truncate">{calendar.name}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}

                  {subscribedCalendars.length > 0 && (
                    <SidebarMenuItem className="px-2 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/55 list-none">
                      Subscribed
                    </SidebarMenuItem>
                  )}
                  {subscribedCalendars.map((calendar) => {
                    const isVisible = isCalendarVisible(calendar.id);
                    return (
                      <SidebarMenuItem key={calendar.id}>
                        <SidebarMenuButton
                          onClick={() =>
                            void toggleCalendarVisibility(calendar.id)
                          }
                          className={`rounded-lg h-8 text-[13px] font-medium transition-colors cursor-pointer select-none ${
                            isVisible
                              ? "text-foreground"
                              : "text-muted-foreground/40"
                          }`}
                        >
                          <span
                            className="size-2 rounded-full shrink-0 transition-opacity"
                            style={{
                              backgroundColor: getColorSwatchValue(
                                calendar.color || "blue",
                              ),
                              opacity: isVisible ? 1 : 0.3,
                            }}
                          />
                          <span className="truncate">{calendar.name}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </>
          )}
        </SidebarGroup>
      </SidebarContent>

      {/* Footer: user profile */}
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
