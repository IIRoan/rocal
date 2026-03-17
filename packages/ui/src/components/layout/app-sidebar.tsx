"use client";

import * as React from "react";
import { CheckIcon, GearSixIcon, ArrowLineLeftIcon, ArrowLineRightIcon } from "@phosphor-icons/react";
import { Sparkles, Calendar, Plus } from "lucide-react";
import { useCalendarContext } from "../calendar/calendar-context";
import { CalendarEvent, User, Calendar as CalendarData } from "../calendar/types";
import LogoSvg from "./logo";

import { NavUser } from "../navigation/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenuButton,
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
import { Checkbox } from "../ui/checkbox";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

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

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user?: User;
  onLogout?: () => void;
  onOpenSettings?: () => void;
  onOpenCalendarManagement?: () => void;
  onCreateEvent?: () => void;
  aiQuery?: string;
  onAiQueryChange?: (value: string) => void;
  onAiSubmit?: () => void;
  aiLoading?: boolean;
  aiResponse?: string;
  events?: CalendarEvent[];
  onMiniCalendarMonthChange?: (dateRange: { start: Date; end: Date }) => void;
  isMobile?: boolean;
}

export function AppSidebar({
  user,
  onLogout,
  onOpenSettings,
  onOpenCalendarManagement,
  onCreateEvent,
  aiQuery,
  onAiQueryChange,
  onAiSubmit,
  aiLoading,
  aiResponse,
  events,
  onMiniCalendarMonthChange,
  isMobile = false,
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
                <ArrowLineLeftIcon size={18} weight="bold" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Scrollable Dashboard Content */}
        <div className="flex-1 overflow-auto px-6 pb-10  space-y-2">
          {/* Main Action Hub */}
          <div className="space-y-4">
            {onCreateEvent && (
              <Button
                onClick={onCreateEvent}
                className="w-full h-16 gap-4 rounded-[24px] bg-primary text-primary-foreground hover:bg-primary/95 border-none shadow-xl shadow-primary/20 font-bold transition-all justify-start px-6 active:scale-[0.98]"
              >
                <div className="size-8 rounded-xl bg-white/20 flex items-center justify-center shadow-inner">
                  <Plus size={20} strokeWidth={3} />
                </div>
                <div className="flex flex-col items-start text-left">
                  <span className="text-[16px]">Create New Event</span>
                  <span className="text-[11px] font-medium opacity-70">Schedule something new</span>
                </div>
              </Button>
            )}
          </div>

          {/* Mini Calendar Widget - Restored functionality */}
          <div className="space-y-4">
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em] px-1">Calendar Preview</div>
            <div className="bg-muted/30 border border-border/50 rounded-[32px] p-5 shadow-sm">
              <SidebarCalendar
                events={events}
                onDisplayMonthChange={onMiniCalendarMonthChange}
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
                      <ArrowLineRightIcon size={28} weight="bold" />
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
  return <AppSidebarDesktop {...{ user, onLogout, onOpenSettings, onOpenCalendarManagement, onCreateEvent, aiQuery, onAiQueryChange, onAiSubmit, aiLoading, aiResponse, events, onMiniCalendarMonthChange, props }} />;
}

