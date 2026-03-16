"use client";

import * as React from "react";
import { CheckIcon, PlusIcon, GearSixIcon, ArrowLineLeftIcon, ArrowLineRightIcon } from "@phosphor-icons/react";
import { Sparkles } from "lucide-react";
import { useCalendarContext } from "../calendar/calendar-context";
import { CalendarEvent } from "../calendar/types";
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
    <div className="space-y-1">
      {lines.map((line, index) => {
        const trimmed = line.trim();
        const isBullet = trimmed.startsWith("- ") || trimmed.startsWith("* ");

        return (
          <div key={`${trimmed}-${index}`} className={isBullet ? "flex gap-2" : undefined}>
            {isBullet && <span aria-hidden="true">•</span>}
            <span>{renderInlineMarkdown(isBullet ? trimmed.slice(2) : line)}</span>
          </div>
        );
      })}
    </div>
  );
}

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user?: {
    name: string;
    email: string;
    avatar?: string;
  };
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

  // Mobile version - render content directly without Sidebar wrapper
  if (isMobile) {
    return (
      <div className="flex flex-col h-full bg-background">
        {/* Header */}
        <div className="flex justify-between items-center gap-2 p-4 border-b">
          <a className="inline-flex" href="/">
            <LogoSvg width="32" height="32" className="text-foreground" />
          </a>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {/* New Event Button */}
          {onCreateEvent && (
            <div className="p-4 border-b">
              <Button
                onClick={onCreateEvent}
                className="w-full gap-2"
                size="sm"
              >
                <PlusIcon size={16} />
                <span>New Event</span>
              </Button>
            </div>
          )}
          {/* Mini Calendar Widget */}
          <div className="p-4 border-b">
            <SidebarCalendar
              events={events}
              onDisplayMonthChange={onMiniCalendarMonthChange}
            />
          </div>

          {/* Calendars Section */}
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-foreground uppercase tracking-wide">
                Calendars
              </h3>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={onOpenCalendarManagement}
                  title="Calendar Settings"
                >
                  <GearSixIcon size={14} />
                </Button>
              </div>
            </div>

            {/* Calendar List */}
            <div className="space-y-2">
              {calendars.map((calendar) => (
                <div
                  key={calendar.id}
                  className="flex items-center justify-between gap-3 p-2 rounded-md hover:bg-accent group"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <Checkbox
                      id={calendar.id}
                      checked={isCalendarVisible(calendar.id)}
                      onCheckedChange={() =>
                        toggleCalendarVisibility(calendar.id)
                      }
                    />
                    <label
                      htmlFor={calendar.id}
                      className={`text-sm font-medium cursor-pointer flex-1 ${
                        isCalendarVisible(calendar.id)
                          ? "text-foreground"
                          : "text-foreground/50 line-through"
                      }`}
                    >
                      {calendar.name}
                    </label>
                  </div>
                  <div
                    className="size-3 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: calendar.color?.startsWith("#")
                        ? calendar.color
                        : `var(--color-event-${calendar.color || "default"})`,
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          {onAiSubmit && onAiQueryChange && (
            <div className="p-4 border-t space-y-2">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                AI Calendar
              </div>
              <Textarea
                value={aiQuery || ""}
                onChange={(e) => onAiQueryChange(e.target.value)}
                placeholder="Ask to add, delete, or list events"
                className="min-h-[72px] resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onAiSubmit();
                  }
                }}
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={onAiSubmit}
                  disabled={!!aiLoading || !(aiQuery || "").trim()}
                >
                  {aiLoading ? "..." : "Go"}
                </Button>
              </div>
              {aiResponse && (
                <div className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  <AiResponseContent response={aiResponse} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-4">
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
        </div>
      </div>
    );
  }

  // Desktop version - use Sidebar wrapper
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
  user?: { name: string; email: string; avatar?: string };
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
          <div className={isCollapsed ? "flex justify-center py-2" : "px-2 mb-2"}>
            {isCollapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={onCreateEvent}
                    variant="default"
                    size="icon"
                    className="h-8 w-8"
                  >
                    <PlusIcon size={16} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">New Event</TooltipContent>
              </Tooltip>
            ) : (
              <Button onClick={onCreateEvent} className="w-full gap-2" size="sm">
                <PlusIcon size={16} />
                <span>New Event</span>
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
            <div className="flex items-center justify-between px-2">
              <SidebarGroupLabel className="uppercase text-muted-foreground/65">
                Calendars
              </SidebarGroupLabel>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={onOpenCalendarManagement}
                  title="Calendar Settings"
                >
                  <GearSixIcon size={14} />
                </Button>
              </div>
            </div>
          )}
          <div className={isCollapsed ? "flex flex-col items-center gap-1 mt-2" : "px-2"}>
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
                          className={`size-3 rounded-full transition-opacity ${
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
                    className="relative rounded-md [&>svg]:size-auto justify-between has-focus-visible:border-ring has-focus-visible:ring-ring/50 has-focus-visible:ring-[3px]"
                  >
                    <span>
                      <span className="font-medium flex items-center justify-between gap-3">
                        <Checkbox
                          id={calendar.id}
                          className="sr-only peer"
                          checked={isCalendarVisible(calendar.id)}
                          onCheckedChange={() =>
                            toggleCalendarVisibility(calendar.id)
                          }
                        />
                        <span className="peer-not-data-[state=checked]:invisible" aria-hidden="true">
                          <CheckIcon size={16} />
                        </span>
                        <label
                          htmlFor={calendar.id}
                          className="peer-not-data-[state=checked]:line-through peer-not-data-[state=checked]:text-muted-foreground/65 after:absolute after:inset-0"
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

        {!isCollapsed && onAiSubmit && onAiQueryChange && (
          <div className="mt-2 pt-2 border-t px-2 space-y-2">
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide px-1 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              AI Calendar
            </div>
            <Textarea
              value={aiQuery || ""}
              onChange={(e) => onAiQueryChange(e.target.value)}
              placeholder="Ask to add, delete, or list events"
              className="min-h-[72px] resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onAiSubmit();
                }
              }}
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                className="h-8 px-2"
                onClick={onAiSubmit}
                disabled={!!aiLoading || !(aiQuery || "").trim()}
              >
                {aiLoading ? "..." : "Go"}
              </Button>
            </div>
            {aiResponse && (
              <div className="text-xs text-muted-foreground leading-relaxed px-1 whitespace-pre-wrap">
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
