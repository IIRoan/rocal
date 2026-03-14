"use client";

import * as React from "react";
import { RiCheckLine, RiAddLine, RiSettings3Line } from "@remixicon/react";
import { useCalendarContext } from "../calendar/calendar-context";
import { CalendarEvent } from "../calendar/types";
import LogoSvg from "./logo";

import { NavUser } from "../navigation/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarTrigger,
} from "../ui/sidebar";
import { SidebarCalendar } from "../navigation/sidebar-calendar";
import { Checkbox } from "../ui/checkbox";
import { Button } from "../ui/button";

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
                <RiAddLine size={16} />
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
                  <RiSettings3Line size={14} />
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
  return (
    <Sidebar variant="inset" {...props} className="max-lg:p-3 lg:pe-1">
      <SidebarHeader>
        <div className="flex justify-between items-center gap-2">
          <a className="inline-flex" href="/">
            <LogoSvg width="32" height="32" className="text-foreground/80" />
          </a>
          <SidebarTrigger className="text-muted-foreground/80 hover:text-foreground/80 hover:bg-transparent! hidden md:flex" />
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-0 mt-3 pt-3 border-t">
        {onCreateEvent && (
          <SidebarGroup className="px-1 mb-2">
            <Button onClick={onCreateEvent} className="w-full gap-2" size="sm">
              <RiAddLine size={16} />
              <span>New Event</span>
            </Button>
          </SidebarGroup>
        )}
        <SidebarGroup className="px-1">
          <SidebarCalendar
            events={events}
            onDisplayMonthChange={onMiniCalendarMonthChange}
          />
        </SidebarGroup>
        <SidebarGroup className="px-1 mt-3 pt-4 border-t">
          <div className="flex items-center justify-between">
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
                <RiSettings3Line size={14} />
              </Button>
            </div>
          </div>
          <SidebarGroupContent>
            <SidebarMenu>
              {calendars.map((calendar) => (
                <SidebarMenuItem key={calendar.id}>
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
                        <RiCheckLine
                          className="peer-not-data-[state=checked]:invisible"
                          size={16}
                          aria-hidden="true"
                        />
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
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
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
    </Sidebar>
  );
}