function AppSidebarDesktop({
  user,
  onLogout,
  onOpenSettings,
  onOpenCalendarManagement,
  onCreateEvent,
  aiQuery,
  onAiQueryChange,
  onAiSubmit,
  aiLoading,
  aiResponse,
  events,
  onMiniCalendarMonthChange,
  props,
}: {
  user?: User;
  onLogout?: () => void;
  onOpenSettings?: () => void;
  onOpenCalendarManagement?: () => void;
  onCreateEvent?: () => void;
  aiQuery?: string;
  onAiQueryChange?: (value: string) => void;
  onAiSubmit?: () => void;
  aiLoading?: boolean;
  aiResponse?: string;
  events?: CalendarEvent[];
  onMiniCalendarMonthChange?: (dateRange: { start: Date; end: Date }) => void;
  props: React.ComponentProps<typeof Sidebar>;
}) {
  const { calendars, toggleCalendarVisibility, isCalendarVisible } = useCalendarContext();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <Sidebar variant="inset" collapsible="icon" {...props} className="max-lg:p-3 lg:pe-1">
      <SidebarHeader>
        <div className="flex justify-between items-center gap-2">
          <a className="inline-flex" href="/">
            <LogoSvg width="32" height="32" className="text-foreground/80" />
          </a>
          {!isCollapsed && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={toggleSidebar}
              title="Collapse sidebar"
            >
              <ArrowLineLeftIcon size={16} />
            </Button>
          )}
        </div>
        {isCollapsed && (
          <div className="flex justify-center">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={toggleSidebar}
              title="Expand sidebar"
            >
              <ArrowLineRightIcon size={16} />
            </Button>
          </div>
        )}
      </SidebarHeader>
      <SidebarContent className="gap-0 mt-3 pt-3 border-t">
        {onCreateEvent && (
          <div className={isCollapsed ? "flex justify-center py-2" : "px-3 mb-3"}>
            {isCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={onCreateEvent}
                    className="h-10 w-10 rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/10 transition-all active:scale-95 border-none"
                    size="icon"
                  >
                    <Plus size={20} strokeWidth={3} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">New Event</TooltipContent>
              </Tooltip>
            ) : (
              <Button
                onClick={onCreateEvent}
                className="w-full h-11 justify-start gap-3 px-4 rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/10 transition-all active:scale-[0.98] border-none group"
              >
                <div className="flex items-center justify-center size-6 rounded-xl bg-white/20 group-hover:bg-white/30 transition-colors">
                  <Plus size={16} strokeWidth={3} />
                </div>
                <span className="font-bold text-[14px] tracking-tight text-white">New Event</span>
              </Button>
            )}
          </div>
        )}
        {!isCollapsed && (
          <SidebarGroup className="px-2">
            <SidebarCalendar
              events={events}
              onDisplayMonthChange={onMiniCalendarMonthChange}
            />
          </SidebarGroup>
        )}
        <div className={isCollapsed ? "mt-2 pt-2 border-t" : "mt-2 pt-2 border-t"}>
          {!isCollapsed && (
            <div className="flex items-center justify-between px-3 mb-2">
              <div className="text-[11px] font-semibold text-primary/70 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar size={14} strokeWidth={2.5} className="text-primary/40" />
                Calendars
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-primary/30 hover:text-primary hover:bg-primary/10 transition-colors"
                  onClick={onOpenCalendarManagement}
                  title="Calendar Settings"
                >
                  <GearSixIcon size={14} weight="bold" />
                </Button>
              </div>
            </div>
          )}
          <div className={isCollapsed ? "flex flex-col items-center gap-1 mt-2" : "px-2 space-y-0.5"}>
            {calendars.map((calendar) => (
              <div key={calendar.id} className={isCollapsed ? "" : ""}>
                {isCollapsed ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-sidebar-accent transition-colors"
                        onClick={() => toggleCalendarVisibility(calendar.id)}
                      >
                        <span
                          className={`size-2.5 rounded-full transition-opacity ${
                            !isCalendarVisible(calendar.id) && "opacity-40"
                          }`}
                          style={{
                            backgroundColor: calendar.color?.startsWith("#")
                              ? calendar.color
                              : `var(--color-event-${calendar.color || "default"})`,
                          }}
                        />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">{calendar.name}</TooltipContent>
                  </Tooltip>
                ) : (
                  <SidebarMenuButton
                    asChild
                    className="relative rounded-xl [&>svg]:size-auto justify-between has-focus-visible:border-ring has-focus-visible:ring-ring/50 has-focus-visible:ring-[3px] hover:bg-accent/50 transition-colors py-2 px-3 h-9"
                  >
                    <span>
                      <span className="font-medium flex items-center gap-3">
                        <Checkbox
                          id={calendar.id}
                          className="size-4 border-primary/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary transition-all"
                          checked={isCalendarVisible(calendar.id)}
                          onCheckedChange={() =>
                            toggleCalendarVisibility(calendar.id)
                          }
                        />
                        <label
                          htmlFor={calendar.id}
                          className={`text-[13px] font-medium cursor-pointer transition-colors ${
                            isCalendarVisible(calendar.id)
                              ? "text-foreground/90"
                              : "text-foreground/40 line-through"
                          }`}
                        >
                          {calendar.name}
                        </label>
                      </span>
                      <span
                        className="size-1.5 rounded-full"
                        style={{
                          backgroundColor: calendar.color?.startsWith("#")
                            ? calendar.color
                            : `var(--color-event-${calendar.color || "default"})`,
                        }}
                      ></span>
                    </span>
                  </SidebarMenuButton>
                )}
              </div>
            ))}
          </div>
        </div>

        {!isCollapsed && user?.hasAiAccess && onAiSubmit && onAiQueryChange && (
          <div className="mt-4 pt-4 border-t px-2 space-y-3">
            <div className="flex items-center justify-between px-1">
              <div className="text-[11px] font-semibold text-primary/70 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 fill-primary/10" />
                Assistant
              </div>
            </div>
            
            <div className="relative group/ai-input">
              <Textarea
                value={aiQuery || ""}
                onChange={(e) => onAiQueryChange(e.target.value)}
                placeholder="Message assistant..."
                className="min-h-[80px] w-full resize-none bg-accent/30 border-none focus-visible:ring-1 focus-visible:ring-primary/20 placeholder:text-muted-foreground/50 text-[13px] rounded-xl px-3 py-2.5 pr-10 transition-all group-hover/ai-input:bg-accent/50"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onAiSubmit();
                  }
                }}
              />
              <Button
                size="icon"
                variant="ghost"
                className="absolute bottom-1.5 right-1.5 h-7 w-7 text-primary/60 hover:text-primary hover:bg-primary/10 transition-colors"
                onClick={onAiSubmit}
                disabled={!!aiLoading || !(aiQuery || "").trim()}
              >
                {aiLoading ? (
                  <div className="size-3.5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                ) : (
                  <ArrowLineRightIcon size={16} weight="bold" />
                )}
              </Button>
            </div>

            {aiResponse && (
              <div className="relative px-2.5 py-2.5 bg-primary/[0.03] border border-primary/10 rounded-xl overflow-hidden group/response">
                <div className="absolute top-0 right-0 p-1 opacity-0 group-hover/response:opacity-100 transition-opacity">
                   <Sparkles className="h-3 w-3 text-primary/20" />
                </div>
                <AiResponseContent response={aiResponse} />
              </div>
            )}
          </div>
        )}
      </SidebarContent>
      <SidebarFooter className="gap-1">
        <NavUser
          user={
            user || {
              name: "Guest User",
              email: "guest@example.com",
              avatar: "",
            }
          }
          onLogout={onLogout}
          onOpenSettings={onOpenSettings}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
