"use client";

import * as React from "react";
import { CheckIcon, GearSixIcon, FoldersIcon } from "@phosphor-icons/react";
import { Sparkles, Plus, Search, PanelLeftClose, PanelLeftOpen, SlidersHorizontal, Settings2, LogOut, ArrowRight } from "lucide-react";
import { useCalendarContext } from "../calendar/calendar-context";
import { type CalendarEvent, User, Calendar as CalendarData } from "../calendar/types";
import LogoSvg from "./logo";

import { NavUser } from "../navigation/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
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
import { Textarea } from "../ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { createPortal } from "react-dom";

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    }

    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={`${part}-${index}`}>{part.slice(1, -1)}</em>;
    }

    return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;
  });
}

function AiResponseContent({ response }: { response: string }) {
  const lines = response
    .split(/\r?\n/)
    .filter((line, index, all) => line.trim() || !!all[index - 1]?.trim());

  return (
    <div className="space-y-2 py-0.5">
      {lines.map((line, index) => {
        const trimmed = line.trim();
        const isBullet = trimmed.startsWith("- ") || trimmed.startsWith("* ");

        return (
          <div key={`${trimmed}-${index}`} className={isBullet ? "flex gap-2 items-start" : "leading-relaxed"}>
            {isBullet && (
              <span className="mt-1.5 size-1 rounded-full bg-primary/40 shrink-0" aria-hidden="true" />
            )}
            <span className="text-[12px] text-foreground/85">
              {renderInlineMarkdown(isBullet ? trimmed.slice(2) : line)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CollapsedSidebarIconButton({
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
          title={label}
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
  aiQuery?: string;
  onAiQueryChange?: (value: string) => void;
  onAiSubmit?: () => void;
  aiLoading?: boolean;
  aiResponse?: string;
  isMobile?: boolean;
  getCachedEventsForRange?: (range: { start: Date; end: Date }) => CalendarEvent[] | undefined;
  prefetchRange?: (range: { start: Date; end: Date }) => void;
}

export function AppSidebar({
  user,
  onLogout,
  onOpenSettings,
  onOpenCalendarManagement,
  onOpenSearch,
  onCreateEvent,
  aiQuery,
  onAiQueryChange,
  onAiSubmit,
  aiLoading,
  aiResponse,
  isMobile = false,
  getCachedEventsForRange,
  prefetchRange,
  ...props
}: AppSidebarProps) {
  const { calendars, toggleCalendarVisibility, isCalendarVisible } =
    useCalendarContext();

  // Mobile version - Full-screen immersive dashboard
  if (isMobile) {
    const initials = user?.name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase() || "GU";

    return (
      <div className="fixed inset-0 z-[100] flex flex-col h-[100dvh] w-full bg-background overflow-hidden overscroll-none">
        {/* Immersive Header */}
        <div className="flex items-center justify-between pt-6 pb-2 px-6 shrink-0">
          <div className="flex items-center gap-3">
   <div className="flex items-center justify-center size-10">
  <LogoSvg className="size-full text-primary" />
</div>
            <h1 className="text-xl font-extrabold tracking-tight text-foreground">Workspace</h1>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center justify-center transition-all active:scale-90 outline-none">
                <Avatar className="size-10 rounded-xl shadow-none">
                  <AvatarImage src={user?.avatar} alt={user?.name} className="rounded-xl" />
                  <AvatarFallback className="rounded-xl bg-transparent text-primary font-bold text-sm">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-2xl p-2 shadow-2xl border-primary/5">
              <div className="flex flex-col gap-1 p-3 mb-1">
                <p className="text-sm font-bold text-foreground leading-none">{user?.name || "Guest User"}</p>
                <p className="text-[11px] text-muted-foreground truncate">{user?.email || "guest@example.com"}</p>
              </div>
              <DropdownMenuSeparator className="bg-primary/5" />
              <DropdownMenuItem 
                className="rounded-xl h-11 px-3 font-bold text-sm gap-3 focus:bg-primary/5 focus:text-primary transition-colors cursor-pointer"
                onClick={onOpenSettings}
              >
                <GearSixIcon size={18} weight="bold" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-primary/5" />
              <DropdownMenuItem 
                className="rounded-xl h-11 px-3 font-bold text-sm gap-3 focus:bg-destructive/5 text-destructive focus:text-destructive transition-colors cursor-pointer"
                onClick={onLogout}
              >
                <LogOut size={18} />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Scrollable Dashboard Content */}
        <div className="flex-1 overflow-auto px-6 pb-10  space-y-2">
          {/* Main Action Hub */}
          <div className="flex justify-center py-2">
            {onCreateEvent && (
              <Button
                onClick={onCreateEvent}
                className="h-20 w-20 rounded-full bg-primary text-primary-foreground hover:bg-primary/95 border-none shadow-2xl shadow-primary/30 transition-all active:scale-95 flex flex-col items-center justify-center gap-1 group"
              >
                <Plus size={32} strokeWidth={3} className="transition-transform group-active:rotate-90" />
                <span className="text-[10px] font-black uppercase tracking-widest opacity-80">New</span>
              </Button>
            )}
          </div>

          {/* Mini Calendar Widget */}
          <div className="space-y-4">
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em] px-1">Calendar Preview</div>
            <div className="bg-muted/30 border border-border/50 rounded-[32px] p-5 shadow-sm">
              <SidebarCalendar
                getCachedEventsForRange={getCachedEventsForRange}
                prefetchRange={prefetchRange}
                isMobile={true}
              />
            </div>
          </div>

          {/* Calendars Management Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em]">Your Calendars</div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-3 rounded-lg text-[10px] font-black bg-muted text-muted-foreground uppercase tracking-widest"
                onClick={onOpenCalendarManagement}
              >
                Manage
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {calendars.map((calendar: CalendarData) => (
                <button
                  key={calendar.id}
                  onClick={() => toggleCalendarVisibility(calendar.id)}
                  className={`flex items-center justify-between gap-4 w-full p-4 rounded-[22px] border transition-all active:scale-[0.99] ${
                    isCalendarVisible(calendar.id) 
                      ? "bg-background border-border shadow-sm" 
                      : "bg-muted/20 border-transparent opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div 
                      className="size-6 rounded-lg flex items-center justify-center transition-all shadow-sm"
                      style={{ 
                        backgroundColor: isCalendarVisible(calendar.id) ? (calendar.color?.startsWith("#") ? calendar.color : `var(--color-event-${calendar.color || "default"})`) : "rgba(var(--foreground), 0.05)",
                        border: isCalendarVisible(calendar.id) ? "none" : "2px solid rgba(var(--foreground), 0.1)"
                      }}
                    >
                      {isCalendarVisible(calendar.id) && <CheckIcon size={16} weight="bold" color="white" />}
                    </div>
                    <span className={`text-[15px] font-bold transition-colors ${isCalendarVisible(calendar.id) ? "text-foreground" : "text-foreground/40"}`}>
                      {calendar.name}
                    </span>
                  </div>
                  <div 
                    className="size-2 rounded-full" 
                    style={{ backgroundColor: calendar.color?.startsWith("#") ? calendar.color : `var(--color-event-${calendar.color || "default"})` }} 
                  />
                </button>
              ))}
            </div>
          </div>

          {/* AI Intelligence Suite Section */}
          {user?.hasAiAccess && onAiSubmit && onAiQueryChange && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-2 px-1">
                <div className="text-[11px] font-extrabold text-primary uppercase tracking-[0.2em]">Assistant AI</div>
                <div className="h-[1px] flex-1 bg-primary/10" />
              </div>

              <div className="bg-primary/[0.03] border border-primary/10 rounded-[32px] overflow-hidden shadow-inner flex flex-col p-3 gap-3">
                {aiResponse && (
                  <div className="p-5 bg-background rounded-[24px] border border-primary/5 shadow-sm text-foreground/90 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles className="size-4 text-primary" />
                      <span className="text-[10px] font-black uppercase tracking-tighter text-primary/60">Response</span>
                    </div>
                    <AiResponseContent response={aiResponse} />
                  </div>
                )}
                
                <div className="relative">
                  <Textarea
                    value={aiQuery || ""}
                    onChange={(e) => onAiQueryChange(e.target.value)}
                    placeholder="Describe what you want to do..."
                    className="min-h-[140px] w-full resize-none bg-background border-none focus-visible:ring-2 focus-visible:ring-primary/30 placeholder:text-muted-foreground/30 text-[16px] font-bold rounded-[24px] p-6 pr-14 transition-all shadow-lg shadow-primary/[0.02]"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        onAiSubmit();
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    className="absolute bottom-4 right-4 size-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-2xl shadow-primary/40 transition-all active:scale-90"
                    onClick={onAiSubmit}
                    disabled={!!aiLoading || !(aiQuery || "").trim()}
                  >
                    {aiLoading ? (
                      <div className="size-6 border-[3px] border-white/20 border-t-white rounded-full animate-spin" />
                    ) : (
                      <ArrowRight size={22} strokeWidth={2.5} />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Global Action Bar Footer */}
        <div className="p-6 bg-background border-t border-border/50 shrink-0">
          <SheetClose asChild>
            <Button 
              variant="secondary"
              className="w-full h-14 rounded-[22px] bg-muted/50 text-foreground hover:bg-muted/80 font-bold text-base transition-all active:scale-[0.97] border-none shadow-none"
            >
              Back to Calendar
            </Button>
          </SheetClose>
        </div>
      </div>
    );
  }

  // Desktop version - high quality sidebar
  return <AppSidebarDesktop {...{ user, onLogout, onOpenSettings, onOpenCalendarManagement, onOpenSearch, onCreateEvent, aiQuery, onAiQueryChange, onAiSubmit, aiLoading, aiResponse, getCachedEventsForRange, prefetchRange, props }} />;
}

function AppSidebarDesktop({
  user,
  onLogout,
  onOpenSettings,
  onOpenCalendarManagement,
  onOpenSearch,
  onCreateEvent,
  aiQuery,
  onAiQueryChange,
  onAiSubmit,
  aiLoading,
  aiResponse,
  getCachedEventsForRange,
  prefetchRange,
  props,
}: {
  user?: User;
  onLogout?: () => void;
  onOpenSettings?: () => void;
  onOpenCalendarManagement?: () => void;
  onOpenSearch?: () => void;
  onCreateEvent?: () => void;
  aiQuery?: string;
  onAiQueryChange?: (value: string) => void;
  onAiSubmit?: () => void;
  aiLoading?: boolean;
  aiResponse?: string;
  getCachedEventsForRange?: (range: { start: Date; end: Date }) => CalendarEvent[] | undefined;
  prefetchRange?: (range: { start: Date; end: Date }) => void;
  props: React.ComponentProps<typeof Sidebar>;
}) {
  const { calendars, toggleCalendarVisibility, isCalendarVisible } = useCalendarContext();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <Sidebar variant="inset" collapsible="icon" {...props} className="max-lg:p-3">
      {onCreateEvent && typeof window !== "undefined" && createPortal(
        <div className="fixed bottom-6 right-6 z-[9999]">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={onCreateEvent}
                className="h-10 w-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-2xl shadow-primary/30 transition-all hover:scale-110 active:scale-95 border-none group"
                size="icon"
              >
                <Plus size={20} strokeWidth={2.5} className="transition-transform group-hover:rotate-90" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" className="font-bold">Create New Event</TooltipContent>
          </Tooltip>
        </div>,
        document.body
      )}
      <SidebarHeader className={isCollapsed ? "items-center pt-4 px-2 pb-2" : "pt-4 px-4 pb-2"}>
        {isCollapsed ? (
          <>
            <a className="inline-flex justify-center" href="/">
              <LogoSvg width="32" height="32" className="text-foreground/80" />
            </a>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-full text-muted-foreground/50 hover:bg-muted/60 hover:text-foreground"
              onClick={toggleSidebar}
              title="Expand sidebar"
              aria-label="Expand sidebar"
            >
              <PanelLeftOpen size={17} strokeWidth={2} />
            </Button>
          </>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <a className="inline-flex" href="/">
              <LogoSvg width="32" height="32" className="text-foreground/80" />
            </a>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-full text-muted-foreground/50 hover:bg-muted/60 hover:text-foreground"
              onClick={toggleSidebar}
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose size={17} strokeWidth={2} />
            </Button>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="gap-0 pt-5 pb-2 flex flex-col h-full">
        <SidebarGroup className="p-0">
          {isCollapsed ? (
            <SidebarGroupContent className="flex flex-col items-center gap-1.5">
              {onCreateEvent && (
                <CollapsedSidebarIconButton label="New event" onClick={onCreateEvent} className="text-primary hover:bg-primary/10 hover:text-primary">
                  <Plus size={18} strokeWidth={2.5} />
                </CollapsedSidebarIconButton>
              )}
              <CollapsedSidebarIconButton label="Search" onClick={onOpenSearch}>
                <Search size={17} strokeWidth={2} />
              </CollapsedSidebarIconButton>
              <CollapsedSidebarIconButton label="Settings" onClick={onOpenSettings}>
                <GearSixIcon size={17} weight="regular" />
              </CollapsedSidebarIconButton>
            </SidebarGroupContent>
          ) : (
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {onCreateEvent && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      className="rounded-lg h-9 text-[14px] font-semibold text-primary hover:bg-primary/10 hover:text-primary transition-colors"
                      onClick={onCreateEvent}
                    >
                      <Plus size={18} strokeWidth={2.5} />
                      New event
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                <SidebarMenuItem>
                  <SidebarMenuButton
                    className="rounded-lg h-9 text-[14px] font-medium text-muted-foreground/80 hover:bg-muted/80 hover:text-foreground transition-colors"
                    onClick={onOpenSearch}
                  >
                    <Search size={17} strokeWidth={2} />
                    Search
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    className="rounded-lg h-9 text-[14px] font-medium text-muted-foreground/80 hover:bg-muted/80 hover:text-foreground transition-colors"
                    onClick={onOpenSettings}
                  >
                    <GearSixIcon size={17} weight="regular" />
                    Settings
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          )}
        </SidebarGroup>

        <SidebarGroup className="p-0 mt-auto pt-4">
          {isCollapsed ? (
            <SidebarGroupContent className="flex flex-col items-center gap-1.5">
              <CollapsedSidebarIconButton label="Manage calendars" onClick={onOpenCalendarManagement}>
                <SlidersHorizontal size={16} strokeWidth={2} />
              </CollapsedSidebarIconButton>
              <SidebarMenu className="flex w-full flex-col items-center gap-1">
                {calendars.map((calendar) => {
                  const isVisible = isCalendarVisible(calendar.id);

                  return (
                    <SidebarMenuItem key={calendar.id} className="flex justify-center">
                      <CollapsedSidebarIconButton
                        label={calendar.name}
                        onClick={() => toggleCalendarVisibility(calendar.id)}
                        className={isVisible ? "text-foreground" : "text-muted-foreground/40 hover:text-muted-foreground/70"}
                      >
                        <span
                          className={`size-2.5 rounded-full shrink-0 transition-opacity ${
                            !isVisible ? "opacity-35" : ""
                          }`}
                          style={{
                            backgroundColor: calendar.color?.startsWith("#")
                              ? calendar.color
                              : `var(--color-event-${calendar.color || "default"})`,
                          }}
                        />
                      </CollapsedSidebarIconButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          ) : (
            <>
              <div className="mb-1 flex items-center justify-between px-2">
                <span className="text-[13px] font-bold text-foreground/65">Calendars</span>
                <button
                  onClick={onOpenCalendarManagement}
                  title="Manage calendars"
                  aria-label="Manage calendars"
                  className="text-muted-foreground/40 transition-colors hover:text-foreground"
                >
                  <Settings2 size={14} strokeWidth={2.5} />
                </button>
              </div>
              <SidebarGroupContent>
                <SidebarMenu className="gap-1">
                  {calendars.map((calendar) => (
                    <SidebarMenuItem key={calendar.id}>
                      <SidebarMenuButton
                        className={`rounded-lg h-9 text-[14px] font-medium transition-colors ${
                          isCalendarVisible(calendar.id)
                            ? "text-foreground hover:bg-muted/80"
                            : "text-muted-foreground/50 hover:bg-muted/40 hover:text-muted-foreground"
                        }`}
                        onClick={() => toggleCalendarVisibility(calendar.id)}
                      >
                        <span
                          className={`size-2.5 rounded-full shrink-0 transition-opacity ${
                            !isCalendarVisible(calendar.id) ? "opacity-35" : ""
                          }`}
                          style={{
                            backgroundColor: calendar.color?.startsWith("#")
                              ? calendar.color
                              : `var(--color-event-${calendar.color || "default"})`,
                          }}
                        />
                        <span className="truncate">
                          {calendar.name}
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </>
          )}
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-0 p-1">
        {!isCollapsed && (
          <SidebarGroup className="p-1">
            <SidebarCalendar
              getCachedEventsForRange={getCachedEventsForRange}
              prefetchRange={prefetchRange}
            />
          </SidebarGroup>
        )}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
